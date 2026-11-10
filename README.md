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

The default startup runs only the browser app. Database and Gemini authoring services are optional and use the `authoring` profile; the Compose test command starts the test dependencies when needed.

For local visual-signal checks, open `http://localhost:5173/visual-lab.html` after the app starts. Choose one of the included recipes, select a local video file (it stays in the browser) or use the camera, add/reorder image-processing stages, and adjust the weighted signal. The page can send its output over Web MIDI to LoopBe or another MIDI port for receiver-side MIDI Learn. Use the displayed processing timings for development checks only; they are not hardware performance claims.

The Visual Lab keeps Color Focus, Motion Pulse, Light Sweep and Scene Energy in the Simple recipes group. Explore adds Texture Drive (Sobel edges), Shadow Gate (Otsu), Local Pattern (adaptive threshold), Moving Foreground (background subtraction), Motion Area (changed-pixel mask) and Color Position (largest red-region X). Open Recipe guide for setup, MIDI target and limitations. Temporal masks require a fixed camera and are affected by lighting changes; Color Position selects the largest region rather than tracking an object's identity.

Recipes are discovered from `src/recipes/*.json` at dev/build time. Download an edited recipe as JSON, put the reviewed file in that directory with a unique ID, then restart/rebuild. Source-control changes follow the normal authorized commit workflow. Each image step can declare selected `measurements`; `routes` connect `stage-id|measurement` to mixer inputs. Calibration and smoothing settings travel with the recipe. No database is required.

Run the automated checks:

```sh
docker compose run --rm tests
```

## CI and hosting

GitHub Actions runs the Docker-based build, type checks and automated tests on
pushes and pull requests. The public demo is hosted on Cloudflare Pages and is
automatically updated after a successful `main` test run once deployment secrets
are configured. See [deployment setup and rollback](docs/deployment.md).

- [Live demo](https://patchcraft-m1.pages.dev/vision)
- [CI runs](https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidance and [SECURITY.md](SECURITY.md)
to report a vulnerability. Patchcraft is licensed under [Apache 2.0](LICENSE).
