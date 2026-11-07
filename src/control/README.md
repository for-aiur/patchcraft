# Control boundary

`patch.ts` validates and runs a versioned, acyclic
scalar control graph. Inputs are camera features with monotonic timestamps.
Processors and semantic effect targets remain independent of browser DSP and
MIDI output adapters. Audio capture is optional in control-only mode.

`src/vision` analyzes one frame at a time in a worker. `src/midi/output.ts` owns
explicit arming, bounded CC messages, rate limiting and stale/disconnect safety.
The browser audio engine consumes validated controls through AudioParam automation.
