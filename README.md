# Patchcraft

YNY Labs' open-source browser audio and musician control platform. Current scope:
**Milestone 01 — Live Audio PoC & Latency Test**. Planning lives exclusively in
[Linear](https://linear.app/yildirim-labs/project/patchcraft-c3d5288da3ae).

## Run locally (EVR-106)

Install Docker with Compose, then from a clean checkout:

```sh
docker compose up --build
```

Open http://localhost:5173 in your host browser. Docker serves the app; your
browser owns USB hardware permissions and audio processing. No cloud account,
Node or Python installation is needed. Optional port: copy `.env.example` to
`.env`. Stop with `docker compose down`.

```sh
docker compose run --rm tests
```

The test service builds automatically and starts its own server. It type-checks,
builds, tests DSP safety with deterministic PCM fixtures, and runs Chromium smoke
and simulated-microphone tests. Synthetic tests do not establish physical latency.

Use wired headphones, disable direct monitoring and start with low hardware volume.
Select your USB interface and input channel. Start in bypass at -24 dB. Output is
capped at -6 dB; this is not a guarantee of safe acoustic loudness. Bypass keeps
the output gain. Stop releases capture. Disconnects/processor failures mute and
require an explicit restart. No recording or audio uploads occur.

## Architecture (EVR-94)

Vite/TypeScript static app, no backend. Capture → mono channel selection →
AudioWorklet sanitization/metering → parallel dry/low-pass → smoothed gain → output.
Linear dry/wet mix avoids a gain boost for correlated dry/filtered signals.
Native AudioParam automation smooths changes independently of the UI. Telemetry
is aggregated once per second; it cannot prove glitch-free device playback.
Audio graph ownership lives in `src/audio`; future control graph and MIDI/OSC/native
output adapters remain independent. External rigs will not need browser audio capture.
No camera, AI or network operation is in the audio path.

Desktop Chromium is the first validation target. Input/output APIs vary by OS and
browser; unsupported output selection uses OS settings. Requested rates may be
rejected or resampled; inspect actual rates. Docker Desktop uses the host browser,
not container audio. Remote plain HTTP/LAN addresses are not secure contexts:
use localhost or HTTPS. Backgrounding can suspend audio on some platforms.

## Diagnostics and validation (EVR-98 / EVR-100)

Browser base/output latency, actual rates, capture-processing flags, worklet frame
continuity, clipped/invalid samples, telemetry age and visible UI timer delays are
shown separately. Physical round-trip remains **not measured** until an external
wired test is performed. Export reports locally; review device labels before sharing.
See [the loopback and Erdem test procedure](public/docs/loopback.md).
No physical performance or compatibility claims have been validated yet.

## Temporary HTTPS release path (EVR-107)

No deployment has been performed. After explicit maintainer approval, build the
static artifact in Docker and upload `dist/` to any static HTTPS host (for example
Cloudflare Pages direct upload or Netlify manual deploy). No backend or production
infrastructure is needed. Build/export:

```sh
docker compose run --rm -v ./dist:/app/dist tests npm run build
```

Serve the artifact root including `assets/` and `docs/loopback.md`. Confirm HTTPS,
microphone permission, worklet asset loading, synthetic sample, live device routing,
stop/restart and report export on the actual public URL before sending it to Erdem.
Do not deploy, enable Pages workflows or publish automatically without permission.

## Contributing and license

See [AGENTS.md](AGENTS.md), [CONTRIBUTING.md](CONTRIBUTING.md) and
[SECURITY.md](SECURITY.md). Apache-2.0; see [LICENSE](LICENSE).
Dependencies and license review: [docs/dependencies.md](docs/dependencies.md).

## Current verification / handoff

- TypeScript check, Vite 7.3.7 production build and Node DSP tests passed in the
  Linux development workspace. No physical USB interface was available.
- Compose image creation using the initial all-browser image exceeded workspace
  disk capacity. Dockerfile now installs only Chromium headless shell on Node 22.
  The revised Compose build and Playwright suite have **not yet been verified**.
- On macOS with Docker Desktop, run the two Compose commands above. First test
  the synthetic sample, then the actual interface in the host browser.
- EVR-101/106/94/98/102/107 remain in progress. EVR-100 requires Erdem's hardware.
  No HTTPS demo has been published; physical RTT is not measured.
