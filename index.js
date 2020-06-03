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

const Log = require("./lib/signalk-liblog/Log.js");
const Schema = require("./lib/signalk-libschema/Schema.js");
const SerialPort = require('./node_modules/serialport');
const ByteLength = require('./node_modules/@serialport/parser-byte-length')

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const DEBUG_OFF = 0;
const DEBUG_TRACE = 1;
const DEBUG_DIALOG = 2;
const DEBUG = DEBUG_OFF;

module.exports = function(app) {
	var plugin = {};
	var unsubscribes = [];

	plugin.id = "devantech";
	plugin.name = "Devantech relay module plugin";
	plugin.description = "Signal K interface to Devantech relay modules";

    const log = new Log(app.setProviderStatus, app.setProviderError, plugin.id);

	plugin.schema = function() {
        if (DEBUG & DEBUG_TRACE) log.N("plugin.schema()...", false);
        var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
        return(schema.getSchema());
    };

	plugin.uiSchema = function() {
        if (DEBUG & DEBUG_TRACE) log.N("plugin.uischema()...", false);
        var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
        return(schema.getSchema());
    }

	plugin.start = function(options) {
        if (DEBUG & DEBUG_TRACE) log.N("plugin.start(" + JSON.stringify(options) + ")...", false);

        // Begin by tidying up and getting rid of broken module definitions...
        options.modules = options.modules.filter(module => validateModuleDefinition(
            module,
            options.devices.reduce((a, device) => { return((device.id.split(' ').includes(module.deviceid))?device:a); }, null),
            { "onupdate": (DEBUG & DEBUG_DIALOG)?(msg) => { log.E(msg, false); }:null, "onerror": (err) => { log.E(err, false); } }
        ));

        if (options.modules.length) {
            log.N("connecting to " + options.modules.length + " relay module" + ((options.modules.length == 1)?"":"s"));

            // Write channel meta data to the SignalK tree so that presentation
            // applications can deploy it.
            var deltaValues = options.modules.reduce((a,sb) => a.concat(sb.channels.map(ch => { return({
                "path": options.global.switchpath.replace('{m}', sb.id).replace('{c}', ch.id) + ".meta",
                "value": { "type": ch.type, "name": ch.description }
            })})), []);
            var delta = { "updates": [ { "source": { "device": plugin.id }, "values": deltaValues } ] };
            app.handleMessage(plugin.id, delta);

            options.modules.forEach(module => connectModule(
                module,
                {
                    onupdate: (DEBUG & DEBUG_DIALOG)?(msg) => { log.N(msg, false); }:null,
                    onerror: (err) => { log.E(err, false); },
                    onopen: (module) => { 
                        module.unsubscribes = subscribe(module, options.global);
                        unsubscribes = unsubscribes.concat(module.unsubscribes);
                        var statuscmd = module.device.protocols.reduce((a,p) => { return((p.id == module.cobject.protocol)?p.status:null) ; }, null);
                        if (statuscmd) setTimeout(() => { module.connection.stream.write(statuscmd); }, 500);
                     },
                    ondata: (module, buffer) => {
                        processData(module, buffer, options.global);
                    },
                    onclose: (module) => {
                        module.unsubscribes.forEach(f => f());
                        unsubscribes = unsubscribes.filter(f => (!module.unsubscribes.contains(f)));
                        module.unsubscribes = [];
                    }
                }
            ));

            // Report module states
            // options.modules.forEach(module => {
            //});

        } else {
            log.N("there are no usable module definitions");
        }
    }

	plugin.stop = function() {
        if (DEBUG & DEBUG_TRACE) log.N("plugin.stop()...", false);
		unsubscribes.forEach(f => f());
		unsubscribes = [];
	}

    /**
     * parseConnectionString parses <cstring> into a connection object. A
     * properly formed <cstring> includes a field which specifies a connection
     * protocol and the format required of <cstring> and the structure of the
     * returned object are protocol dependent in the following ways.
     * 
     * Two <cstring> formats are accepted:
     *     "usb:pathname"
     *     "[[username:]password@]tcp:host:port"
     *
     * These are parsed respectively into objects of the form: 
     *     { protocol: 'usb', device: <pathname> }.
     *     { protocol: 'tcp', host: <host>, port: <port>, username: <username>, password: <password> }
     *
     * If <cstring> cannot be parsed null is returned. If any optional fields
     * are absent, the corresponding object properties will have the value
     * undefined.
     *
     * @param cstring - connection string to be parsed.
     * @return - connection object or null if parse fails.
     */
    function parseConnectionString(cstring) {
        if (DEBUG & DEBUG_TRACE) log.N("parseConnection(" + cstring + ")...", false);
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

    /**
     * Subscribes an anonymous action function to each of the channel trigger
     * paths in <module>. The action function serves to operate the channel
     * relay and to register the consequent state change in Signal K by issuing
     * an appropriate delta.
     * The unsubsubscribe function returned by trigger subscription is added to
     * the channel as a new property 'unsubscribe' and is also appended to the
     * global unsubscribes array.  In this way, an unrecoverable failure in
     * module communication can easily unsubscribe affected channels from
     * Signal K updates. 
     * @param module - the module whose channel triggers should be subscribed.
     * @param options - plugin global options.
     */
    function subscribe(module, options) {
        if (DEBUG & DEBUG_TRACE) log.N("subscribe(" + module.id + "," + JSON.stringify(options) + ")...", false);
        var unsubscribes = [];
        module.channels.forEach(channel => {
            var triggerPath = ((channel.trigger)?channel.trigger:options.trigger).replace('{m}', module.id).replace('{c}', channel.id);
            var triggerStates = (channel.triggerstates)?channel.triggerstates:options.triggerstates; 
            var triggerStream = getStreamFromPath(triggerPath, triggerStates);
            if (triggerStream) {
                channel.unsubscribe = triggerStream.onValue(v => {
                    var triggerCommand = getCommand(module, channel.index, ((v == 0)?0:1)); 
                    module.connection.stream.write(triggerCommand);
                    app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": [
                        { "path": options.switchpath.replace('{m}', module.id).replace('{c}', channel.id) + ".state", "value": ((v == 0)?0:1) }
                    ] }] });
                });
                unsubscribes.push(channel.unsubscribe);
            } else {
                log.E("unable to acquire stream for " + triggerPath, false);
            }
        });
        return(unsubscribes);
    }

    function unsubscribe(module) {
        if (DEBUG & DEBIG_TRACE) log.N("unsubscribe(" + module.id + ")...", false);
        var ufs = module.channels.map(channel => channel.unsubscribe);
        unsubscribes = unsubscribes.filter(f => { if (ufs.contains(f)) { f(); return(false); } else { return(true); } });
    }
        

    /**
     * validateModuleDefinition validates a <module> definition for compliance
     * with a <device> definition, returning a boolean result.
     *
     * As a side effect, the function will update the passed <module>,
     * normalising property values and applying internal defaults, so that on
     * successful validation the module definition is in good shape for
     * subsequent processing. This involves:
     *
     * 1. Adding <device> as module.device.
     * 2. Parsing module.cstring as module.cobject.
     * 3. Adding a module.channels array if no channels are defined.
     * 4. Adding channel id and name if channels don't define them.
     *
     * The <options> object can be used to supply 'onupdate' and 'onerror'
     * callback functions which will be used to report actions taken and errors
     * detected.
     * 
     * @param module - the module definition to be processed.
     * @param device - the device definition against which the module will be validated
     * @param options - supplying 'onupdate' and 'onerror' callbacks.
     * @return - true if module validates successfully, otherwise false.
     */ 
    function validateModuleDefinition(module, device, options) {
        if (DEBUG & DEBUG_TRACE) log.N("validateModuleDefinition(" + JSON.stringify(module) + "," + JSON.stringify(device) + "," + JSON.stringify(options) + ")...", false);
        const mF = [ "id", "description", "deviceid", "cstring" ]; // Module fields to be trimmed and normalised.
        const mR = [ "id", "deviceid", "cstring" ]; // Module fields that are required.
        var retval = true;

        // Trim, tidy and test for existence.
        mF.forEach(k => { module[k] = (module[k])?module[k].trim():null; if (module[k] == "") module[k] = null; });
        mR.forEach(k => { if (!module[k]) { ecallback("ignoring module '" + module.id + "' (missing '" + k + "' property)"); retval = false; } });

        // If a device is specified...
        if (module.device = device) {
            // Parse cstring into a cobject and if successful...
            if (module.cobject = parseConnectionString(module.cstring)) {
                // If device supports connection protocol...
                if (module.device.protocols.map(p => p.id).includes(module.cobject.protocol)) {
                    // If no channels are defined, then make some...
                    if (module.channels.length == 0) {
                        if (options && options.onupdate) options.onupdate("synthesising " + module.device.size + " channels for module '" + module.id);
                        for (var i = 1; i <= module.device.size; i++) module.channels.push({ "index": i });
                    }
                    // Check we don't have too many channels...
                    if (module.channels.length <= module.device.size) {
                        // If channel.id or channel.name are not defined, then make some defaults...
                        module.channels.forEach(c => {
                            c.id = (c.id)?c.id:("" + c.index);
                            c.name = (c.name)?c.name:(module.id + '[' + c.id + ']'); 
                        });
                    } else {
                        if (options && options.onerror) options.onerror("ignoring module '" + module.id + "' (zero or too many channels defined)");
                        retval = false;
                    } 
                } else {
                    if (options && options.onerror) options.onerror("ignoring module '" + module.id + "' (unsupported protocol '" + module.cobject.protocol + "')");
                    retval = false;
                }
            } else {
                if (options && options.onerror) options.onerror("ignoring module '" + module.id + "' (invalid connection string)");
            }
        } else {
            if (options && options.onerror) options.onerror("ignoring module '" + module.id + "' (invalid device id)");
            retval = false;
        }
        return(retval);
    }

    /**
     * connectModule attempts to connect <module> to its defined and configured
     * hardware device.  The passed module definition must have been validated
     * and prepared for use by a prior call to the validateModuleDefinition
     * function. <module> is updated with a module.connection object which is
     * used to hold configuration and state information relating the connected
     * module. Pretty much everything that goes on here is asynchronous in
     * character.
     *
     * The <options> object should be used to define a number of callbacks:
     *
     * onopen(module, required) will be called when a connection is
     * successfully opened and should be used to register the now functioning
     * module with Signal K by subscribing to trigger deltas.
     *
     * onclose(module) will be called if a connection spontaineously closes
     * and might be used to de-register the now non-functioning module from
     * Signal K by unsubscribing trigger deltas.
     *
     * onupdate will be called with explanatory messages as connections are
     * progressed.
     *
     * onerror will be called with diagnostic messages if connection fails. 
     *
     * @param module - the module definition to be processed.
     * @param options - various callbacks.
     */
    function connectModule(module, options) {
        if (DEBUG & DEBUG_TRACE) log.N("connectModule(" + module.id + "," + JSON.stringify(options) + ")...", false);
        var retval = false;
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
                    if (options && options.onopen) options.onopen(module);
                });
                break;
            case 'usb':
                module.connection = { stream: false };
                module.connection.serialport = new SerialPort(module.cobject.device);
                module.connection.serialport.on('open', () => {
                    if (options && options.onupdate) options.onupdate("serial port opened successfully for module " + module.id);
                    module.connection.stream = module.connection.serialport;
                    module.connection.parser = new ByteLength({ length: 1 });
                    module.connection.serialport.pipe(module.connection.parser);
                    module.connection.parser.on('data', (buffer) => {
                        if (options && options.onupdate) options.onupdate("serial data received from " + module.id);
                        if (options && options.ondata) options.ondata(module, buffer);
                    });
                    module.connection.serialport.on('close', () => {
                        if (options && options.onerror) options.onerror("serial port closed for " + module.id);
                        module.connection.stream = false;
                        if (options && options.onclose) options.onclose(module);
                    });
                    if (options && options.onopen) options.onopen(module);
                });
                break;
            default:
                if (options && options.onerror) options.onerror("module '" + module.id + " has an invalid connection protocol");
                break;
        }
    }

    /**
     * getCommand processes a <device> definition and returns the relay control
     * command that is specified for for switching <channel> to <state> using
     * the protocol specified in the <connectionParameters> "protocol"
     * property.
     *  
     * @param device - device definition from which to pull the command.
     * @param protocol - the protocol to use for communication with device.
     * @param channel - the channel to be operated.
     * @param state - the state to which the relay should be set (0 or 1).
     * @return - the required command string or null if command recovery fails.
     */
    function getCommand(module, channel, state) {
        if (DEBUG & DEBUG_TRACE) log.N("getCommand(" + module.id + "," + channel + "," + state + ")...", false);
        var retval = null;

        var deviceprotocol =  module.device.protocols.reduce((a,p) => { return((p.id == module.cobject.protocol)?p:a); }, null);
        if (deviceprotocol) {
            if ((deviceprotocol.commands.length == 1) && (deviceprotocol.commands[0].channel == 0)) {
                retval = deviceprotocol.commands[0][((state)?"on":"off")].replace("{c}", channel);
                retval = retval.replace('{C}', String.fromCharCode(parseInt(c, 10)));
            } else {
                retval = deviceprotocol.commands.reduce((a,c) => { return((c.channel == channel)?c[((state)?"on":"off")]:a); }, null);
            }
            if (deviceprotocol.authenticationtoken && (module.cobject.username || module.cobject.password)) {
                var A = deviceprotocol.authenticationtoken;
                if (module.cobject.username) A = A.replace('{u}', module.cobject.username);
                if (module.cobject.password) A = A.replace('{p}', module.cobject.password);
                retval = retval.replace('{A}', A);
            }
        }
        return(retval);
    }

    /**
     * getStreamFromPath returns a data stream for a specified <path> in the
     * Signal K host application defined by the <app> global, or null if
     * <app> cannot return a stream for <path>. Streams derived from a
     * notification stream have a filter applied which will convert values
     * appearing on the stream from a notification object to a truth value
     * (1 or 0) dependant upon whether or not the notification.state value is
     * a member of the <states> array.
     * @param path - Signal K data path for which a stream is required.
     * @param states - optional array of notification.state values.
     * @param dcallback - optional callback function which will be passed each value as it arrives on any generated stream.
     */ 
    function getStreamFromPath(path, states, dcallback) {
        if (DEBUG & DEBUG_TRACE) log.N("getStreamFromPath(" + path + "," + states + "," + dcallback + ")...", false);

        var stream = null;
        if ((path != null) && ((stream = app.streambundle.getSelfStream(path)) !== null)) {
            if (path.startsWith("notifications.")) stream = stream.map(v => ((v == null)?0:((states.includes(v.state))?1:0))).startWith(0);
            stream = stream.skipDuplicates();
            if (dcallback) stream = stream.doAction(v => dcallback(v));
        }
        return(stream);
    }

    /**
     * processData
     *
     * @param module -
     * @param buffer -
     * @param global -
     */
    function processData(module, buffer, global) {
        if (DEBUG & DEBUG_TRACE) log.N("processData(" + JSON.stringify(module) + "," + JSON.stringify(buffer) + "," + JSON.stringify(global) + ")...", false);
        switch (module.cobject.protocol) {
            case 'tcp':
                if (buffer.toString() == "fail") {
                    log.E("TCP command failure on module " + module.id);
                } else {
                }
                break;
            case 'usb':
                var state = (buffer)?buffer.readUInt8(0):null;
                if (global.switchpath) {
                    var deltaValues = [];
                    for (var i = 0; i < module.channels.length; i++) {
                        deltaValues.push({
                            "path": global.switchpath.replace('{m}', module.id).replace('{c}', module.channels[i].id) + ".state",
                            "value": (state & module.channels[i].statusmask)
                        });
                        state = (state >> 1);
                    }
                    app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": deltaValues }] });
                }
                break;
            default:
                break;
        }
    }

    return(plugin);
}
