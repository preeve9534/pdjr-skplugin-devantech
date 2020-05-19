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

The plugin is configured by the user to monitor an arbitrary Signal K key for
each adopted relay channel: changes in this key value operate the associated
relay.

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
just give some thought to what you use them for and where and how you deploy
them.

DISCLAIMER. Devantech Ltd kindly supported this development by making some
of its relay module products available to the author for evaluation.
The author has no substantive relationship with or interest in Devantech Ltd.
