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

const Log = require("./lib/log.js");
const Schema = require("./lib/schema.js");
const SerialPort = require('./node_modules/serialport');
const ByteLength = require('./node_modules/@serialport/parser-byte-length')

const PLUGIN_SCHEMA_FILE = __dirname + "/schema.json";
const PLUGIN_UISCHEMA_FILE = __dirname + "/uischema.json";
const DEBUG_OFF = 0;
const DEBUG_TRACE = 1;
const DEBUG_DIALOG = 2;
const DEBUG = DEBUG_DIALOG;

module.exports = function(app) {
	var plugin = {};
	var unsubscribes = [];

	plugin.id = "devantech";
	plugin.name = "Devantech relay module plugin";
	plugin.description = "Signal K interface to Devantech relay modules";

    const log = new Log(app.setProviderStatus, app.setProviderError, plugin.id);

	plugin.schema = function() {
        if (DEBUG & DEBUG_TRACE) console.log("plugin.schema()...");
        var schema = Schema.createSchema(PLUGIN_SCHEMA_FILE);
        return(schema.getSchema());
    };

	plugin.uiSchema = function() {
        if (DEBUG & DEBUG_TRACE) console.log("plugin.uischema()...");
        var schema = Schema.createSchema(PLUGIN_UISCHEMA_FILE);
        return(schema.getSchema());
    }

	plugin.start = function(options) {
        if (DEBUG & DEBUG_TRACE) console.log("plugin.start(%s)...", JSON.stringify(options));

        options.modules = options.modules.filter(module => validateModule(
            module,
            options.devices.reduce((a, device) => { return((device.id == module.deviceid)?device:a); }, null),
            (DEBUG & DEBUG_DIALOG)?(msg) => { log.E(msg, false); }:null,
            (err) => { log.E(err, false); }
        ));

        options.modules = options.modules.filter(module => connectModule(
            module,
            options.global,
            (DEBUG & DEBUG_DIALOG)?(msg) => { log.N(msg, false); }:null,
            (err) => { log.E(err, false); }
        ));

        if (options.modules.length) {
            log.N("connected to " + options.modules.length + " relay module" + ((options.modules.length == 1)?"":"s"));

            // Write channel meta data to the SignalK tree so that presentation
            // applications can deploy it.
            var deltaValues = options.modules.reduce((a,sb) => a.concat(sb.channels.map(ch => { return({
                "path": options.global.switchpath.replace('{m}', sb.id).replace('{c}', ch.id) + ".meta",
                "value": { "type": ch.type, "name": ch.description }
            })})), []);
            var delta = { "updates": [ { "source": { "device": plugin.id }, "values": deltaValues } ] };
            app.handleMessage(plugin.id, delta);

            // Report module states
            // options.modules.forEach(module => {
            //module.port.write(module.statuscommand, err => { if (err) console.log("error writing status request"); });
            //});

        } else {
            log.N("there are no usable module configurations");
        }
    }

	plugin.stop = function() {
        if (DEBUG & DEBUG_TRACE) console.log("plugin.stop()...");
		unsubscribes.forEach(f => f());
		unsubscribes = [];
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
        var m = module;
        module.channels.forEach(channel => {
            var c = channel;
            var triggerPath = ((c.trigger)?c.trigger:options.trigger).replace('{m}', m.id).replace('{c}', c.id);
            var triggerStates = (c.triggerstates)?c.triggerstates:options.triggerstates; 
            var triggerStream = getStreamFromPath(triggerPath, triggerStates);
            if (triggerStream) {
                c.unsubscribe = triggerStream.onValue(v => {
                    var triggerCommand = getCommand(m.device, m.cstring.split(':',1)[0], c.index, ((v == 0)?0:1)); 
                    m.connection.stream.write(triggerCommand);
                    app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": [
                        { "path": options.switchpath.replace('{m}', m.id).replace('{c}', c.id) + ".state", "value": ((v == 0)?0:1) }
                    ] }] });
                });
                unsubscribes.push(c.unsubscribe);
            } else {
                log.E("unable to acquire stream for " + triggerPath, false);
            }
        });
    }

    function unsubscribe(module) {
        var ufs = module.channels.map(channel => channel.unsubscribe);
        unsubscribes = unsubscribes.filter(f => { if (ufs.contains(f)) { f(); return(false); } else { return(true); } });
    }
        

    /*
     * validateModule processes a module definition, normalising property
     * values, applying internal defaults and, as a last resort rejecting a
     * badly formed or incomplete definition. If callback functions are
     * supplied, then messages reporting actions taken will be passed back
     * via these interfaces.
     * @param module - the module definition to be processed.
     * @param ncallback - callback for non-fatal notification messages.
     * @param ecallback - callback for fatal error messages.
     * @return - true if module is OK, otherwise false.
     */ 
    function validateModule(module, device, ncallback, ecallback) {
        if (DEBUG & DEBUG_TRACE) console.log("validateModule(%s)...", JSON.stringify(module));
        const mF = [ "id", "deviceid", "cstring", "name" ];
        const mR = [ "id", "deviceid", "cstring" ];
        
        var retval = true;
        mF.forEach(k => { module[k] = (module[k])?module[k].trim():null; if (module[k] == "") module[k] = null; });
        mR.forEach(k => { if (!module[k]) { ecallback("ignoring module '" + module.id + "' (missing '" + k + "' property)"); retval = false; } });

        if (device) {
            var protocol = module.cstring.split(':')[0];
            if (device.protocols.map(p => p.id).includes(protocol)) {
                module.device = device;
                if (module.channels.length == 0) {
                    ncallback("synthesising " + device.size + " channels for module '" + module.id);
                    for (var i = 1; i <= device.size; i++) module.channels.push({ "index": i });
                }
                if (module.channels.length <= device.size) {
                    module.channels.map(c => {
                        c.id = (c.id)?c.id:("" + c.index);
                        c.name = (c.name)?c.name:(module.id + '[' + c.id + ']'); 
                    });
                } else {
                    ecallback("ignoring module '" + module.id + "' (zero or too many channels defined)");
                    retval = false;
                } 
            } else {
                ecallback("ignoring module '" + module.id + "' (unsupported protocol '" + protocol + "')");
                retval = false;
            }
        } else {
            ecallback("ignoring module '" + module.id + "' (invalid device id)");
            retval = false;
        }
        return(retval);
    }

    /**
     * connectModule attempts to connect a module to its specified device
     * using the connection information supplied in the module's cstring
     * property. If the attempt appears to be successful, then a connection
     * object is added to the module and the function returns true. If a
     * problem is encountered then the function returns false. If callbacks
     * functions are supplied, then messages reporting actions taken and
     * problems encountered will be passed back via these interfaces.
     * @param module - the module definition to be processed.
     * @param options - the options.global object.
     * @param ncallback - callback for non-fatal notification messages.
     * @param ecallback - callback for fatal error messages.
     * @return - true if module is OK, otherwise false.
     */
    function connectModule(module, options, ncallback, ecallback) {
        if (DEBUG & DEBUG_TRACE) log.N("connectModule(%s, %s, %s, %s)...", module, JSON.stringify(options), ncallback, ecallback);
        var retval = false;
        switch (module.cstring.split(':')[0]) {
            case 'http': case 'https':
                break;
            case 'tcp':
                var [ dummy, host, port ] = module.cstring.split(':');
                if (host && port) {
                    module.connection = { stream: false };
                    module.connection.socket = new net.createConnection(port, host, () => {
                        if (ncallback) ncallback("TCP socket opened for module " + module.id);
                        module.connection.stream = module.connection.socket;
                        module.connection.socket.on('data', (buffer) => {
                            if (ncallback) ncallback("TCP data received from " + module.id + " [" + buffer.toString() + "]");
                            processTcpData(buffer.toString(), module)
                        });
                        module.connection.socket.on('close', () => {
                            if (ecallback) ecallback("TCP socket closed for " + module.id);
                            module.connection.stream = false;
                            unsubscribe(module);
                        });
                        subscribe(module, options);
                    });
                    retval = true;
                } else {
                    if (ecallback) ecallback("ignoring module '" + module.id + "' (bad or missing port/hostname)");
                }
                break;
            case 'usb':
                var [ dummy, path ] = module.cstring.split(':');
                if (path) {
                    module.connection = { stream: false };
                    module.connection.serialport = new SerialPort(path);
                    module.connection.serialport.on('open', () => {
                        if (ncallback) ncallback("serial port opened for module " + module.id);
                        module.connection.stream = module.connection.serialport;
                        module.connection.parser = new ByteLength({ length: 1 });
                        module.connection.serialport.pipe(module.connection.parser);
                        module.connection.parser.on('data', (buffer) => {
                            if (ncallback) ncallback("serial data received from " + module.id);
                            processUsbData(buffer, module, options.switchpath);
                        });
                        module.connection.serialport.on('close', () => {
                            if (ecallback) ecallback("serial port closed for " + module.id);
                            module.connection.stream = false;
                            unsubscribe(module);
                        });
                        subscribe(module, options);
                        var statusCommand = module.device.protocols.reduce((a,p) => { return((p.id == 'usb')?p['status']:a); }, null);
                        if (statusCommand) module.connection.stream.write(statusCommand);
                    });
                    retval = true;
                } else {
                    if (ecallback) ecallback("ignoring module '" + module.id + "' (bad or missing device path)");
                }
                break;
            default:
                if (ecallback) ecallback("ignoring module '" + module.id + "' (invalid communication protocol)");
                break;
        }
        return(retval);
    }

    /**
     * getCommand processes a <device> definition and returns the relay control
     * command that is specified for for switching <channel> to * <state> using
     * <protocol>.
     *  
     * @param device - device definition from which to pull the command.
     * @param protocol - the protocol to use for communication with device.
     * @param channel - the channel to be operated.
     * @param state - the state to which the relay should be set (0 or 1).
     * @return - the required command string or null if command recovery fails.
     */
    function getCommand(device, protocol, channel, state) {
        if (DEBUG & DEBUG_TRACE) console.log("getCommand(%s,%s,%s,%s)...", device, protocol, channel, state);

        var retval = null;
        var deviceprotocol =  device.protocols.reduce((a,p) => { return((p.id == protocol)?p:a); }, null);
        if (deviceprotocol) {
            if ((deviceprotocol.commands.length == 1) && (deviceprotocol.commands[0].channel == 0)) {
                retval = deviceprotocol.commands[0][((state)?"on":"off")].replace("{c}", channel);
            } else {
                retval = deviceprotocol.commands.reduce((a,c) => { return((c.channel == channel)?c[((state)?"on":"off")]:a); }, null);
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
        if (DEBUG & DEBUG_TRACE) console.log("getStreamFromPath(%s,%s,%s)...", path, states, debug);

        var stream = null;
        if ((path != null) && ((stream = app.streambundle.getSelfStream(path)) !== null)) {
            if (path.startsWith("notifications.")) stream = stream.map(v => ((v == null)?0:((states.includes(v.state))?1:0))).startWith(0);
            stream = stream.skipDuplicates();
            if (dcallback) stream = stream.doAction(v => dcallback(v));
        }
        return(stream);
    }

    function processTcpData(data, module) {
        if (DEBUG & DEBUG_TRACE) console.log("processTcpData(%s,%s)...", data, channels);
        if (data == "fail") log.E("TCP command failure on module " + module.id);
    }

    /**
     * processUsbData assumes <buffer> to be a byte sequence describing the
     * state of relay channels contained in <module>. The content of
     * <buffer> must be in the format used with the Devantech USB protocol.
     * The function extracts any content from <buffer> which describes relay
     * channel states in <module> and writes delta value updates into the
     * Signal K data module at the location identified by <switchpath>.
     * @param buffer - data for processing.
     * @param module - module to which the content of <buffer> relates.
     * @switchpath - path into the electrical.switches tree where updates should be written.
     */
    function processUsbData(buffer, module, switchpath) {
        /*if (DEBUG & DEBUG_TRACE)*/ console.log("processUsbData(%s,%s,%s)...", JSON.stringify(buffer), module, switchpath);

        var state = (buffer)?buffer.readUInt8(0):null;
        if (switchpath) {
            var deltaValues = [];
            for (var i = 0; i < module.channels.length; i++) {
                deltaValues.push({
                    "path": switchpath.replace('{m}', module.id).replace('{c}', module.channels[i].id) + ".state",
                    "value": (state & module.channels[i].statusmask)
                });
                state = (state >> 1);
            }
            app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": deltaValues }] });
        }
    }

    return(plugin);
}
