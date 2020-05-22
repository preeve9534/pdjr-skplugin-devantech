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

The plugin always attempts to determine and report relay state when it
initially connects to a relay module.

Ideally the relay module firmware needs enhancing to support automatic status
reporting at some regular interval and it may be that firmware modifications
which implement this will become available over time.

