# Contributing

Thanks for helping improve Patchcraft. Start with a focused change that makes
the camera-to-MIDI workflow clearer, more reliable, or more useful to musicians.

## Start the app

Install Docker with Compose, then run this from the repository root:

```sh
docker compose up --build
```

Open `http://localhost:5173/visual-lab.html` or
`http://localhost:5173/vision`. The browser accesses the camera and MIDI
devices; Docker only serves the app. No host Node.js, Python, or database is
required for the standard setup.

## Run checks

```sh
docker compose run --rm tests
```

## Send a change

- Open a GitHub issue or discussion first for larger changes.
- Keep pull requests focused and describe the user-visible effect.
- Add or update automated coverage when behavior changes.
- Never include API keys, credentials, or private camera, audio, or video
  recordings.
- Preserve existing contributor attribution and the Apache-2.0 license.

For security reports, see [SECURITY.md](SECURITY.md).
