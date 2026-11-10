# Camera and MIDI control

Patchcraft sends one selected MIDI CC from a live camera feature or the built-in simulator. The receiving DAW, plugin or hardware device assigns that CC to its parameters. The same CC can control multiple parameters in the receiving application.

## Quick start

1. Open `/vision.html` in desktop Chrome or Chromium over HTTPS. A local `http://localhost` session is also a secure context.
2. Leave **Simulator** selected to try the control without a camera, or choose **Camera**, allow access and start the camera. Select a feature such as brightness, red, color similarity or motion.
3. For the simulator, move the signal slider or start the repeatable sweep. For camera input, change the light, color or motion in view.
4. Press **Start MIDI output** to request MIDI access. Select the port that your receiving app listens to, the CC and, if needed, adjust the channel and output range.
5. In the receiving app, open MIDI assignment for the parameter, then press **Start MIDI output** again in Patchcraft. Move the camera scene or simulator value so the receiving app sees the selected CC.
6. Press **Stop MIDI output** when finished. A stopped or disconnected camera, hidden page, or disconnected MIDI port stops sending. Restart output explicitly after recovery.

Patchcraft does not need to know which parameter or application receives the CC. It sends through the selected MIDI port. Other applications receive it only if they listen to that port or are routed to it.

## Virtual MIDI ports

### macOS

Open Audio MIDI Setup → Window → Show MIDI Studio → IAC Driver. Enable Device is online and create a bus if necessary. Enable that IAC bus as a control/remote input in your DAW, then select the same bus as Patchcraft's MIDI output. [Apple IAC setup](https://support.apple.com/guide/audio-midi-setup/transfer-midi-information-between-apps-ams1013/mac)

### Windows

Create a virtual MIDI cable with a tool supported by your DAW (for example, loopMIDI), enable it as a DAW control input and select that port in Patchcraft. [loopMIDI vendor instructions](https://www.tobias-erichsen.de/software/loopmidi.html)

## Safety and measurement

The output range is bounded to MIDI values 0–127. Start with a conservative range for parameters such as gain or volume. Patchcraft stops sending when the camera becomes stale, the page is hidden or the selected port disconnects; it does not send a reset value, so the receiving app retains its last value.

Browser processing and MIDI send-call timings do not measure physical camera-to-plugin response or audio round-trip latency. Those require a separate physical measurement on the actual computer, browser, camera, MIDI route and audio rig.
