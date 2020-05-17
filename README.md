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

__signalk-devantech__ allows integration of relay modules made by the UK
company Devantech Ltd into the Signal K domain.
The plugin supports both wired (USB & ethernet) and wireless (WiFi) devices
and may also support relay modules from other manufacturers which have
a similar interfacing principle.

__signalk-devantech__ supports operation of connected relays by value changes
on user-defined Signal K data keys, with easy integration with keys in the
'electrical.switches.' and 'notifications.' trees.
The state of connected relays is mapped through keys in the 'electrical.switches.'
tree.

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

### Which Devantech relay products are supported?

__signalk-devantech__ supports the USB, ESP, ETH and dS model ranges providing
connection by USB, Wifi and wired ethernet. 

### How are relay channels identified?

__signalk-devantech__ identifies each relay channel by a compound
_relay identifier_ made up of user-defined module and channel identifiers.
For example, if a module is configured with id = 'wifi0' and has a relay
channel with id = '1', then the relay identifier will be 'wifi0.1'.

The relay identifier is used as part of all the default keynames associated
with a configured channel.

### What key values are created by the plugin?

__signalk-devantech__ creates two key entries in the Signal K data store for each
configured relay channel.

State keys (for example 'electrical.switches.wifi0.1.state' are updated to
reflect the state of the identified relay.

Meta keys (for example 'electrical.switches.wifi0.1.meta) are created when the
plugin starts with a value of the form ```{ "type": "relay", "name": "channel-name" }```,
where _channel-name_ is a value drawn from the plugin configuration file.
Meta values are used by the plugin to elaborate log messages and may be
used by other agents to improve the legibility of their output.

### How is a relay operated?
 
Each relay is operated in response to value changes on a single data key
referred to as a _trigger_.

__signalk-devantech__ defaults to using a trigger path of
'notifications.control._relay-identifier_ for each relay channel and
interprets the presence of a notification on this key with a state other
than 'normal' as ON.

Pretty much all of the default behaviour can be overriden on a per-channel
basis in the plugin configuration.
In particulr, the trigger path can be set to any Signal K key and the plugin
will interpret a key value of 0 as OFF and non-zero as ON.

### How is the state of module relay operation validated/reported?

The stock firmware installed in the Robot Electronics relay modules is both
limited and inconsistent in its state reporting capabilities.

|Protocol|Command confirmation|Status reporting|
|usb     |No                  |Module polling  |
|tcp     |Yes                 |Channel polling |
|http    |Yes                 |None            | 

Placing a polling burden on the Signal K server is not desirable: ideally the
module firmware needs enhancing to support automatic status reporting at some
regular interval and always immediately on a state change.

__signalk-devantech__ attempts to flag problems by checking the status of a
channel immediately after a state change commmand is issued.  Inconsistencies
result in an error message being written to the system log.

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

The plugin can be configured through the Signal K Node server plugin
configuration panel by navigating to _Server->Plugin config_ and selecting the
_Devantech relay module plugin_ tab.

Of course, the configuration file can be edited directly using a text editor
and, given the clunkiness of the Signal K configuration interface some users
may prefer this approach.

The following discussion assumes the use of the plugin configuration interface,
but gives examples which illustrate the configuration file components
underpinning the GUI.

If you are using a compatible relay module from Devantech, then most likely
the only configuration required will be to define the modules connected to
your system before enabling the plugin by setting the "Plugin enabled?"
option to true.

The plugin configuration is divided onto three parts (_Global settings_,
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

These influence the overall behaviour of the plugin.

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

The default configuration file snippet looks like this:
```
    "global": {
        "trigger": ".notifications.control.{m}.{c}",
        "triggerstates": [ "alert", "alarm", "emergency" ],
        "pollinterval": 0
    }
```

### Device definitions

This section defines the interfacing requirements of all supported relay
devices: a device must be defined here before it can be configured for use by
the plugin.
The plugin installation includes idevice definitions for all of the supporteds
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
## Usage

__signalk-devantech__ has no run-time usage requirement.

