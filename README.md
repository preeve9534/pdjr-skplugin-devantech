# signalk-devantech

Signal K interface to the
[Devantech](https://www.devantech.co.uk)
range of general purpose relay modules.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

The
[Signal K data model](http://signalk.org/specification/1.0.0/doc/data_model.html)
and
[Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
sections of the Signal K documentation may provide helpful orientation.

__signalk-devantech__ allows wired and wireless relay modules made by the UK
company Devantech Ltd to be operated and monitored by a Signal K node server.
The plugin may support modules from other manufacturers which have a compatible
interfacing principle.

Relays adopted by the plugin are operated by value changes on user-defined
Signal K data keys with automatic integration with keys in the server's
notifications.' tree.

The state of connected relays is reflected through key values in the
'electrical.switches.' tree.

NOTE. NMEA 2000 switchbank relays (and switches) are natively supported by
Signal K and are not compatible with __signalk-devantech__.

CAUTION. The relay modules manufactured by Devantech Ltd are consumer grade
electronic devices and may not a suitable choice for safety critical
applications.
In particular, there are aspects of the Devantech stock firmware which limit
the extent to which error detection and operational integrity measures can be
implemented (see the 'Devantech relay modules' section below for more
information).
Given these limitations, the devices are inexpensive, well built and reliable:
just give some thought to  what you use them for and where and how you deploy
them.

## Operating principle

__signalk-devantech__ supports relay modules in the Devantech USB, ESP, ETH
and dS model ranges and ships with an expandable library of device definitions 
that covers modules that connect by USB, Wifi and wired ethernet. 

### Relay state information

Each relay channel operated by the plugin is represented in Signal K by a key
in the Signal K 'electrical.switches.' data tree.
Incorporating a relay module into Signal K requires the user to supply a
_module-id_ for the relay module and, optionally, a _channel-id_ for each
channel.

__signalk-devantech__ creates two key entries in the Signal K data store for
each configured relay channel.

* State keys (for example 'electrical.switches._module-id_._channel-id_.state')
  are updated in real time to reflect the state of the identified relay.

* Meta keys (for example 'electrical.switches._module-id_._channel-id_.meta)
  are created when the plugin starts with a value of the form
  '{ "type": "relay", "name": _channel-name_ }',
  where _channel-name_ is a user supplied value drawn from the plugin
  configuration file.
  Meta values are used by the plugin to elaborate log messages and may be used
  by other agents to improve the legibility of their output.

### Relay operation
 
Each relay channel is operated in response to value changes on a single data
key called a _trigger_.

__signalk-devantech__ defaults to using a notification key as a trigger.
Triggers can be defined by the plugin user explicitly or by pattern at both
the global and/or channel level.
The global default path defined in the stock module is
'notifications.control._module-id_._channel-id_'.

Notification state values are used to define the condition under which a relay
operates and these can be adjusted by the user at both global and channel
level.
The stock module configuration defines 'alert', 'alarm' and 'emergency'
notification states as signalling a relay 'ON' condition.

Iif notification triggers aren't appropriate for your application, then you
can alternatively define pretty much any Signal K key which has a numerical
value as a trigger: a value of 0 maps to relay 'OFF' and non-zero to ON.

### Monitoring the integrity of relay operation

The stock firmware installed in Devantech relay modules is both limited and
inconsistent in its real-time state reporting capabilities.
In general, relay operating commands are reported as succeeding or failing
but continuous, real-time, monitoring is only available through polling
initiated by the host application.

Placing a polling burden on the Signal K server is not desirable and is almost
certainly infeasible for any but the smallest scale implementations.
__signalk-devantech__ supports polling, but its use is discouraged and it is
disabled in the stock configuration.

Ideally the relay module firmware needs enhancing to support automatic status
reporting at some regular interval and it may be that firmware modifications
which implement this will become available over time.

## System requirements

__signalk-devantech__ has no special installation requirements.

## Installation

Download and install __signalk-devantech__ using the _Appstore_ link in your
Signal K Node server console.
The plugin can also be obtained from the 
[project homepage](https://github.com/preeve9534/signalk-devantech)
and installed using
[these instructions](https://github.com/SignalK/signalk-server-node/blob/master/SERVERPLUGINS.md).

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
Defaults on installation to 'notifications.control.{m}.{c}'.

_Default notification trigger ON states_ specifies the notification states
that will by default indicate a relay ON condition when a notification
appears on a trigger notification path.
The value supplied here is a default and can be overriden on a per-channel
basis in the _Connected modules_ section.
Required.
Defaults on installation to [ 'alert', 'alarm', 'emergency' ].

_Relay module switch path_ specifies the path where relay module channel state
and meta keys will be created and updated.
The supplied value must be relative to the server's 'vessels.self.' path
and should include the tokens '{m}' and '{c}' as placeholders which will be
substituted by module id and channel id values for each connected module.
The default conforms to normal Signal K conventions.
Required.
Defaults on installation to 'electrical.switches.{m}.{c}'.

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
        "trigger": "notifications.control.{m}.{c}",
        "triggerstates": [ "alert", "alarm", "emergency" ],
        "switchpath": "electrical.switches.{m}.{c}",
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
## Usage

__signalk-devantech__ has no special run-time usage requirement.

You can monitor the plugin's manipulation of the Signal K data tree by
reviewing the server state model in a web browser.

Status and error messages are written to the Signal K server logs.

## Devantech


