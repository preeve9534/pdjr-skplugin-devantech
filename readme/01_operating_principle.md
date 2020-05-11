## Operating principle

### How are relay channels identified?

__signalk-devantech__ identifies each relay channel by a compound
_relay-identifier_ made up of user-defined module and channel identifiers.

For example, if a module is configured with id = 'wifi0' and has a relay
channel with id = '1', then the relay-identifier will be 'wifi0.1'.

### What key values are created by the plugin?

__signalk-devantech__ creates two key entries in the Signal K data store for each
configured relay channel.

The key __electrical.switches.__*relay-identifier*__.state__ are updated to
reflect the state of the identified relay.

State information is updated when the plugin operates a relay and may be
updated by polling relay module channel states at some user-defined
interval.
Polling places a load on the Signal K host which may be unacceptable in some
installations and it is disabled by default.

The key __electrical.switches.__*relay-identifier*__.meta__ is updated when
the plugin starts with a structure of the form
```
{ "type": "relay", "name": "channel-name" }
```
Where _channel-name_ is some arbitrary user-defined text.
This information is used by the plugin to elaborate log messages and may be
used by other agents to improve the legibility of their output.

### How is a relay operated?
 
Each relay is operated in response to value changes on a single data key
referred to as a _trigger_.
__signalk-devantech__ defaults to using a trigger path of
__notifications.devantech.__*relay-identifier* for each relay channel and
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

