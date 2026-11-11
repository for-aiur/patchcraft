# Cloudflare Pages deployment

The `Checks` workflow runs the Docker Compose test suite on pushes and pull requests.
Pushes and pull requests do not deploy. Publishing a GitHub release uploads the
exact static files produced inside the test container to the Cloudflare Pages
project `patchcraft`. A staging preview is available on demand from Actions →
Checks → Run workflow. The optional authoring API, Gemini credentials and database
are not included in the static deployment.

The workflow expects a Pages project whose slug is `patchcraft`. Cloudflare does
not allow changing a `pages.dev` subdomain. The first YNY-19 preview creates the
new project. The staging workflow creates it if needed, and the first release
publishes the production site. Keep the previous project until the new deployment
is verified.

## One-time configuration

In Cloudflare, create an API token with **Account → Cloudflare Pages → Edit**,
limited to the account containing `patchcraft`. Use a dedicated deployment
token rather than a personal Wrangler OAuth session or Global API Key.

In GitHub, open repository **Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN`: the dedicated token.
- `CLOUDFLARE_ACCOUNT_ID`: the account ID from the Cloudflare dashboard.

Repository secrets or secrets on the `staging` and `production` GitHub environments
are supported. Never put token values in source, PR descriptions or workflow logs.
The Pages API token should be limited to the required Cloudflare account and Pages
permissions. If required reviewers are configured on either environment, staging
or production deployments wait for their approval.

## Publishing and verification

Publish a GitHub release whose tag matches `package.json`. The workflow runs build,
unit, integration and browser checks, stores `dist` as an artifact, then publishes
that tested artifact to production. Deployments are serialized. The last successful
deployment remains live when checks or publishing fail. The final step fetches the
production Visual Lab page and checks its JavaScript asset against the tested
artifact. Its deployment URL appears in the job summary.

For an occasional staging deployment, use Actions → Checks → Run workflow and leave
`Deploy staging preview` selected. Tests still run first, then the tested build is
published to the stable `stage` alias. This is manual, so routine commits do not
consume Pages deployments. If a secret was missing, add it and rerun the workflow.

Public URL: https://patchcraft.pages.dev/visual-lab

## Rollback

Use Cloudflare Pages → `patchcraft` → Deployments to roll back to a known good
production deployment. Revert the problematic commit on `main` through a PR so
the next automated deployment preserves that correction. A rollback affects the
static frontend only.

Local development remains `docker compose up --build`; no Cloudflare credentials
are required locally. Local checks remain `docker compose run --rm tests`.

References: [Cloudflare Direct Upload CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[official Wrangler action](https://github.com/cloudflare/wrangler-action).

## Visible build version

All app pages show a compact version badge in the footer. `package.json` is the
version source. Main builds are labeled `v<version> · dev`, followed by a short
commit link; CI passes the full commit SHA into the Compose build.
The same metadata is published as `/build-info.json`.

Publishing a GitHub release runs the same checks and automatically deploys the
tested release artifact to production. The release tag must match `package.json` as
`v<version>`; the visible badge then links to that exact GitHub release. Create
the release from its matching source commit. Development builds remain labeled
as development builds.
