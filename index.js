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
const DEBUG = (DEBUG_TRACE & DEBUG_DIALOG);

module.exports = function(app) {
	var plugin = {};
	var unsubscribes = [];
    var modules = {};

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
            (DEBUG & DEBUG_DIALOG)?(msg) => { log.N(msg,false); }:null,
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

            unsubscribes = (options.modules || []).reduce((a, module) => {
                if (module.connection) {
                    var m = module;
                    module.channels.forEach(channel => {
                        var c = channel;
                        var triggerPath = ((c.trigger)?c.trigger:options.global.trigger).replace('{m}', m.id).replace('{c}', c.id);
                        var triggerStates = (c.triggerstates)?c.triggerstates:options.global.triggerstates; 
                        var triggerStream = getStreamFromPath(triggerPath, triggerStates);
                        if (triggerStream) {
                            a.push(triggerStream.onValue(v => {
                                var command = getCommand(m.device, m.cstring.split(':',1)[0], c.index, ((v == 0)?0:1)); 
                                if (m.connection.state && command) m.connection.state.write(command);
                                app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": [
                                    { "path": options.global.switchpath.replace('{m}', m.id).replace('{c}', c.id) + ".state", "value": ((v == 0)?0:1) }
                                ] }] });
                            }));
                        } else {
                            log.E("unable to acquire stream for " + triggerPath, false);
                        }
                    });
                }
                return(a);
            }, []);
        } else {
            log.N("stopped (no usable module configurations)");
        }
    }

	plugin.stop = function() {
        if (DEBUG & DEBUG_TRACE) console.log("plugin.stop()...");
		unsubscribes.forEach(f => f());
		unsubscribes = [];
	}

    /*
     * validateModule processersd a module definition, normalising property
     * values, applying internal defaults and, as a last resort rejecting a
     * badly formed or incomplete definition. If callbacks functions are
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

    function connectModule(module, ncallback, ecallback) {
        if (DEBUG & DEBUG_TRACE) log.N("connectModule(%s, %s, %s)...", module, ncallback, ecallback);
        var retval = false;
        switch (module.cstring.split(':')[0]) {
            case 'http': case 'https':
                break;
            case 'tcp':
                var [ dummy, host, port ] = module.cstring.split(':');
                if (host && port) {
                    module.connection = { state: false };
                    module.connection.socket = new net.createConnection(port, host, () => {
                        if (ncallback) ncallback("TCP socket opened for module " + module.id);
                        module.connection.state = module.connection.socket;
                        module.connection.socket.on('data', (buffer) => {
                            if (ncallback) ncallback("TCP data received from " + module.id + " [" + buffer.toString() + "]");
                            processTcpData(buffer.toString(), module)
                        });
                        module.connection.socket.on('close', () => {
                            if (ecallback) ecallback("TCP socket closed for " + module.id);
                            module.connection.state = false;
                        });
                    });
                    retval = true;
                } else {
                    if (ecallback) ecallback("ignoring module '" + module.id + "' (bad or missing port/hostname)");
                }
                break;
            case 'usb':
                var [ dummy, path ] = module.cstring.split(':');
                if (path) {
                    module.connection = { state: false };
                    module.connection.serialport = new SerialPort(path);
                    module.connection.serialport.on('open', () => {
                        if (ncallback) ncallback("serial port opened for module " + module.id);
                        module.connection.state = module.connection.serialport;
                        module.connection.parser = new ByteLength({ length: 1 });
                        module.connection.serialport.pipe(module.connection.parser);
                        module.connection.parser.on('data', (buffer) => {
                            if (ncallback) ncallback("serial data received from " + module.id + " [" + buffer.readUInt8(0) + "]");
                            processUsbData((buffer)?buffer.readUInt8(0):null, module);
                        });
                        module.connection.serialport.on('close', () => {
                            if (ecallback) ecallback("serial port closed for " + module.id);
                            module.connection.state = false;
                        });
                        //module.connection.state.write(module.device.protocols.filter(p => (p.id == 'usb'))[0]['status']);
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

    /*
     * Get a relay control command for switching <channel> to <state> using
     * <protocol> from <device>.
     *  
     * @param device - device definition from which to pull the command.
     * @param protocol - the protocol to use for communication with device.
     * @param channel - the channel to be operated.
     * @param state - the state to which the relay should be set (0 or 1).
     * @return - the required commadn string or null if recovery fails.
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
     * getStreamFromPath returns a data stream for a specified <path>. The
     * data stream is expected to return a stream of 0s and 1s indicating a
     * logical state and some special processing is provided to turn
     * notification paths into numerical values based upon notification alert
     * state.
     */ 
    function getStreamFromPath(path, states, debug=false) {
        if (DEBUG & DEBUG_TRACE) console.log("getStreamFromPath(%s,%s,%s)...", path, states, debug);

        let _path = path;
        var stream = null;
        if ((path != null) && ((stream = app.streambundle.getSelfStream(path)) !== null)) {
            if (path.startsWith("notifications.")) stream = stream.map(v => ((v == null)?0:((states.includes(v.state))?1:0))).startWith(0);
            stream = stream.skipDuplicates();
            if (debug) stream = stream.doAction(v => console.log("%s = %s", _path, v));
        }
        return(stream);
    }

    function processTcpData(data, module) {
        if (DEBUG & DEBUG_TRACE) console.log("processTcpData(%s,%s)...", data, channels);
        if (data == "fail") log.E("TCP command failure on module " + module.id);
    }

    function processUsbData(state, module) {
        if (DEBUG & DEBUG_TRACE) console.log("processUsbData(%d,%s)...", state, module);

        if (state) {
            var deltaValues = [];
            for (var i = 0; i < module.channels.length; i++) {
                deltaValues.push({ "path": "electrical.switches." + module.id + "." + module.channels[i].id + ".state", "value": (state & module.channels[i].statusmask) });
                state = (state >> 1);
            }
            app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": deltaValues }] });
        }
    }

    return(plugin);
}
