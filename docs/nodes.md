# M2 node contract (EVR-93 / EVR-96)

Patches use schema version 1. Runtime validation is authoritative for uniqueness, typed connections, acyclicity and parameter bounds. Data has a closed node catalog and cannot execute code. The guided surface supports one camera and one control output. Version 1 files remain loadable when optional metadata is added. Unknown versions fail before activation.

| Category | Kind | Ports | Parameter specification |
| --- | --- | --- | --- |
| Input | camera | control out, normalized 0–1 | brightness, red, green, blue, target-color similarity, mean luminance frame difference motion |
| Processor | normalize | control in/out | min/max 0–1, strictly positive range, clipped normalized output |
| Processor | clamp | control in/out | min/max 0–1, strictly positive range |
| Processor | map | control in/out | positive-width output range within 0–1 |
| Processor | smooth | control in/out | time constant 0–2000 ms, default 80, exponential elapsed-time response |
| Processor | threshold | control in/out | low/high 0–1, high ≥ low, stateful hysteresis |
| Processor | rateLimit | control in/out | 1–60 Hz, elapsed-time sample-and-hold |
| Effect | effect | control parameter in/out | cutoff, drive, tremolo, delay, reverb semantic target; normalized value passes through |
| Output | output | control in | browser DSP or MIDI adapter consumes normalized value and semantic target |

The audio engine separately owns mono capture → AudioWorklet → dry/wet filter/drive/tremolo → safe output gain → destination. Audio ports carry PCM, control ports carry timestamped finite scalar values. PCM edges are never accepted as control connections. This milestone's patch format configures control routing and audio parameter targets; arbitrary audio rewiring is not supported.

| Target | Range / default | Scaling / smoothing | Candidate support |
| --- | --- | --- | --- |
| EQ/wah low-pass cutoff | 80–18000 Hz / 2500 Hz | logarithmic / AudioParam 20 ms | browser + MIDI mapping |
| Drive | 1–8× / 1× | linear pre-gain into bounded tanh / 20 ms | browser + MIDI mapping |
| Tremolo depth | 0–1 / 0 | fixed 5 Hz sinusoid / 20 ms | browser + MIDI mapping |
| Delay wet | 0–1 / 0.2 | target DAW/plugin scaling / configured control smoothing | MIDI mapping; browser DSP catalog-only |
| Reverb wet | 0–1 / 0.2 | target DAW/plugin scaling / configured control smoothing | MIDI mapping; browser DSP catalog-only |

Browser output stays bounded at −6 dB maximum with a −24 dB starting level. It starts muted in M2. Camera failure freezes browser effect parameters while audio rendering continues. Mapping changes disarm camera modulation until explicit rearming.

MIDI uses channel 1–16, CC 0–119, integer range 0–127, send cap 1–60 Hz (default 30). CC 120–127 channel-mode commands are rejected. Unchanged values are suppressed. Sends are immediate with no application scheduling queue. Stale data after 500 ms, hidden tab, edited settings or disconnected port disarms sending and clears pending port output. The external parameter retains its last value. MIDI receipt and audible latency require external measurement.

ROI is normalized x/y/width/height within the frame, minimum width/height 0.05. Analysis is 160×120 at requested 5–60 Hz; actual camera/frame scheduling may differ. Camera capture timestamps use browser readback time, not sensor timestamps. Worker processing uses one frame in flight and no queue. Pixel statistics have fixed cost per image. No runtime CV dependency is introduced.

Centroid displacement is reported experimentally for investigation only. It cannot reliably distinguish object motion from lighting/exposure changes, multiple objects or moving cameras. Optical flow is deferred until a measured task justifies its cost and license review.

See [the performance guide](../public/docs/vision-midi.md) for provisional budgets, real-rig setup and acceptance. No camera/DAW combination is certified yet.
