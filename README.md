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

The plugin configuration has the general structure:
```
"properties": {
    global-settings,
    device-definitions,
    module-configurations
}
```

### Global settings

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
data tree. Required.

__pollinterval__ specifies the interval in milliseconds at which the plugin
should interrogate the state of attached relay modules.
Only relay modules which define a __status__ property will actually be polled
at this interval.
By default, __pollinterval__ is set to zero which completely disables polling
of connected  modules.
Polling should only be enabled cautiously and conservatively because of its
potential impact on system performance.
Optional.
Defaults to zero.

### Device definitions

The __devices__ array contains one or more _device_ objects, each of which
describes the operating parameters of a relay module device in terms of its
supported communication protocols and associated operating commands.
Required.
Defaults to a collection of definitions for each of the supported Devantech
relay modules.
The default value begins with this snippet:
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
                        {
                            "channel": 1,
                            "on": "e",
                            "off": "o"
                        },
                        {
                            "channel": 2,
                            "on": "f",
                            "off": "p"
                        }
                    ]
                }
            ]
        },
        {
            "id": "USB-RELAY04",
            ...
            ...
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
   for all channels;
2. the _commands_array contains a collection of _command_ objects, one for each
   relay channel, which give separate commands for operating each of the
   device's relay channels.

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
ON.
A wildcard command (used if __channel__ equals 0) might be "ON {c}".
Required.
No default.

__off__ specifies the command that should be issued to switch the relay channel
OFF.
A wildcard command (used if __channel__ equals 0) might be "OFF {c}".
Required.
No default.

### Module configurations




#### Command definition

The __commands__ array includes a list of objects, each of which defines the
commands that should be sent to operate a particular relay channel on the
parent device.

### Initial configuration

__signalk-devantech__ can be configured through the Signal K Node server plugin
configuration panel.
Navigate to _Server->Plugin config_ and select the _Rerelay_ tab.

![Plugin configuration panel](readme/screenshot.png)

The configuration panel consists of a Signal K Node server widget containing
_Active_ and _Debug log_ options, a collection of expandable tabs which conceal
specific configuration options, and finally a _Submit_ button which saves the
plugin configuration, commits any changes, and starts or stops the plugin
dependent upon the state of the _Active_ option.

You are advised to initially configure the plugin in the following way. 

1. Check the _Active_ option.

2. Follow the guidance below to tell the plugin about connected relay modules,
   then click _Submit_.
   You can use a monitoring app (like __signalk-switchbank-monitor__  to confirm
   the presence and operation of that the configured module channels.

The __Modules__ tab opens (and closes) a list which defines the modules that the
plugin will adopt and operate.
You can add and remove modules from the definition using the '+' and '-' list
controls.

Each module is defined by the following properties.

__id__  
Required text property which identifies the module.

__device__  
Required text property specifying the module access method and the module device
address, separated by a colon character.
The access method must be one of 'usb', 'http' or 'https', dependent upon how
the relay module is connected to the host server.

If the access method is 'usb', then the device address should be the path to
the serial device which interfaces to the locally connected hardware.
A typical value for the __device__ property might be 'usb:/dev/ttyACM0'.

If the access method is 'http' or 'https', then the device address should be
the hostname or IP address of the relay module on the network.
A typical value for the __device__ property might be 'http://192.168.1.100:2122'

__pollinterval__  
Currently ignored, but reserved for future use.

Within each __Module__ configuration, the _Channels_ tab opens (and closes) a
list which defines the module's relay channels.
You can add and remove channels from the definition using the '+' and '-' list
controls.

Each channel is defined by the following properties:

__id__
Required text property which identifies the channel being defined.

__name__  
Optional (but recommended) text property describing the channel.
This text is used by the plugin to elaborate log messages and may be used by
other applications to improve the legibility of their output.

__trigger__
Optional text property specifying a key path whose value should be mapped onto
this channel's relay state.
In general, this path must address a value which is either 0 (for OFF) or 1
(for ON) and so is especially useful for mapping the value of some member of
```electrical.switches.*.state```.
The plugin supports the use of notifications as relay controls and if __trigger__
is not defined its value will default internally to 'notifications.control._module-id_._channel-id_'.
When a notification is used as a trigger, either implicitly or explicitly, the
plugin recognises an absent or 'normal' notification as OFF and a notification
with any other state value as ON.

__off__
A required text property which specifies the command string which must be
written to __device__ in order to switch the relay off.
If the module is connected by USB, then this will typically be some simple
character or byte sequence that msut be written to the device port in order to
switch this particular relay OFF.
If the module is connected by HTTP or HTTPS, then this will typically be some
URL which turns this particular relay OFF: the URL used here must be a relative
URL which will be appended to the containing module's device address. 

__on__
A required text property which specifies the command string which must be
written to __device__ in order to switch the relay on.
The principles discussed under the __on__ property apply here too.

## Usage

__signalk-devantech__ has no run-time usage requirement.

