# Patchcraft

<p align="center">
  <strong>Let your surroundings play.</strong><br>
  Turn live camera signals into expressive controls for the music gear you already use.
</p>

<p align="center">
  <a href="https://patchcraft-m1.pages.dev/vision"><strong>Open the live demo →</strong></a>
</p>

<p align="center">
  <a href="https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml"><img alt="CI" src="https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache--2.0-blue.svg"></a>
</p>

Patchcraft explores a simple idea: a change in light, color, or motion can shape
the sound of a performance. Its camera-to-MIDI prototype reads visual signals in
your browser and sends MIDI controls to a mapped effect in your DAW. Your guitar
can stay in its usual signal chain.

## Current stage

Patchcraft is in an early open testing phase. The live prototype supports a
basic camera signal → MIDI control mapping for a MIDI-capable DAW and mapped
effect parameter. We are gathering hands-on feedback about setup, reliability
and how the visual controls feel while playing, then using it to shape the next
iteration. Real equipment compatibility and physical response latency are still
being evaluated; the demo reports software timings only, not measured end-to-end
latency.

## Where we're headed

- Reliable live audio and camera-to-MIDI control
- Flexible patches that connect multiple signals, processors and effect controls
- Conversational patch creation, followed by sharing and remixing

We are validating the live musician workflow now. These directions will grow
from feedback and tested hardware support.

## Run locally

Install Docker with Compose, then run:

```sh
docker compose up --build
```

Open [http://localhost:5173/vision](http://localhost:5173/vision) in a supported
browser and allow camera access when prompted. The browser accesses your camera
and MIDI devices; Docker only serves the app. No cloud account or host-installed
Node.js is required.

Run the automated checks:

```sh
docker compose run --rm tests
```

## CI and hosting

GitHub Actions runs the Docker-based build, type checks and automated tests on
pushes and pull requests. The public demo is hosted on Cloudflare Pages and is
currently updated manually; CI does not publish deployments automatically.

- [Live demo](https://patchcraft-m1.pages.dev/vision)
- [CI runs](https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance and [SECURITY.md](SECURITY.md)
to report a vulnerability. Patchcraft is licensed under [Apache 2.0](LICENSE).
