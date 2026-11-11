# Patchcraft

<p align="center">
  <img src="public/patchcraft-mark.svg" alt="Patchcraft mark" width="56" height="56"><br>
  <strong>Let the scene play your sound.</strong><br>
  Turn changes in light, color, and motion into MIDI controls for the music gear you already use.
</p>

<p align="center">
  <a href="https://patchcraft.pages.dev/"><strong>Patchcraft home</strong></a>
  ·
  <a href="https://patchcraft.pages.dev/visual-lab"><strong>Open Visual Signal Lab ↗</strong></a>
</p>

<p align="center">
  <a href="https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml"><img alt="CI" src="https://github.com/for-aiur/patchcraft/actions/workflows/checks.yml/badge.svg"></a>
  <a href="https://github.com/for-aiur/patchcraft/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/for-aiur/patchcraft?include_prereleases"></a>
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache--2.0-blue.svg"></a>
</p>

Patchcraft reads a camera or video in your browser, turns visual changes into
control signals, and sends those signals as MIDI CC messages to music software.
Your instrument audio stays in its usual signal path.

## What you can do

- Use a live camera, a built-in scene, or a looping local video.
- Build visual processing pipelines with color, grayscale, blur, threshold,
  morphology, motion, and region measurements. Preview each step as it runs.
- Combine up to eight measurements into named control signals with weights,
  calibration, and smoothing.
- Map signals to MIDI CC numbers and channels, then assign them to parameters in
  a DAW or plugin using its MIDI Learn feature.
- Save and share recipes as JSON files.

Image processing runs in the browser. Camera frames and local video files are
not uploaded by the static app.

## Developers

### Start locally

Install Docker with Compose. No host-installed Node.js, Python, or database is
needed.

```sh
docker compose up --build
```

Open [Visual Signal Lab](http://localhost:5173/visual-lab.html).

### Run checks

```sh
docker compose run --rm tests
```

### Project layout

- `src/vision/` contains camera input and visual processing.
- `src/control/` contains signal and mapping logic.
- `src/midi/` contains MIDI output.
- `src/recipes/` contains built-in visual recipes.
- `tests/` contains automated checks.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor guidance.

## About

Patchcraft is an open-source project by YNY Labs, licensed under
[Apache 2.0](LICENSE). Project details are being prepared on the
[About page](https://patchcraft.pages.dev/about.html). Report a problem through
[GitHub Issues](https://github.com/for-aiur/patchcraft/issues).
