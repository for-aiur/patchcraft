# Patchcraft MIDI companion for macOS

The companion creates a Core MIDI destination named **Patchcraft** for the browser and a matching Core MIDI source for DAWs. MIDI 1.0 messages sent to the browser-visible destination are forwarded directly to the DAW-visible source. The endpoints exist only while the companion is running; no IAC bus or third-party virtual MIDI driver is required.

## Build and run

Requires macOS 12 or later and the Xcode Command Line Tools.

```sh
swift build -c release
swift run -c release
```

Keep the process open while using Patchcraft. In the browser, allow Web MIDI access and select **Patchcraft**. In the DAW, enable **Patchcraft** as a MIDI input, then use the DAW or plugin's own MIDI Learn mode.

This source package is a development companion, not yet a signed/notarized installer. The hosted browser page cannot install or start native software on the user's behalf. A distributable companion app is required for a one-click end-user setup.
