#  musician rig integration and acceptance ( / )

The current browser candidate supports MIDI CC, Program Change, guided target mapping, controller CC Learn and local rig profiles. Hardware compatibility below is a test plan. No real DAW/pedal combination has been certified in development.

## First rig setup

1. Open `/vision`, start/calibrate the camera and apply the desired control patch. Your guitar may remain in its normal DAW/interface/pedal audio path.
2. Enable MIDI using the button in section 03. Open  / Musician rig, add a mapping and give it a meaningful name.
3. Choose CC, channel, CC number, output range and maximum send rate. Smoothing comes from the shared control graph. Apply mapping changes, choose the output and Confirm selected output. Editing mappings disarms outputs and clears device bindings; reconfirm all destinations.
4. In the DAW/plugin, enable the selected virtual MIDI input for remote/control, enter MIDI Learn/Map mode and click the target parameter. Press Send selected setup message in Patchcraft. It sends the CC minimum once. Complete the assignment and leave the DAW's Learn mode. This is an explicit parameter-changing action even with live camera control disarmed.
5. Arm selected mapping. Its output follows the normalized camera control. Add more mappings if needed, then reconfirm and arm them individually. Up to eight destinations can consume the same graph output.
6. Use either the original single-output section or the rig mappings for a particular destination. If both are armed on the same CC/port, both send messages.
7. Save rig locally or export the profile. Profiles include the versioned visual patch and routing data. They retain port names as hints, not active port IDs or armed state. On load the camera stops, outputs are disarmed, ports must be confirmed and camera must be restarted/calibrated as appropriate.
8. Disarm all outputs before changing the destination rig's audio routing. Disarming stops control changes and retains the external device's last state; it does not mute or bypass audio in the external rig. Use the DAW/pedal's own mute/bypass for audio emergencies.

## Controller CC Learn

This optional step copies the channel and CC number from a hardware controller into a CC mapping. Select the controller's MIDI input and press Learn next controller CC. Move one knob. A valid CC is captured once and listening stops. Apply mapping changes, confirm output and rearm. Notes, realtime clock, SysEx and channel-mode commands are ignored. Learn times out after 15 seconds and cancels on disconnect, edited routing, profile load or hidden tab. Messages are not forwarded back to the controller or DAW.

The browser cannot discover which plugin parameter a DAW has assigned internally. The guided setup sequence uses the DAW's own Learn mode for that assignment.

## Program Change

Program numbers are displayed as 1–128 and encoded as 0–127. Check the device's own numbering and current bank. Select Program Change, set program and low/high trigger thresholds, apply, confirm the destination and send an explicit setup message to verify the desired preset. Live camera triggering requires observing a low value followed by a high value after arming. Starting on high never switches a preset. Live Program Change is capped at four sends per second, or the configured lower rate. Repeat high values do not retrigger. Disarm/reconnect resets trigger state.

MIDI bank-selection sequences and device-specific SysEx are not automated in this candidate. Hardware preset changes can have their own audio gaps or gain differences; record these separately from MIDI software timing.

## Setup and compatibility matrix

| Setup | Routing and first target | Current evidence |
| --- | --- | --- |
| macOS + desktop Chromium + Ableton Live | IAC bus → Remote input → Auto Filter Frequency, Saturator Drive or Auto Pan/Tremolo amount | Vendor-documented setup, real-rig test pending |
| Windows + desktop Chromium + Ableton/REAPER | Virtual MIDI cable → enabled control input → plugin parameter MIDI Learn | Vendor-documented routing approach, real-rig test pending |
| macOS + desktop Chromium + Logic Pro | IAC output → Logic Controller Assignments Learn → chosen parameter | Vendor-documented Learn path, real-rig test pending |
| USB MIDI controller → browser CC Learn | Controller input → selected mapping's channel/CC | Simulated input tests; actual controller pending |
| USB/DIN MIDI-capable pedal or amp modeler | Explicit port/channel → device-supported CC or Program Change | Vendor-specific mapping required; actual hardware pending |
| Browser without Web MIDI | Camera and browser audio preview can still be used; MIDI setup explains support requirement | Cross-browser hardware matrix pending |

