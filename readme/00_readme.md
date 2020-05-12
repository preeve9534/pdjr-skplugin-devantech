# signalk-devantech

Signal K interface to the
[Devantech](https://www.devantech.co.uk)
range of general purpose relay modules.

This project implements a plugin for the
[Signal K Node server](https://github.com/SignalK/signalk-server-node).

Reading the
[Alarm, alert and notification handling](http://signalk.org/specification/1.0.0/doc/notifications.html)
section of the Signal K documentation may provide helpful orientation.

__signalk-devantech__ supports integration of consumer grade USB and IP operated
relay modules from the UK company Devantech into the Signal K domain.
The plugin may also support relay modules from other manufacturers which have
a similar design principle.
Note that NMEA 2000 switchbank relays (and switches) are natively supported by
Signal K and are not compatible with __signalk-devantech__.

A connected relay can be operated directly by a state changes on a Signal K
data key and the plugin allows easy integration with keys in the
_electrical.switches._ and _notifications._ data trees.
The state of connected relays is tracked in the usual Signal K fashion through
keys in _electrical.switches._ data tree.

CAUTION. The relay modules available from Devantech are consumer grade
electronic devices and are not a suitable choice for safety critical
applications.
In particular, there are aspects of their firmware design which limit the
extent to which error detection and operational integrity measures can be
implemented.
Given these limitations, the devices are inexpensive, well built and reliable:
just be careful where and how you deploy them.

