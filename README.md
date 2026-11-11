# Patchcraft

<p align="center">
  <strong>Let your surroundings play.</strong><br>
  Turn changes in light, color, and motion into MIDI controls for the music gear you already use.
</p>

<p align="center">
  <a href="https://patchcraft-m1.pages.dev/visual-lab"><strong>Open Visual Signal Lab →</strong></a>
  ·
  <a href="https://patchcraft-m1.pages.dev/vision">Try the simple camera-to-MIDI demo</a>
</p>

<p align="center">
  <a href="https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml"><img alt="CI" src="https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache--2.0-blue.svg"></a>
</p>

Patchcraft reads a camera or video in your browser, turns visual changes into
control signals, and sends those signals as MIDI CC messages to music software.
Your instrument audio stays in its usual signal path.

## What you can do

- Use a live camera, a built-in simulator, or a looping local video.
- Build visual processing pipelines with color, grayscale, blur, threshold,
  morphology, motion, and region measurements. Preview each step as it runs.
- Combine up to eight measurements into a named control signal with weights,
  calibration, and smoothing.
- Map signals to MIDI CC numbers and channels, then assign them to parameters in
  a DAW or plugin using its MIDI Learn feature.
- Save and share recipes as JSON files.

The included recipes range from simple light and motion controls to edge
texture, foreground masks, and color-position controls. Image processing runs
in the browser; camera frames and local video files are not uploaded by the
static demo.

## Try it

1. Open [Visual Signal Lab](https://patchcraft-m1.pages.dev/visual-lab) and pick
   a recipe or start with an empty one.
2. Choose a camera or local video and adjust the processing steps and signal.
3. Select a MIDI output, CC, and channel. In your DAW or plugin, use MIDI Learn
   to assign that control to a parameter.

The browser and receiving music app must be able to access the same MIDI port.
Some operating systems require a virtual MIDI port to connect them.

Patchcraft is an early open-source prototype. Device and browser support varies;
the displayed processing timings are not physical camera-to-instrument latency
measurements.

## Developers

### Start the app

Install Docker with Compose. No host-installed Node.js, Python, or database is
needed.

```sh
docker compose up --build
```

Open the app:

- [Visual Signal Lab](http://localhost:5173/visual-lab.html)
- [Camera-to-MIDI demo](http://localhost:5173/vision)

The browser accesses cameras and MIDI devices directly; Docker serves the app.
The standard local setup needs no cloud account or API key.

### Run checks

```sh
docker compose run --rm tests
```

### Project layout

- `src/vision/` — camera input and visual processing
- `src/control/` — control signal and mapping logic
- `src/midi/` — MIDI output
- `src/recipes/` — built-in visual recipes
- `tests/` — automated checks

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow.

## About and support

Patchcraft is an open-source project by YNY Labs. Read the [contribution
guide](CONTRIBUTING.md), report a problem through [GitHub
Issues](https://github.com/for-aiur/patchcraft/issues), or browse the
[source code](https://github.com/for-aiur/patchcraft). The project is licensed
under [Apache 2.0](LICENSE).
