## Use cases

Apart from the obvious, press a switch - operate a relay situations, here is a
slightly more complex example of using __signalk-switchbank__ together with
__signalk-threshold-monitor__ to implement an automatic waste discharge scheme.

The _Use case_ section of the __signalk-threshold-monitor__ documentation
explains how I use that plugin to raise notifications when my holding tank
nears full and when it becomes empty.

Over here in __signalk-switchbank__ I have a rule which is triggered by these
notifications and operates the ship's discharge pump.
This automatic behaviour is selectable by an "AUTO DISCHARGE" switch at the
helm and will only happen when this switch is in the ON state.
The rule looks like this.
```
Trigger path:           "notifications.tanks.wasteWater.0.currentLevel"
Comment:                "Waste tank level critical alert"
Relay path:             "electrical.switches.15.1.state"
Comment:                "Discharge pump"
Condition:              "Only if switch is on"
Instance:               0
Channel:                11
```
