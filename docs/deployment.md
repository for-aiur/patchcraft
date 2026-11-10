# Cloudflare Pages deployment

The `Checks` workflow runs the Docker Compose test suite on pushes and pull requests.
After a successful `main` run, it uploads the exact static files produced inside
the test container to the existing Cloudflare Pages project `patchcraft-m1`.
Pull requests and other branches do not deploy. The optional authoring API,
Gemini credentials and database are not included in the static deployment.

## One-time configuration

In Cloudflare, create an API token with **Account → Cloudflare Pages → Edit**,
limited to the account containing `patchcraft-m1`. Use a dedicated deployment
token rather than a personal Wrangler OAuth session or Global API Key.

In GitHub, open repository **Settings → Secrets and variables → Actions** and add:

- `CLOUDFLARE_API_TOKEN`: the dedicated token.
- `CLOUDFLARE_ACCOUNT_ID`: the account ID from the Cloudflare dashboard.

Repository secrets or secrets on the `production` GitHub environment are supported.
Never put token values in source, PR descriptions or workflow logs. Configure the
`production` environment to permit deployment from `main` only. If required
reviewers are configured, deployments wait for their approval.

## Publishing and verification

Merge an approved PR into `main`. The workflow runs build, unit, integration and
browser checks, stores `dist` as an artifact, then publishes that tested artifact.
Deployments are serialized; a build superseded by a newer `main` commit is skipped.
The last successful deployment remains live when checks or publishing fail.
The final step fetches the deployment's Visual Lab page and checks its JavaScript
asset against the tested artifact. Its deployment URL appears in the job summary.

The workflow can also be run manually through Actions → Checks → Run workflow,
selecting `main`. All checks still run. If a secret was missing, add it and rerun
the failed deploy job while the build artifact is available (seven days), or run
the workflow again on `main`.

Public URL: https://patchcraft-m1.pages.dev/visual-lab

## Rollback

Use Cloudflare Pages → `patchcraft-m1` → Deployments to roll back to a known good
production deployment. Revert the problematic commit on `main` through a PR so
the next automated deployment preserves that correction. A rollback affects the
static frontend only.

Local development remains `docker compose up --build`; no Cloudflare credentials
are required locally. Local checks remain `docker compose run --rm tests`.

References: [Cloudflare Direct Upload CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/),
[official Wrangler action](https://github.com/cloudflare/wrangler-action).
