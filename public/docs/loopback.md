# Physical loopback and guitar validation

No hardware result has been measured yet. Browser baseLatency/outputLatency are
API reports, not input-to-output round-trip measurements. Do not add them and
call the sum physical RTT. Worklet frame gaps and UI telemetry age do not measure
DAC underruns or audible glitches.

## First play test

1. Use desktop Chromium first, a wired USB interface and wired headphones.
   Set hardware output low, phantom power off unless independently required,
   and disable interface direct monitoring plus any DAW monitoring.
2. Open the HTTPS demo (localhost works for development). Allow microphone,
   choose the interface, the guitar channel, and output. If output selection is
   unsupported, select the interface in OS settings. Do not use Bluetooth.
3. Start in bypass at -24 dB. Raise hardware volume slowly. Check dry monitoring,
   low-pass wet mix, bypass, mute, stop and restart. Stop before changing devices.
4. Play for 10 minutes. Note crackles, dropouts, subjective playability and times.
   Test background tab, UI activity, unplug/reconnect and permission denial.
   Device changes intentionally stop output; they must never switch to speakers
   silently. Resume explicitly. Camera control is outside this audio measurement procedure.
5. Export the local JSON report. Fill in OS/version, browser/version, interface,
   driver, hardware buffer, actual capture/context rates, direct monitoring state,
   session duration and listening observations. Nothing uploads automatically.
   Review device labels and personal details before sharing. Do not commit recordings.

## Repeatable physical input-to-output measurement

Use an external pulse generator/player, a suitable isolated splitter and a
synchronized two-channel recorder (a second interface/recorder is recommended).
Consult hardware manuals for compatible line levels; never use amplified speaker
outputs, feed headphones into an instrument input at high level or enable phantom
power on a connected output. Begin with monitors muted. Do not create a feedback
loop. Do not monitor recorder channels back into Patchcraft.

- Split the same line-level short pulse into recorder reference channel A and
  the selected Patchcraft input. Record the Patchcraft output on recorder channel B.
- Keep recorder A and B on one clock. Disable recording effects, monitoring and
  latency compensation that might shift either channel. Use equal recorder paths.
  Record an A/B direct-reference calibration before inserting Patchcraft to
  quantify recorder channel skew; report both raw and corrected values.
- Patchcraft: live input, bypass enabled, wet 0, safe nonzero output level. Note
  rates and hardware configuration. Capture at least ten isolated pulses after warmup.
- For each pulse identify matching onset sample positions with the same documented
  threshold (for example 10% of each pulse's peak). Compute
  `(B onset - A onset) / recorder sample rate * 1000` ms. Correct only measured
  recorder channel skew, not actual interface/browser delays.
- Report all trials, median, min, max, threshold and calibration with OS, browser,
  interface, driver, hardware buffer, capture/context/recorder rates, wiring and
  method. Re-run after changing one setting. This measures the physical configured
  input-to-output path; an internally scheduled impulse is not an equivalent test.
- Compare bypass and effect-enabled runs. Before reporting a latency target as
  met, agree on a playable threshold with the musician and validate actual playing.

## Result template

Date / OS / browser+version / interface+driver / hardware buffer:
Capture rate / context rate / recorder rate / direct monitoring state:
Wiring / recorder compensation / onset method / calibration skew:
Raw trials (ms) / corrected trials / median / min / max:
10-minute audible glitches / background behavior / bypass / mute / reconnect:
Musician's playable assessment / browser-reported values (separately):

Status: NOT RUN. No physical interface is available in the development environment.
