## Configuration

__signalk-devantech__ is configured by the JSON configuration file
```devantech.json``` located in the host server's ```plugin-config-files```
directory.
The configuration file can, of course, be edited directly using a text editor
and, given the clunkiness of the Signal K configuration interface some users
may prefer this approach.

Even so, the following discussion focusses on configuration through the
Signal K Node server plugin panel which can be accessed by navigating to
_Server->Plugin config_ and selecting the _Devantech relay module plugin_ tab.
For completeness, the discussion includes some code examples which illustrate
the configuration file components underpinning the GUI.

### Getting started

If you are using a compatible relay module from Devantech, then most likely
the only configuration required will be to define the modules connected to
your system before enabling the plugin by setting the "Plugin enabled?"
configuration property to true.

The plugin configuration is divided into three parts (_Global settings_,
_Device definitions_ and _Connected modules_) each represented in the
GUI by an expandable tab.

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

### Global settings

The properties under this tab influence the overall behaviour of the plugin.

_Default trigger path_ specifies which Signal K data keys should normally be
used by the plugin as relay triggers.
The value supplied here is a default and can be overriden on a per-channel
basis in the _Connected modules_ section.
The supplied value must be relative to the server's 'vessels.self.' path
and should include the tokens '{m}' and '{c}' as placeholders which will be
substituted by module id and channel id values for each connected module.
Required.
Defaults on installation to '.notifications.control.{m}.{c}'.

_Default notification trigger ON states_ specifies the notification states
that will by default indicate a relay ON condition when a notification
appears on a trigger notification path.
The value supplied here is a default and can be overriden on a per-channel
basis in the _Connected modules_ section.
Required.
Defaults on installation to [ 'alert', 'alarm', 'emergency' ].

_Polling interval_ specifies the interval in milliseconds at which the plugin
should interrogate the state of attached relay modules.
Only devices in _Device definitions_ which define a __status__ property will
actually be polled at this interval.
If this value is omitted or set to zero then all polling of connected modules
is disabled.
Polling should only be enabled cautiously and conservatively because of its
potential impact on system performance.
Optional.
Defaults zero.

The default configuration file global snippet looks like this:
```
    "global": {
        "trigger": ".notifications.control.{m}.{c}",
        "triggerstates": [ "alert", "alarm", "emergency" ],
        "pollinterval": 0
    }
```

### Device definitions

The properties under this tab define the interfacing characteristics of all
supported relay devices: a device must be defined here before it can be
configured for use by the plugin.
The plugin installation includes device definitions for all of the supported
Devantech relay modules.

The configuration GUI allows you to create and delete device definitions using
the ```[+]``` and ```[-]``` controls.

Each device has the following properties.

