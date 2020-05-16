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
const DEBUG = DEBUG_OFF;

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

        options = validOptions(options);

        options.modules.forEach(module => {
            switch (module.cstring.split(':')[0]) {
                case 'http': case 'https':
                    break;
                case 'tcp':
                    var [ dummy, host, port ] = module.cstring.split(':');
                    if (host && port) {
                        module.connection = { state: false };
                        module.connection.socket = new net.createConnection(port, host, () => {
                            if (DEBUG & DEBUG_DIALOG) log.N("TCP socket opened for module " + module.id, false);
                            module.connection.state = module.connection.socket;
                            module.connection.socket.on('data', (buffer) => {
                                if (DEBUG & DEBUG_DIALOG) log.N("TCP data received from " + module.id + " [" + buffer.toString() + "]", false);
                                processTcpData(buffer.toString(), module)
                            });
                            module.connection.socket.on('close', () => {
                                if (DEBUG & DEBUG_DIALOG) log.N("TCP socket closed for " + module.id);
                                module.connection.state = false;
                            });
                        });
                    } else {
                        log.E("ignoring module '" + module.id + "' (bad or missing port/hostname)", false);
                    }
                    break;
                case 'usb':
                    var [ dummy, path ] = module.cstring.split(':');
                    if (path) {
                        module.connection = { state: false };
                        module.connection.serialport = new SerialPort(path);
                        module.connection.serialport.on('open', () => {
                            if (DEBUG & DEBUG_DIALOG) log.N("serial port opened for module " + module.id, false);
                            module.connection.state = module.connection.serialport;
                            module.connection.parser = new ByteLength({ length: 1 });
                            module.connection.serialport.pipe(module.connection.parser);
                            module.connection.parser.on('data', (buffer) => {
                                if (DEBUG & DEBUG_DIALOG) log.N("serial data received from " + module.id + " [" + buffer.readUInt8(0) + "]", false);
                                processUsbData((buffer)?buffer.readUInt8(0):null, module);
                            });
                            module.connection.serialport.on('close', () => {
                                if (DEBUG & DEBUG_DIALOG) log.N("serial port closed for " + module.id);
                                module.connection.state = false;
                            });
                            module.connection.state.write(module.device.protocols.filter(p => (p.id == 'usb'))[0]['status']);
                        });
                    } else {
                        log.E("ignoring module '" + module.id + "' (bad or missing device path)", false);
                    }
                    break;
                default:
                    log.E("ignoring module '" + module.id + "' (invalid communication protocol)", false);
                    break;
            }
            module.channels.forEach(channel => { channel.key = module.id + "." + channel.id; });
        });

        var configuredModuleCount = options.modules.filter(m => (m.connection)).length;
        log.N("operating " + configuredModuleCount + " relay module" + ((configuredModuleCount == 1)?"":"s"));

        // Write channel meta data to the SignalK tree so that presentation
        // applications can deploy it.
        var deltaValues = options.modules.reduce((a,sb) => a.concat(sb.channels.map(ch => { return({
            "path": "electrical.switches." + ch.key + ".meta",
            "value": { "type": ch.type, "name": ch.name }
        })})), []);
        var delta = { "updates": [ { "source": { "device": plugin.id }, "values": deltaValues } ] };
        app.handleMessage(plugin.id, delta);

        // Report module states
        options.modules.forEach(module => {
            //module.port.write(module.statuscommand, err => { if (err) console.log("error writing status request"); });
        });

        unsubscribes = (options.modules || []).reduce((a, module) => {
            if (module.connection) {
                var m = module;
                module.channels.forEach(channel => {
                    var c = channel;
                    var stream = getStreamFromPath(((c.trigger) && (c.trigger != ""))?c.trigger:(options.defaulttriggerpath + c.key));
                    if (stream) {
                        a.push(stream.onValue(v => {
                            var command = getCommand(m.device, m.cstring.split(':',1)[0], c.index, ((v == 0)?0:1)); 
                            if (m.connection.state && command) m.connection.state.write(command);
                            //if (m.connection.state && m.statuscommand) m.connection.state.write(m.statuscommand);
                            app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": [
                                { "path": "electrical.switches." + c.key + ".state", "value": ((v == 0)?0:1) }
                            ] }] });
                        }));
                    }
                });
            }
            return(a);
        }, []);

    }

	plugin.stop = function() {
        if (DEBUG & DEBUG_TRACE) console.log("plugin.stop()...");
		unsubscribes.forEach(f => f());
		unsubscribes = [];
	}

    function validOptions(options) {
        if (DEBUG & DEBUG_TRACE) console.log("validateOptions(%s)...", JSON.stringify(options));
        var retval = options;
        const mF = [ "id", "deviceid", "cstring", "name" ];
        const mR = [ "id", "deviceid", "cstring" ];
        
        options.modules = options.modules.reduce((a,m) => {
            var retval = true;
            mF.forEach(k => { m[k] = (m[k])?m[k].trim():null; if (m[k] == "") m[k] = null; });
            mR.forEach(k => { if (!m[k]) { log.E("ignoring module '" + m.id + "' (missing '" + k + "' property)", false); retval = false; } });

            var device = options.devices.reduce((a,d) => { return((d.id == m.deviceid)?d:a); }, null);
            if (device) {
                var protocol = m.cstring.split(':')[0];
                if (device.protocols.map(p => p.id).includes(protocol)) {
                    if (m.channels.length == 0) {
                        log.E("ignoring module '" + m.id + "' (no channels defined)", false); retval = false;
                    } 
                } else {
                    log.E("ignoring module '" + m.id + "' (unsupported protocol '" + protocol + "')", false); retval = false;
                }
            } else {
                log.E("ignoring module '" + m.id + "' (invalid device id)", false); retval = false;
            }
            if (retval) {
                m.device = device;
                a.push(m);
            }
            return(a);
        },[]);
        return(options);
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
    function getStreamFromPath(path, debug=false) {
        if (DEBUG & DEBUG_TRACE) console.log("getStreamFromPath(%s,%s)...", path, debug);

        let _path = path;
        var stream = null;
        if ((path != null) && ((stream = app.streambundle.getSelfStream(path)) !== null)) {
            if (path.startsWith("notifications.")) stream = stream.map(v => ((v == null)?0:((v.state != "normal")?1:0))).startWith(0);
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
                deltaValues.push({ "path": "electrical.switches." + module.channels[i].key + ".state", "value": (state & module.channels[i].statusmask) });
                state = (state >> 1);
            }
            app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": deltaValues }] });
        }
    }

    return(plugin);
}
