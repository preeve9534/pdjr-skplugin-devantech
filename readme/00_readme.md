# signalk-devantech

Signal K interface to the
[Robot Electronics](https://www.robot-electronics.co.uk)
range of general purpose relay modules.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the
[Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-devantech__ supports integration of consumer grade USB and IP operated
relay modules from the UK company Robot Electronics into the Signal K domain.
The plugin may also support relay modules from other suppliers which have
a similar design principle.
Note that NMEA 2000 switchbank relays (and switches) are natively supported by
Signal K and are not addressed by __signalk-devantech__.

A connected relay can be operated directly by a state changes on a Signal K
data key and the plugin allows easy integration with keys in the
```electrical.switches.``` and ```notifications.``` trees.
The state of connected relays is tracked in the usual Signal K fashion through
keys in the host server's ```electrical.switches.``` data tree.

