# Control boundary

EVR-94: the milestone 01 audio engine has no control-graph dependency.
Future typed control processing will live separately from `src/audio`.
Control outputs may target AudioParam automation, Web MIDI, OSC bridges or
native adapters; control-only operation must not require microphone permission
or an AudioContext. No graph implementation or adapter is part of this PoC.
