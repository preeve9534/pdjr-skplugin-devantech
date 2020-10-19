/**
 * Copyright 2018 Paul Reeve <paul@pdjr.eu>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const DebugLog = require("./lib/signalk-liblog/DebugLog.js");
const Log = require("./lib/signalk-liblog/Log.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const SerialPort = require('./node_modules/serialport');
const ByteLength = require('./node_modules/@serialport/parser-byte-length')
const net = require('net');
const fs = require('fs');

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const DEBUG_KEYS = [ "state", "commands" ];

module.exports = function(app) {
  var plugin = {};
  var unsubscribes = [];

  plugin.id = "devantech";
  plugin.name = "Devantech interface";
  plugin.description = "Devantech relay module interface.";

  const log = new Log(plugin.id, { "ncallback": app.setPluginStatus, "ecallback": app.setPluginError });
  const debuglog = new DebugLog(plugin.id, DEBUG_KEYS);

  plugin.schema = function() {
    var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
    return(schema.getSchema());
  };

  plugin.uiSchema = function() {
    var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
    return(schema.getSchema());
  }

  plugin.start = function(options) {
    debuglog.N("*", "the following keys are available: %s", debuglog.getKeys().join(", "));

    /******************************************************************
     * Filter the module definitions in <options.modules>, eliminating
     * those module definitions that do not select a valid device and
     * those which cannot be made usable by validateModule().
     */

    options.modules = options.modules.reduce((a,m)  => {
      try { a.push(validateModule(m, options)); } catch(e) { log.E(e); }
      return(a);
    }, []);

    /******************************************************************
     * So now we have a, possibly empty, list of valid modules.
     */

    if (options.modules.length) {
      //log.N("connecting to %s relay module%s.", options.modules.length, ((options.modules.length == 1)?"":"s"));

      /****************************************************************
       * Iterate over each module, connecting it to its relay module
       * using whatever protocol is configured and arrange for callback
       * to this common set of functions.
       */

      options.modules.forEach(module => {

        /******************************************************************
         * Harvest documentary data from the defined switchbanks and write
         * it to the Signal K tree as meta information for each of the
         * specified switch channel paths.
         */

        var flattenedChannels = options.modules.reduce((a,sb) => a.concat(sb.channels.map(ch => { return({"instance": sb.id, "index": ch.index, "description": ch.description })})), []);
        var deltas = flattenedChannels.map(c => ({
          "path": options.switchpath.replace('{m}', c.instance).replace('{c}', c.index) + ".meta",
          "value": { "name": c.description, "type": "relay" }
        }));
        app.handleMessage(plugin.id, makeDelta(plugin.id, deltas));

        connectModule(module, {
          onerror: (err) => {
            debuglog.N("comms", "module %s: %s communication error (%s)", module.id, module.cobject.protocol, err);
          },
          onopen: (module) => { 
            debuglog.N("comms", "module %s: port %s open", module.id, module.cobject.device); 
          },
          ondata: (module, buffer) => {
            debuglog.N("comms", "module %s: %s data received", module.id, module.cobject.protocol);
            processData(module, buffer, options.switchpath);
          },
          onclose: (module) => {
            debuglog.N("comms", "module %s: %s port closed", module.id, module.cobject.protocol); 
          }
        });
      });

      /****************************************************************
       * Subscribe to the control path an process controls
       */
      var controlchannel = options.controlchannel.match(/^(.+)\:(.+)$/);
      if (controlchannel) {
        switch (controlchannel[1]) {
          case "notification":
            var stream = app.streambundle.getSelfStream(controlchannel[2]);
            if (stream) {
              log.N("listening on control channel %s", options.controlchannel);
              unsubscribes.push(stream.skipDuplicates().onValue(v => {
                console.log("MESSAGE RECD");
                var command = (v.description)?JSON.parse(v.description):{};
                var moduleid = (command.moduleid !== undefined)?command.moduleid:null;
                var channelid = (command.channelid !== undefined)?parseInt(command.channelid):null;
                var state = (command.state !== undefined)?parseInt(command.state):null;
                if ((moduleid !== null) && (channelid !== null) && (state !== null)) {
                  var module = options.modules.reduce((a,m) => ((m.id == moduleid)?m:a), null);
                  if (module !== null) {
                    debuglog.N("commands", "received command %s", JSON.stringify(command));
                    var command = getCommand(module, channelid, state);
                    if (command) {
                      module.connection.stream.write(command);
                      debuglog.N("commands", "transmitted operating command (%s) for module %s channel %d", command, module.id, channelid);
                    } else {
                      log.E("cannot recover operating command for module %s channel %d", module.id, channelid);
                    }
                  }
                }
              }));
            } else {
              log.E("unable to attach to control channel (%s)", options.controlchannel);
            }
            break;
          case "fifo":
          case "dbus":
          default:
            log.E("unimplemented control channel %s", options.controlchannel);
            break;
        }
      } else {
        log.E("bad control channel specification %s", options.controlchannel);
      }
    } else {
      log.W("there are no usable module definitions.");
    }
  }

  plugin.stop = function() {
    unsubscribes.forEach(f => f());
    unsubscribes = [];
  }

  /********************************************************************
   * Fettle up a module definition by normalising property values,
   * adding defaults for missing, optional, properties and attempting
   * to parse encoded properties into something useful.
   *
   * As a side effect, the function will update the passed <module>,
   * normalising property values and applying internal defaults, so
   * that on successful validation the module definition is in good
   * shape for subsequent processing. This involves:
   *
   * 1. Adding <device> as module.device.
   * 2. Parsing module.cstring as module.cobject.
   *
   * @param module - the module definition to be processed.
   * @param device - the device definition against which the module
   * will be validated
   * @return - true if module validates successfully, otherwise false.
   */ 

  function validateModule(module, options) {
    if (!module.deviceid) throw("module definition must include a device id");
    module.device = options.devices.reduce((a,d) => { return((d.id.split(' ').includes(module.deviceid))?d:a); }, null);
    if (module.device == null) throw("module device id is invalid (" + module.deviceid + ")");
    module.cobject = parseConnectionString(module.devicecstring);
    if (module.cobject == null) throw("module connection string is invalid (" + module.devicecstring + ")");
    if (!module.device.protocols.map(p => p.id).includes(module.cobject.protocol)) throw("unsupported protocol '" + module.cobject.protocol + "'");
    return(module);
  
    function parseConnectionString(cstring) {
      var retval = null;
      var matches, username = undefined, password = undefined, protocol = undefined, device = undefined, port = undefined;

      if (cstring.includes('@')) {
        [ password, cstring ] = cstring.split('@', 2).map(v => v.trim());
        if (password.contains(':')) [ username, password ] = password.split(':', 2).map(v => v.trim());
      }
      if (matches = cstring.match(/^tcp\:(.+)\:(\d+)/)) {
        retval = { "protocol": "tcp", "host": matches[1], "port": matches[2], "password": password };
      }
      if (matches = cstring.match(/^usb\:(.+)/)) {
        retval = { "protocol": "usb", "device": matches[1] };
      }
      return(retval);
    }
  }

  /********************************************************************
   * Attempts to connect <module> to its defined and configured
   * hardware device. <module> must have been validated and prepared
   * for use by a prior call to validateModuleDefinition().
   *
   * <module> is updated with a module.connection object propert which
   * is used to hold configuration and state information relating the
   * connected module. Pretty much everything that goes on here is
   * asynchronous in character.
   *
   * The <options> object should be used to define a number of
   * callbacks:
   *
   * onopen is required and defines a function which will be called
   * with <module> when a connection is successfully opened and
   * should be used to register the now functioning module with Signal
   * K by subscribing relay state change functions to each of the
   * module channel paths.
   *
   * onclose is optional and defines a function which will be called
   * with <module> if a connection spontaineously closes and should be
   * used to de-register the now non-functioning module from Signal K
   * by unsubscribing trigger deltas.
   *
   * onupdate will be called with explanatory messages as connections
   * are progressed.
   *
   * onerror will be called with diagnostic messages if connection
   * fails. 
   *
   * @param module - the module definition to be processed.
   * @param options - various callbacks.
   */

  function connectModule(module, options) {
    switch (module.cobject.protocol) {
      case 'tcp':
        module.connection = { stream: false };
        module.connection.socket = new net.createConnection(module.cobject.port, module.cobject.host, () => {
          if (options && options.onupdate) options.onupdate("TCP socket opened for module " + module.id);
          module.connection.stream = module.connection.socket;
          module.connection.socket.on('data', (buffer) => {
            if (options && options.onupdate) options.onupdate("TCP data received from " + module.id + " [" + buffer.toString() + "]");
            if (options && options.ondata) options.ondata(module, buffer)
          });
          module.connection.socket.on('close', () => {
            if (options && options.onerror) options.onerror("TCP socket closed for " + module.id);
            module.connection.stream = false;
            if (options && options.onclose) options.onclose(module);
          });
          module.connection.socket.on('end', () => {
            if (options && options.onerror) options.onerror("TCP socket ended for " + module.id);
          });
          if (options && options.onopen) options.onopen(module);
        });
        break;
      case 'usb':
        module.connection = { stream: false };
        module.connection.serialport = new SerialPort(module.cobject.device, { baudRate: 19200 }, (err) => {
          if (err) {
            options.onerror(module);
          }
        });
        module.connection.serialport.on('open', () => {
          module.connection.stream = module.connection.serialport;
          module.connection.parser = new ByteLength({ length: 1 });
          module.connection.serialport.pipe(module.connection.parser);
          options.onopen(module);
          module.connection.parser.on('data', (buffer) => {
            options.ondata(module, buffer);
          });
          module.connection.serialport.on('close', () => {
            module.connection.stream = false;
            options.onclose(module);
          });
          module.connection.serialport.on('error', () => {
            module.connection.stream = false;
            options.onerror(module);
          });
        });
        break;
      default:
        break;
    }
  }

  /********************************************************************
   * Processes a <device> definition and returns the relay control
   * command that is specified for for switching <channel> to <state>
   * using * the protocol specified in the <connectionParameters>
   * "protocol" property.
   *  
   * @param device - device definition from which to pull the command.
   * @param protocol - the protocol to use for communication with
   * device.
   * @param channel - the channel to be operated.
   * @param state - the state to which the relay should be set (0 or
   * 1).
   * @return - the required command string or null if command recovery
   * fails.
   */

  function getCommand(module, channelid, state) {
    var retval = null;

    var deviceprotocol =  module.device.protocols.reduce((a,p) => { return((p.id == module.cobject.protocol)?p:a); }, null);
    if (deviceprotocol) {
      if ((deviceprotocol.commands.length == 1) && (deviceprotocol.commands[0].channel == 0)) {
        retval = deviceprotocol.commands[0][((state)?"on":"off")];
      } else {
        deviceprotocol.commands.forEach(c => { if (c.channel == channelid) retval = c[((state)?"on":"off")]; });
      }
      if (retval) {
        retval = retval.replace('{A}', deviceprotocol.authenticationtoken);
        retval = retval.replace("{c}", channelid);
        retval = retval.replace('{C}', String.fromCharCode(parseInt(channelid, 10)));
        retval = retval.replace("{p}", channelid);
        retval = retval.replace("{u}", channelid);
        retval = retval.replace(/\\(\d\d\d)/gi, (match) => String.fromCharCode(parseInt(match, 8)));
        retval = retval.replace(/\\0x(\d\d)/gi, (match) => String.fromCharCode(parseInt(match, 16)));
      }
    }
    return(retval);
  }

    /**
     * processData
     *
     * @param module -
     * @param buffer -
     * @param global -
     */
  function processData(module, buffer, switchpath) {
    if (switchpath) {
      var protocol = module.device.protocols.reduce((a,p) => ((p.id == module.cobject.protocol)?p:a), null);
      if (protocol) {
        switch (protocol.id) {
          case 'tcp':
            if (buffer.toString() == "fail") {
              log.E("TCP command failure on module " + module.id);
            } else {
            }
            break;
          case 'usb':
            var state = (buffer)?buffer.readUInt8(0):null;
            var deltaValues = [];
            protocol.commands.forEach(cmd => {
              deltaValues.push({
                "path": switchpath.replace('{m}', module.id).replace('{c}', cmd.channel) + ".state",
                "value": (state & 0x01)
              });
              state = (state >> 1);
            });
            app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": deltaValues }] });
            break;
          default:
            break;
        }
      }
    }
  }

  /********************************************************************
   * Return a delta from <pairs> which can be a single value of the
   * form { path, value } or an array of such values. <src> is the name
   * of the process which will issue the delta update.
   */

  function makeDelta(src, pairs = []) {
    pairs = (Array.isArray(pairs))?pairs:[pairs]; 
    return({
      "updates": [{
        "source": { "type": "plugin", "src": src, },
        "timestamp": (new Date()).toISOString(),
        "values": pairs.map(p => { return({ "path": p.path, "value": p.value }); }) 
      }]
    });
  }

  return(plugin);

}