macOS IAC and Windows virtual cable setup, with the first browser presets, are described in [the M2 guide](vision-midi.md). Enable the destination's receive/control/remote settings. Use a different physical or virtual port for controller Learn if needed. [Apple IAC guide](https://support.apple.com/guide/audio-midi-setup/transfer-midi-information-between-apps-ams1013/mac), [Ableton mapping guide](https://help.ableton.com/hc/en-us/articles/360000038859-Making-custom-MIDI-Mappings), [loopMIDI vendor](https://www.tobias-erichsen.de/software/loopmidi.html), [Logic Controller Assignments](https://support.apple.com/en-ca/guide/logicpro/ctls71c31855/mac)

## Hardware reference candidates

- Line 6 HX Stomp: the vendor manual documents USB MIDI and MIDI connectors. CC 1/2 emulate expression pedals; assigning other effect parameters requires the device's Controller Assign mapping. Program Change reception must be enabled. Windows USB operation has vendor driver requirements. These facts come from the firmware 2.65 manual; check the installed firmware's current manual before testing. [Vendor manual, MIDI sections](https://line6.com/data/6/0a020a4010c935bb66a4c0c44f/application/pdf/HX)
- BOSS GT-1000: the vendor documents receiving MIDI and assigning controls through its assignment workflow. Use the installed firmware's parameter and MIDI implementation guides to choose a valid CC and target. Patchcraft does not assume a universal gain CC. [Vendor integration overview](https://www.boss.info/uk/promos/gt-1000_ultimate_guide/), [official manuals](https://www.boss.info/global/support/by_product/gt-1000/owners_manuals/)

These are reference candidates, not required purchases or compatibility certifications. Test Erdem's existing hardware first.

## Erdem acceptance run

Record the exact OS/browser, DAW/plugin, interface/driver/buffer, camera, MIDI route or pedal/firmware in the  report fields. Keep hardware output low and use wired monitoring. Disable duplicate monitoring in the browser/DAW when comparing paths.

1. Perform the M1 guitar audio baseline separately and export its report. Capture physical audio RTT only using [the wired loopback procedure](loopback.md).
2. With guitar audio in the normal rig, run camera → graph → MIDI → one audible effect for at least ten minutes. Press Start acceptance run after camera and a rig mapping are armed. The timer measures elapsed session time, not verified uninterrupted delivery.
3. Confirm continuous CC range, smoothing, rate cap, useful playing response and simultaneous mappings. Verify DAW Learn and, if available, controller CC Learn.
4. Test manual Program Change, initial-high behavior, low/high trigger and repeated-high suppression. Note any target-specific preset-switch audio gaps or level changes.
5. Unplug/reconnect camera, controller and selected output; hide/restore the browser tab. All affected live output must remain disarmed until explicitly recovered/rearmed. Confirm the existing audio rig continues playing.
6. Save/export a rig, reload it and confirm that no device auto-arms or sends presets. Reconfirm destinations and repeat a small control movement.
7. Mark each check Pass/Fail/Not run based on actual observation. Finish the run and export the  report. Also export the M2 report for full camera/control diagnostics. Keep actual recordings outside the repository and review personal setup notes before sharing.

Acceptance requires all applicable checks to pass on the recorded real setup, a ten-minute playing run, a repeatable control-response observation and the player's assessment that it is usable. Unavailable Program Change/controller hardware must be marked Not run and remain pending for compatibility coverage. A successful simulated test or an elapsed timer does not establish a real hardware pass.

For physical visual-to-effect latency, use the synchronized stimulus/response method in the M2 guide, report raw trials and recorder settings, and keep it separate from software call timing and M1 audio RTT.  reports leave physical latency null until a separate measurement is supplied. Software frame-to-send and send-interval summaries include finite sample counts and do not measure cable/driver/DAW latency.

## Troubleshooting

- No ports: check desktop browser Web MIDI support, permission, driver and whether IAC/virtual cable is enabled, then enable MIDI again.
- Port shown but no effect: check input Remote/control enablement, channel, CC, MIDI Learn assignment and target range in the DAW/device.
- Setup CC has no visible movement: a device may already be at the minimum. Confirm MIDI reception in the destination; the setup action deliberately sends one bounded value.
- Rig says disarmed: recover camera/output, apply edited settings, confirm destination and arm explicitly. Reconnection never silently starts control.
- Preset number differs: inspect the device's zero/one-based numbering, bank and Program Change receive setting.
- Feedback or audio issue: stop the external audio using its own mute/bypass. MIDI disarm only freezes parameter changes.