_Device id_ gives a unique identifier for the device being defined (the pre-
installed definitions use the relay module manufacturer's model number).
Required.
No default.

_Number of supported relay channels_ specifies the number of relay channels
supported by the device.
Required.
No default.

_Protocols_ is a list of protocol definitions, each of which defines a
communication protocol supported by the device.
The configuration GUI allows you to create and delete protocol definitions
using the ```[+]``` and ```[-]``` controls.

Each protocol has the following properties.

_Protocol id_ specifies the protocol type being defined. 
The plugin understands 'usb', 'tcp', 'http' and 'https' protocol types.
Required.
No default.

_Module status request command_ specifies the command that should be sent to
the parent device over this protocol to elicit a module status report.
If supplied, this command will only be used if the _Polling interval_ property
in _Global settings_ is set to a non-zero value.
Optional.
No default.

_Commands_ is a list of command definitions, which describes the the commands
required to change the state of the device relays.
The configuration GUI allows you to create and delete command definitions
using the ```[+]``` and ```[-]``` controls.

The _Commands_ array can be configured with a single command definition that
provides a template for the commands to be used to operate relays on the host
device.
In this case, the specified command must have a _Channel index_ property with
the value zero and the individual command strings will need to include
wildcards that can be substituted with the index of the particular channel
being operated.

Alternatively, the _Commands_ array can include a collection of command
definitions, one for each relay channel, which give separate commands for
operating each of the device's relay channels.

A command has the following properties.

_Channel index_ specifies the index of the device relay channel to which the
command relates (relay channels are indexed from 1).
Specifying a 0 value says that the following _ON command_ and _OFF command_
should be used to operate all relay channels.
Required.
No default.

_ON command_ specifies the command that should be issued to switch the relay
channel or channels ON.
If _Channel index_ is set to zero, then the command supplied here must include
the wildcard '{c}' will be replaced during command execution by the index of
the relay channel which is being operated.
Required.
No default.

_OFF command_ specifies the command that should be issued to switch the relay
channel or channels OFF.
If _Channel index_ is set to zero, then the command supplied here must include
the wildcard '{c}' will be replaced during command execution by the index of
the relay channel which is being operated.
Required.
No default.

A simple snippet from the configuration file might look like this.
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

### Modules definitions

The iproperties under this tab define the relay modules which are actually
part of your system and will be operated by the __signalk-devantech__ plugin.

The configuration GUI allows you to create and delete module definitions using
the ```[+]``` and ```[-]``` controls.

Each module has the following properties.

_Signal K module id_ specifies a unique identifier for the module in the Signal
K domain.
Required.
No default.

_Device id_ specifies the device which implements this module.
The supplied value must be the _id_ of a device defined in the _Device
definitions_ section.
Required.
No default.

_Connection string_ specifies a connection string of the form
'*protocol*__:__*address*__:__[*port*]'
where:

_protocol_ must be one of 'usb', 'tcp', 'http' or 'https', dependent upon how
the relay module should communicate with the host server.

_address_ is a a selector for the device and is dependent upon the value of
_protocol_.
For 'usb', _address_ will be a path to the ```/dev/``` entry for the
USB/serial connection. 
For the other protocols, _address_ will be either the IP address or hostname
of the ethernet connected module and the optional _port_ can be specified if
necessary.

_Connection string_ id required and has no default.

_Module description_ supplies some text describing the module.
This text is used by the plugin to elaborate log messages and may be used by
other applications to improve the legibility of their output.
Optional.
No default.

_Channels_ is an optional collection of channel definitions, each of which
describes a relay channel and how it should be operated.
Each channel definition maps a relay channel in the Signal K domain into a
relay channel on a physical device.

If _Channels_ is not defined, then the plugin will automatically construct a
definition for each channel using some minimal defaults.
It is much better to supply a comprehensive _Channels_ array definition since
this usefully documents the implemented solution.

Each channel definition has the following properties.

_Relay index_ specifies the relay channel number on the selected device to
which the definition relates (relay channels are numbered from 1).
Required.
No default.

_Signal K channel id_ specifies a unique identifier for the channel in the
Signal K domain.
Optional.
Defaults to the value of _Relay index_. 

_Channel description_ supplies some text describing the channel.
This text is used by the plugin to elaborate log messages and may be used by
other applications to improve the legibility of their output.
Optional.
Defaults to a period separated catenation of the values supplied for _Signal
K module id_ and _Signal K channel id_.

_Trigger path_ specifyies a key path whose value should be mapped onto this
channel's relay state.
In general, this path must address a value which is either 0 (for OFF) or 
non-zero (for ON) and so is especially useful for mapping the value of some
switch in ```electrical.switches.*.state```.
Optional.
Defaults to the value of _Default trigger path_.

_Notification trigger ON states_ is a string array whose members specify the
notification alert states which define an ON condition for this channel.
Only relevent when a notification is used as a _Trigger path_.
Optional.
Defaults to the value of _Default notification trigger ON states_.

The following snippet illustrates how module definitions appear in the JSON
configuration file.
```
    "modules": [
      {
        "id": "usb0",
        "deviceid": "USB-RELAY02",
        "cstring": "usb:/dev/ttyACM0",
        "description": "Helm panel alarm relay module",
        "channels": [
          { "index": 1, "description: "Alarm system beacon" },
          { "index": 2, "description": "Alarm system annunciator" }
        ]
      },
      {
        "id": "wifi0",
        "deviceid": "ETH-XXX04",
        "cstring": "http://192.168.1.11/",
        "channels": [
          { "index": 1, "description": "En-suite towel rail" },
          { "index": 2, "description": "Dayhead towel rail" },
          { "index": 3, "description": "En-suite towel rail" },
          { "index": 4, "description": "Dayhead towel rail" }
        ]
      }
    ]
```
