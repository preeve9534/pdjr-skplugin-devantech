## Configuration

__signalk-devantech__ is configured by the JSON configuration file
```devantech.json``` located in the host server's ```plugin-config-files```
directory.

The plugin can be configured through the Signal K Node server plugin
configuration panel by navigating to _Server->Plugin config_ and selecting the
_Devantech relay module plugin_ tab.

Of course, the configuration file can be edited directly using a text editor
and, given the clunkiness of the Signal K configuration interface, many users
may prefer this approach and the following discussion is couched in these
terms.

The plugin configuration file has the general structure:
```
{
    "enabled": false,
    "enableLogging": false,
    "properties": {
        "global": { ... },
        "devices": [ ... ],
        "modules": [ ... ]
    }
}
```

If you are using a compatible relay module from Devantech, then most likely
the only configuration required will be to define the modules connected to
your system in the _modules_ array, setting __enabled__ to ```true``` and
re-starting the Signal K server.  

### Global property

The __global__ object sets some properties which influence the overall
behaviour of the plugin.
The default value looks like this:
```
    "global": {
        "defaultnotificationpath": ".notifications.control"
    }
```

__defaultnotificationpath__ specifies where the plugin should look for
notification trigger keys and must be a path in the server's 'vessels.self.'
data tree.
Required.
Defaults to '.notifications.control.'.

__defaultnotificationonstates__ specifies the notification states that will by
default indicate a relay ON condition when a notification appears on a trigger
path.
Required.
Defaults to [ 'alert', 'alarm', 'emergency' ].

__pollinterval__ specifies the interval in milliseconds at which the plugin
should interrogate the state of attached relay modules.
Only relay modules which define a __status__ property will actually be polled
at this interval.
If __pollinterval__ is omitted or set to zero then all polling of connected
modules is disabled.
Polling should only be enabled cautiously and conservatively because of its
potential impact on system performance.
Optional.
Defaults to zero.

### Devices property

The __devices__ array contains one or more _device_ objects, each of which
describes the operating parameters of a relay module device in terms of its
supported communication protocols and associated operating commands.
Required.
Defaults to a collection of definitions for each of the supported Devantech
relay modules.
Consider the following example:
```
    "devices": [
        {
            "id": "USB-RELAY02",
            "size": 2,
            "protocols": [
                {
                    "id": "usb",
                    "status": "[",
                    "commands": [
                        { "channel": 1, "on": "e", "off": "o" },
                        { "channel": 2, "on": "f", "off": "p" }
                    ]
                }
            ]
        },
        {
            "id": "ETH-RELAY04",
            "size": 4,
            "protocols": [
                {
                    "id": "tcp",
                    "commands": [
                        { "channel": 0, "on": "ON {c}", "off": "OFF {c}" }
                    ]
                }
            }
    ]
```

Each _device_ object is defined by the following properties.

__id__ gives a unique identifier for the device being defined: in this example,
the manufacturer's relay module model number was used.
Required.
No default.

__size__ specifies the number of relay channels supported by the device.
Required.
No default.

The __protocols__ array contains a list of _protocol_ objects, each of which
defines a communication protocol supported by the device.
The 'USB-RELAY02' device in the above example only supports a single protocol.

Each _protocol_ object is defined by the following properties.

__id__ specifies the protocol being defined for the parent device. 
The plugin understands 'usb', 'tcp', 'http' and 'https' protocol types.

__status__ specifies the command that should be sent to the parent device to
elicit a module status report.

The __commands__ array contains one or more _command_ objects which describe
the commands to be used to change the state of the device relays.
Required.
Defaults to an empty array.

There are two possibilites:

1. the _commands_ array contains a single _command_ object with a __channel__
   property value of zero that provides a pattern for the commands to be used
   for all channels (see device 'ETH-RELAY04' in the example);
2. the _commands_array contains a collection of _command_ objects, one for each
   relay channel, which give separate commands for operating each of the
   device's relay channels (see device 'USB-RELAY02' in the example).

