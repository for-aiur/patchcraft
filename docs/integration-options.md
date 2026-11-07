# Integration decision record (EVR-117)

Date: 2026-11-07. Patchcraft / YNY Labs. This research adds no SDK or runtime dependency.

## Decision

Complete Web MIDI CC/Program Change routing and musician validation first. The next integration to implement, if Erdem's target needs it, is a minimal local OSC companion. Native plugins follow evidence that MIDI/OSC cannot serve a required rig. Keep timestamped scalar control outputs separate from PCM audio and transport encoding.

## Capability matrix

| Option | Existing rig path | Benefits | Cost / constraints | Decision |
| --- | --- | --- | --- | --- |
| Web MIDI CC/PC | Browser → virtual or USB/DIN MIDI → DAW/pedal | Current reusable output, no audio rerouting | Browser permissions, device drivers, 7-bit CC resolution and target mapping | Implemented test candidate; real-rig acceptance pending |
| Local OSC companion | Browser → local WebSocket → bounded OSC/UDP destination | Named parameters where target exposes OSC | Separate local service, target-specific OSC addresses and connection/security behavior | Smallest next extension after a concrete target is confirmed |
| CLAP adapter | Native plugin in a CLAP-capable DAW | Native host automation and audio integration | C/C++ toolchain, platform builds, host support and IPC to browser/companion | Feasibility candidate |
| VST3 adapter | Native plugin in VST3-capable DAW | Broader host deployment route | SDK/toolchain, lifecycle/automation and distribution work | Feasibility candidate |
| Audio Unit adapter | Apple-hosted AU plugin | Logic/Apple environment route | Apple toolchain, extension lifecycle, signing and platform-specific testing | Evaluate only when required by the target rig |
| Desktop companion | Local UI/transport process | Device access and local networking beyond browser limits | Packaging, updates, signing and OS compatibility | Combine with OSC/native only if justified |

## OSC boundary

OSC defines message encoding and can be transported over UDP. A browser application cannot open an ordinary arbitrary UDP socket; its WebSocket client needs a companion that translates validated control values to the target's documented OSC addresses. This is an architectural inference from the transport interfaces and OSC specification. [OSC 1.0 specification](https://opensoundcontrol.stanford.edu/spec-1_0.html), [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

A future companion should serve a local app and loopback WebSocket endpoint, with an explicit fixed target host/port and allowlisted OSC addresses. It must bound messages, suppress unchanged updates, reject arbitrary forwarding and validate origins/session authorization. The public HTTPS demo must not assume an unsecured localhost WebSocket will work; mixed-content/local-network browser rules must be tested for the chosen deployment. Docker Compose can provide the optional companion profile; the host browser continues to own camera/audio/MIDI access. The companion does not process guitar audio or invoke AI.

No OSC bridge is shipped by this research ticket. Acceptance is a capability matrix and a decision for the smallest justified next integration, as specified in EVR-117.

## Native SDK and license review

- Current CLAP headers use MIT licensing. Pin the SDK revision and retain notices if adopted. [Upstream license](https://github.com/free-audio/clap/blob/main/LICENSE)
- The current VST3 SDK repository uses MIT licensing. Historical VST3 licensing differs; review the exact selected SDK and submodules instead of relying on older dual-license summaries. [Current SDK license](https://github.com/steinbergmedia/vst3sdk/blob/master/LICENSE.txt)
- JUCE is a separate framework with its own licensing options. Selecting a plugin format does not settle framework licensing. Resolve those terms explicitly before adding JUCE to an Apache-2.0 project. [JUCE upstream licensing](https://github.com/juce-framework/JUCE/blob/master/LICENSE.md), [JUCE EULA](https://juce.com/legal/juce-8-licence/)
- Audio Unit development uses Apple's SDK and platform tooling; evaluate the applicable distribution/toolchain terms and host requirements for an actual prototype. [Apple AUv3 documentation](https://developer.apple.com/documentation/audiotoolbox/audio-unit-v3-plug-ins)

No native format is loaded into the browser audio callback. A future plugin bridge must define parameter timestamps, threading, loss/reconnect behavior and measured end-to-end latency before use in performance. The browser patch/control representation remains independent of any selected SDK.

## Hardware references and evidence

Manufacturer-documented HX Stomp and GT-1000 integration paths, their source manuals and the current pending compatibility matrix are in [the rig test guide](../public/docs/rig-integrations.md). Firmware-specific CC assignments and program numbering require real device checks. Manufacturer MIDI support is not evidence that Patchcraft has been validated on that device.
