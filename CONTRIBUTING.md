# Contributing

Thanks for helping improve Patchcraft. For substantial changes, open an issue or
discussion first so the change can be coordinated with the project.

## Development

Run the application and automated checks with Docker Compose:

```sh
docker compose up --build
docker compose run --rm tests
```

The browser accesses camera, audio and MIDI devices directly. Docker only serves
the application.

## Pull requests

- Keep changes focused and explain their user-facing effect.
- Include or update automated coverage where appropriate.
- Do not include API keys, credentials or private recordings.
- Preserve existing contributor attribution and follow the Apache-2.0 license.
