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

__signalk-devantech__ implements a reporting and control interface for
multi-channel relay modules manufactured by the UK company Devantech.
These plugin supports devices that are operated over USB, WiFi and
wired ethernet and may support modules from other manufacturers which
have a compatible interfacing principle.

The plugin accepts relay operating commands over a *control channel*.
commands received on a control channel which can be either a Signal K
notification path or a Unix domain socket (IPC).
Relays are then operated using the Devantech protocol particular to
the specific relay module type.
Relay module models and their operating parameters are in the plugin
configuration file which includes definitions for most of the Devantech
product range.

__signalk-devantech__ was designed to operate alongside
[signalk-switchbank](https://github.com/preeve9534/signalk-switchbank)
which implements a comprehensive control logic that can issue commands
over this plugin's notification channel.

Devantech Ltd kindly supported the development of this plugin by making
some of its relay module products available to the author for
evaluation and testing.

## Operating principle

__signalk-devantech__ supports relay modules in the Devantech USB, ESP,
ETH and dS model ranges and ships with an expandable library of device
definitions that covers modules that connect by USB, WiFi and wired
ethernet. 

Each device that is to be operated by the plugin must be defined in the
plugin configuration file.

### Relay state information

Each relay module is represented by a collection of Signal K paths with
the general pattern 'electrical.switches.bank.*m*.*c*',
where *m* is an arbitrary module identifier and *c* is a natural number
indexing a channel within a module.
This structure echoes the Signal K representation of NMEA switch banks,
but here we'll call it a "relay bank" to avoid confusion.

The relay bank data structure will be built dynamically as relay channel
states are reported to the plugin, but since Devantech products
generally do not report their state autonompusly it usually preferable
to build relay bank structures in advance and allow the plugin to then
maintain the bank's channel state information as data becomes available
from the relay module (in the worst case, such information will become
available when a relay channel is operated).
Advance building also allows channels within a relay bank to bes
decorated with useful meta information.
An easy way of accomplishing an advance build of a a relay bank is to
use the switchbank specification facility of
[signalk-switchbank]().

### Relay operation
 
A relay channel is operated by sending __signalk-devantech__ a string
representation of a JSON *control-message* of the form:

    { "moduleid": *m*, "channelid": *c*, "state": s }

where *m* and *c* have the meaning discussed above and *s* is the value
0 or 1 (meaning OFF or ON respectively).

The simplest way of delivering a *control-message* is to pass it Din a
notification
When the plugin receives a *control-message* it attempts to convert it
into a JSON object using the JSON.parse() function, so a reliable way
of generating a message is by applying the JSON.stringify() function to
a suitable JSON object.

When a *control-message* is received, __signalk-devantech__ validates
the request against its configuration and if all is good it immediately
issues an appropriate operating command to the module selected by
*module_id*.

__signalk-devantech__ defaults to accepting control messages as
the content of the description property value of notifications arriving
on the path "notifications.devantech".

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
    "controltype": "notification",
    "controltoken": "notifications.devantech",
    "switchpath": "electrical.switches.bank.{m}.{c}",
    "modules": [
      ** MODULE DEFINITIONS **
    ],
    "devices": [
      ** DEVICE DEFINITIONS **
    ]
  }
}
```

### Global settings

The properties under this tab influence the overall behaviour of the plugin.

_Default relay trigger path_ specifies which Signal K data keys should normallys
be used by the plugin as relay triggers.
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

_Switch polling interval in ms_ specifies the interval in milliseconds at
which the plugin should interrogate the state of attached relay modules.
Only devices in _Device definitions_ which also define a _Module statuss
request command property_ will actually be polled at this interval.
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

_Authentication token_ specifies the format of an authentication token {A} in
terms of any username {u} and password {p} tokens. For example, the Devantech
TCP protocol can be password protected and passwords are introduced into
commands by preceeding them with a 'y' character and a credentials format
of 'y{p}'.
Optional.
No default.

_Commands_ is a list of command definitions, which describes the the commands
required to change the state of the device relays.
The configuration GUI allows you to create and delete command definitions
using the ```[+]``` and ```[-]``` controls.

Each command definition consists of a _Channel index_ which identifies the
relay channel to which the definition relates and patterns for the commands
which turn the relay on and off.

The _Commands_ array can be configured with a single command definition with
a _Channel index_ value of zero that provides a pattern for the command to
be used to operate all relays.
Alternatively, each channel can be enumerated and the commands for each relay
channel specified separately.

_Channel index_ the value 0 or the index of the channel command being defined.
Required.
No default.

_ON command_ the command string used to turn ON the relay or relays selected
by _Channel index_.

_OFF command_ the command string used to turn OFF the relay or relays selected
by _Channel index_.

The strings supplied for the on and off commands are simply JSON formatted
strings which will be transmitted to the relay device.  Embedded escape
sequences are interpolated and the following wildcards substituted before
string transmission.

|Wildcard|Replacement value                                                  |
|:{c}   :|The ASCII coded index of the channel being processed.              |
|:{C}   :|The byte encoded index of the channel being processed.             |
|:{A}   :|The value of the _Authentication token_ (after token replacement). | 

A simple snippet from the configuration file might look like this.
```
    "devices": [
        {
            "id": "USB-RLY02",
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
            "id": "ETH044",
            "size": 4,
            "protocols": [
                {
                    "id": "tcp",
                    "authenticationtoken": "y{p}",
                    "commands": [
                        { "channel": 0, "on": "{A} {C}\0001\0000\007B" "off": "{A} {C}\0000\0000\007B" }
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

### Simple use example

I use a two-channel USB relay module on my barge to interface my Signal K host
to my helm alarm system.
My alarm system is multi-channel and supported by beacon and sounder alerts
and I dedicate one channel to Signal K input triggered by the closing of one
of the relays.
The second relay connects directly with the beacon.

## Supported relay modules

__signalk-devantech__ supports relay modules manufactured by:

    Devantech Ltd
    Maurice Gaymer Road
    Attleborough
    NR17 2QZ
    England 

    Telephone: +44 (0)1953 457387 
    Fax: +44 (0)1953 459793

    Website: (www.robot-electronics.co.uk)[www.robot-electronics.co.uk]

The following table lists the relay modules against which the plugin
implementation was developed.

### [USB relays](https://www.robot-electronics.co.uk/products/relay-modules/usb-relay/usb-rly02-sn.html)

|Relay module   |No of relays|Connection|Protocols|
|:--------------|:----------:|:--------:|:-------:|
|USB-RLY02-SN   |2           |USB       |usb      |
|USB-RLY02      |2           |USB       |usb      |
|USB-RLY08B     |2           |USB       |usb      |
|USB-RLY82      |2           |USB       |usb      |
|USB-RLY16      |2           |USB       |usb      |
|USB-RLY16L     |2           |USB       |usb      |
|USB-OPTO-RLY88 |2           |USB       |usb      |
|USB-RLY816     |2           |USB       |usb      |
|USB-RELAY02    |2           |USB       |usb      |
|USB-RELAY02    |2           |USB       |usb      |
|USB-RELAY02    |2           |USB       |usb      |
|USB-RELAY02    |2           |USB       |usb      |
|USB-RELAY02    |2           |USB       |usb      |
|USB-RELAY02    |2           |USB       |usb      |

USB-RLY02-SN https://www.robot-electronics.co.uk/products/relay-modules/usb-relay/usb-rly02-sn.html