A _command_ object is defined by the following properties.

__channel__ specifies the index of the device relay channel to which the command
relates.
Relay channels are indexed from 1.
Specifying a 0 value says that the following commands are used to operate all
channels in which case, the wildcard '{c}' will be replaced during command
execution by the index of the relay channel which is being operated.
Required.
No default.

__on__ specifies the command that should be issued to switch the relay channel
or channels ON.
Required.
No default.

__off__ specifies the command that should be issued to switch the relay channel
or channels OFF.
Required.
No default.

### Modules property

The __modules__ array contains one or more _module_ object definitions, each of
which describes a relay module which is actually part of your system and will
be operated by the __signalk-devantech__ plugin.
Required.
Defaults to the empty array.

Consider the following example.
```
    "modules": [
      {
        "id": "usb0",
        "deviceid": "USB-RELAY02",
        "cstring": "usb:/dev/ttyACM0",
        "description": "Helm panel alarm relay module",
        "channels": [
          { "index": 1, "name": "Alarm system beacon" },
          { "index": 2, "name": "Alarm system annunciator" }
        ]
      },
      {
        "id": "wifi0",
        "deviceid": "ETH-XXX04",
        "cstring": "http://192.168.1.11/",
        "channels": [
          { "index": 1, "name": "En-suite towel rail" },
          { "index": 2, "name": "Dayhead towel rail" },
          { "index": 3, "name": "En-suite towel rail" },
          { "index": 4, "name": "Dayhead towel rail" }
        ]
      }
    ]
```

Each _module_ object is defined by the following properties.

__id__ specifies a unique identifier for the module.
This value is used together with a channel __id__ (see below) to construct a
key value which uniquely identifies each relay channel within Signal K.
Required.
No default.

__deviceid__ specifies the type of device which constitutes this module.
The supplied value must be the __id__ of a _device_ defined in the __devices__
array.
Required.
No default.

__cstring__ specifies a connection string of the form
*protocol*__:__*address*__:__[*port*]
where:

 _protocol_ must be one of 'usb', 'tcp', 'http' or 'https', dependent
upon how the relay module is connected to the host server.
_protocol_ must also be one of the protocols supported by the _device_
selected by __deviceid__.

_address_ is a a selector for the device and is dependent upon the value of
_protocol_.
For 'usb', _address_ will be a path to the ```/dev/``` entry for the
USB/serial connection. 
For the other protocols, _address_ will be either the IP address or hostname
of the ethernet connected module and the optional _port_ can be specified if
necessary.

__cstring__ is required and has no default.

__description__ supplies some text describing the module.
This text is used by the plugin to elaborate log messages and may be used by
other applications to improve the legibility of their output.
Optional.
No default.

The __channels__ array contains a collection of _channel_ objects each of which
describes a relay channel.
Required.
Defaults to the empty array.

Each _channel_ object maps a relay channel in the Signal K domain into a relay
channel on a physical device and is defined by the following properties.

__index__ specifies the relay channel number on the selected device (channels
are numbered from 1).
Required.
No default.

__id__ specifies an identifier for the channel in the Signal K domain that is
used with the containing module __id__ to construct a unique, identifying
channel key.
Optional.
Defaults to __index__. 

__name__ supplies some text naming the channel.
This text is used by the plugin to elaborate log messages and may be used by
other applications to improve the legibility of their output.
Optional.
Defaults to the channel identifying key.

__trigger__ specifyies a key path (overriding the default notification path)
whose value should be mapped onto this channel's relay state.
In general, this path must address a value which is either 0 (for OFF) or 
non-zero (for ON) and so is especially useful for mapping the value of some
member of a switch in ```electrical.switches.*.state```.
Optional.
Defaults to '_global.defaultnotificationpath_._module.id_._channel.id_'.

__triggerstates__ is a string array (overriding the default notification ON
states) whose members specify the notification alert states which define an ON
condition.
Only relevent when a notification is used as a trigger.
Optional.
Defaults to the value 'global.defaultnotificationonstates'.
