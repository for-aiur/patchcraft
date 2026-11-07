# Camera → MIDI setup guide

This guide explains how to try camera control with your existing DAW and MIDI setup. No physical visual-to-effect latency has been measured.

## Quick start

1. Open `/vision.html` in desktop Chrome/Chromium over HTTPS. Keep the tab visible. Your guitar may stay in your existing DAW/interface. Browser audio preview is optional.
2. Choose Light Wah, Red Drive or Motion Tremolo. Start camera, allow camera permission and choose the correct camera. Frame data remains local.
3. Open Region & target color if needed, choose a fixed camera and ROI, apply and restart camera. `color` measures similarity to your chosen color; `red` is average red-channel intensity and also reacts to bright white light.
4. Press Calibrate for 5 seconds and move through your intended lighting/movement range. Constant scenes are rejected. Alternatively enter min/max, smoothing and optional gate/hysteresis, then Apply mapping. Smoothing adds intentional response lag; reduce its time constant for faster control while checking noise.
5. Enable a virtual MIDI output as described below. Press Enable MIDI & find outputs, allow normal MIDI access, choose the port, channel and CC. Start with a narrow CC range for volume/drive controls.
6. In your DAW/plugin, use MIDI mapping/learn to bind that same channel/CC to the desired parameter. Arm MIDI, move the scene and confirm the parameter moves. The suggested CC numbers are mapping choices, not universal plugin assignments.
7. Disarm, adjust ranges and smoothing, then rearm. After a camera stall, disconnect, changed settings or hidden tab, sending stops and the DAW retains the last value. Return/recover and explicitly rearm. Audio in your existing rig continues independently.
8. Save locally or export the patch. Loading requires camera confirmation and fresh MIDI output selection/rearming. Exports contain the patch and a port-name hint, never executable code.
9. Optional browser preview: select cutoff, drive or tremolo, choose synthetic pluck or your USB interface, start audio muted. With wired headphones and low hardware volume, unmute. After changing/restarting camera or patch, press Arm camera preview. Delay/reverb wet mappings are MIDI-only in this candidate.

## Virtual MIDI setup

### macOS

Open Audio MIDI Setup → Window → Show MIDI Studio → IAC Driver. Enable Device is online and create a bus if necessary. In the DAW, enable that IAC bus as a control/remote MIDI input. Select the same bus as Patchcraft's MIDI output. Keep browser and DAW open on the same computer. [Apple IAC setup](https://support.apple.com/guide/audio-midi-setup/transfer-midi-information-between-apps-ams1013/mac)

### Windows

Use an installed virtual MIDI cable supported by your DAW (for example loopMIDI), create a port, and enable it as a DAW control input. Select that port in Patchcraft. A virtual cable may need host installation; Docker does not own MIDI hardware. Local application development still needs only Docker Compose. [loopMIDI vendor instructions](https://www.tobias-erichsen.de/software/loopmidi.html)

### First target mappings

- Light Wah / Light EQ: map CC 74 on channel 1 to a low-pass filter cutoff. Suggested browser preview range is 80–18,000 Hz, logarithmic. Constrain the DAW range to taste.
- Red Drive: map CC 20 on channel 1 to the drive amount of a distortion plugin. Set its output compensation conservatively before arming. Browser preview uses 1–8× pre-drive into a bounded waveshaper.
- Motion Tremolo: map CC 21 on channel 1 to tremolo depth, not audio track volume. Browser preview uses 5 Hz modulation and depth 0–1.
- Delay/reverb: choose a wet-mix parameter and map the selected CC yourself. Their browser DSP implementations are catalog-only in this candidate.

Use the DAW's documented MIDI mapping facility (for example Ableton Live MIDI Map Mode or REAPER parameter MIDI Learn). Some plugins need a DAW parameter wrapper or MIDI routing track. Actual configurations must be recorded during testing. No DAW/plugin combination is certified yet. [Ableton mapping instructions](https://help.ableton.com/hc/en-us/articles/360000038859-Making-custom-MIDI-Mappings)

## Concrete reference DAW setup to validate

If available, use Ableton Live with its built-in devices as the first reference rig. Enable Remote for the virtual MIDI input in Link, Tempo & MIDI settings. Put the device on the monitored guitar track, enter MIDI Map Mode, select the target parameter, arm Patchcraft and move the scene, then leave MIDI Map Mode and constrain the mapping range.

- Light Wah: Auto Filter in low-pass mode, map Frequency to channel 1 / CC 74.
- Red Drive: Saturator, map Drive to channel 1 / CC 20, starting with a conservative range and output compensation.
- Motion Tremolo: Auto Pan (or Auto Pan-Tremolo, depending on Live version), map Amount/depth to channel 1 / CC 21 and configure amplitude modulation rather than stereo panning. Older Auto Pan uses Phase 0° for tremolo.

This reference setup has not been exercised on a real DAW in development. Record the installed Live/device versions and actual results. Other DAWs can use equivalent parameters on existing plugins. [Ableton device reference](https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/), [older Auto Pan reference](https://www.ableton.com/en/live-manual/11/live-audio-effect-reference/)

## Acceptance run

Record OS version, browser version, camera model, DAW/plugin versions, virtual MIDI route, interface, buffer size, analysis resolution/FPS, ROI, calibration, CC/range/rate and smoothing.

- Play for ten minutes with at least one real camera-to-DAW mapping. Record whether the response is useful during playing, audible artifacts and baseline versus camera-enabled behavior.
- Test a stationary scene for noise, gradual and sudden light changes, colored objects, subject motion and camera movement separately. Auto-exposure and white balance can alter controls even when an object is stationary.
- Test busy UI, background tab, camera covered/unplugged/stalled, MIDI output disconnect/reconnect, disarm and patch load. Recovery must require explicit rearming. Confirm audio continues.
- Save the session notes and patch. Fill in the environment/observations fields first. Review device-name hints and personal notes before sharing. Nothing uploads automatically.

## Measurement method and provisional budgets

The worker analyzes 160 × 120 pixels. Before hardware acceptance, target analysis ≥15 fps at requested 30 Hz, worker processing p95 ≤10 ms and browser pixel-readback-to-control p95 ≤100 ms. These are provisional engineering budgets, not achieved performance claims. Report actual sample counts and settings. Adjust only with a recorded reason and player feedback.

Reports retain the latest 1800 samples for each timing metric. Frame age starts at drawing a delivered video frame into the analysis canvas. It excludes sensor exposure, camera transport and video-frame delivery. MIDI software timings end at the `send()` call and exclude OS/virtual cable/DAW/plugin latency. Send intervals include deduplication and scene-dependent changes; they are not transport jitter measurements.

For physical visual-to-effect response, use a synchronized external recorder/video setup capturing the stimulus and the audible or displayed effect response with one clock. Use repeatable abrupt stimuli, identify onset thresholds, calibrate camera/audio skew, repeat at least 20 trials and report raw trials, median, p95, min/max and recording resolution/frame rate. Document uncertain stages. A 60 fps video quantizes visual onset to about 16.7 ms; it cannot prove sub-frame latency. Compare a baseline and camera-controlled run. Keep this measurement separate from guitar audio loopback RTT.

## Scope limitations

The guided page has a single-camera/single-output setup and a validated acyclic control graph. The browser audio graph is owned by the existing audio engine and has typed parameter inputs; patch files do not arbitrarily rewire audio connections. The same control graph targets browser DSP or MIDI. Direction is an experimental luminance-centroid displacement indicator, sensitive to lighting/backgrounds and multiple objects, and is not a supported mapping input. Optical flow and tracking require later evidence and benchmarks.
