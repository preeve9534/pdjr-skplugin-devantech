## Configuration

__signalk-devantech__ is configured in the normal Signal K fashion by the JSON
configuration file ```devantech.conf``` located in the server's
```plugin-config-files``` directory.
```devantech.conf``` can be created and edited using a text editor or the
Signal K configuration interface (see below).

The general structure of the configuration properties is illustrated below. 
```
Property                  Type      Required Default
"configuration": {
  "pollinterval":         integer   N        0   
  "modules": [
    {
      "id":               string    Y        -
      "device":           string    Y        -
      "statuscommand":    string    N        -
      "channels": [
        {
          "id":           string    Y        -
          "name":         string    N        *id*
          "triggerpath"   string    N        'notifications.devantech._module.id_._id_'
          "on":           string    Y        -
          "off":          string    Y        -
          "status":       string    N        -
          "statusmask"    string    N        -
        }
      ]
    }
  ]
}
```

The following file listing shows a specimen configuration for a USB-connected
two-channel relay module
[USB-RLY02]()
and a WiFi connected two-channel relay module
[ESP32LR20]().
```
{
  "enabled": true,
  "enableLogging": false,
  "configuration": {
    "modules": [
      {
        "id": "usb0",
        "device": "usb:/dev/ttyACM0",
        "status": "[",
        "channels": [
          {
            "id": "1",
            "name": "En-suite towel rail",
            "on": "e",
            "off": "p",
            "statusmask": 1
          },
          {
            "id": "2",
            "name": "Dayhead towel rail",
            "on": "f",
            "off": "o",
            "statusmask": 2
          }
        ]
      },
      {
        "id": "wifi0",
        "device": "net:192.168.1.100:6161",
        "channels": [
          {
            "id": "1",
            "name": "Wheelhouse table lamp",
            "on": "SR 1 1",
            "off": "SR 1 0",
            "status": "GR 1"
          },
          {
            "id": "2",
            "name": "Wheelhouse down lights",
            "on": "SR 2 1",
            "off": "SR 2 0",
            "status": "GR 2"
          }
        ]
      }
    ]
  }
}
```

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

