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

        options.modules.forEach(module => {
            if ((module.id = module.id.trim()) == "") { log.E("ignoring module '" + module.id + "' (missing 'id' property)", false); return; }
            module.device = module.device.trim(); if (module.device == "") { log.E("ignoring module '" + module.id + "' (missing 'device' property)"); return; }
            switch (module.device.split(':')[0]) {
                case 'http': case 'https':
                    break;
                case 'tcp':
                    var [ dummy, host, port ] = module.device.split(':');
                    if (host && port) {
                        module.connection = { state: false };
                        module.connection.socket = new net.createConnection(port, host, () => {
                            if (DEBUG & DEBUG_DIALOG) log.N("TCP socket opened for module " + module.id, false);
                            module.connection.state = true;
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
                    var [ dummy, path ] = module.device.split(':');
                    if (path) {
                        module.connection = { state: false };
                        module.connection.serialport = new SerialPort(path);
                        module.connection.serialport.on('open', () => {
                            if (DEBUG & DEBUG_DIALOG) log.N("serial port opened for module " + module.id, false);
                            module.connection.state = true;
                            module.connection.parser = new ByteLength({ length: 1 });
                            module.connection.serialport.pipe(module.connection.parser);
                            module.connection.parser.on('data', (buffer) => {
                                if (DEBUG & DEBUG_DIALOG) log.N("serial data received from " + module.id + " [" + buffer.toString() + "]", false);
                                processUsbData((buffer)?buffer.buffer[0]:null, module);
                            });
                            module.connection.serialport.on('close', () => {
                                if (DEBUG & DEBUG_DIALOG) log.N("serial port closed for " + module.id);
                                module.connection.state = false;
                            });
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
                var device = module.device;
                var connection = module.connection;
                var moduleStatus
                module.channels.forEach(channel => {
                    var key = module.id + "." + channel.id;
                    var stream = getStreamFromPath((channel.trigger == "")?(options.defaulttriggerpath + key):channel.trigger);
                    var swpath = "electrical.switches." + key + ".state";
                    var on = channel.on;
                    var off = channel.off; 
                    var chStatus = channel.statuscommand;
                    if (stream) {
                        a.push(stream.onValue(v => {
                            switch (device.split(':',1)[0]) {
                                case 'http': case 'https':
                                    break;
                                case 'tcp':
                                    if (connection.state) {
                                        connection.socket.write((v == 1)?on:off);
                                        if (chStatus) connection.socket.write(chStatus);
                                    }
                                    break;
                                case 'usb':
                                    if (connection.state) {
                                        connection.serialport.write((v == 1)?chOn:chOff);
                                        connection.serialport.write(module.statuscommand);
                                    }
                                    break;
                                default:
                                    break;
                            }
                            app.handleMessage(plugin.id, { "updates": [{ "source": { "device": plugin.id }, "values": [{ "path": swpath, "value": v }] }] });
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
        if (DEBUG & DEBUG_TRACE) console.log("processUsbData(%b,%s)...", state, module);

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
