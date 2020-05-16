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
data tree. Required.

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

actually connected to your system.
Each _module_ entry in the array def






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

