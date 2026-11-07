# Conversational patch authoring

Run `docker compose up --build`, then open http://localhost:5173/vision. The manual camera/MIDI/audio app works without a cloud account. For authoring, set `GEMINI_API_KEY` in the ignored root `.env` and recreate the authoring service. No Ollama or local model is used. Secrets are interpolated into the backend only, never Vite variables or build arguments.

The browser owns media devices and MIDI. The API (Node, LangChain, bounded LangGraph) and PostgreSQL/pgvector run inside Compose. The authoring API is reachable through the local app proxy and has no host port. Do not expose this development API publicly without authentication, rate quotas and HTTPS. The existing live demo remains independent of the local backend.

## Authoring contract

The model edits a versioned `Scene`: up to eight parallel camera-feature branches, each with an input, up to four ordered processors, an effect parameter and an approved destination. Upsert, remove, rename and camera configuration edits compile into the existing typed patch graph. Independent output IDs route each branch to its MIDI mapping. Browser cutoff, drive and tremolo can run concurrently in the existing fixed DSP order. This does not insert plugins or change Ableton's audio routing. Unsupported requests require a clarification. Program Change remains manually configured and is preserved on import.

A request includes bounded conversation history, the current scene/revision, approved targets and optionally numerical feature summaries. Raw camera frames, audio, MIDI device identifiers and secrets are excluded. Sending this context to Gemini requires UI consent. Tracing has a separate consent checkbox. The model cannot execute code, access arbitrary URLs, read files, select ports or arm outputs.

Three allowlisted LangChain tools read the patch, target registry and versioned catalog. LangGraph reads context, invokes structured Gemini output, and validates it deterministically. At most two model calls, 4096 output tokens per call, 90 seconds per HTTP request and two concurrent authoring requests are allowed. Invalid output, provider failure and cancellation preserve the applied graph. Results carry their base revision; concurrent manual changes invalidate pending work.

Normal proposals are reviewed before application. Application disarms outputs, clears MIDI port selections and stops capture to confirm camera settings. Restart the camera and explicitly rearm. Undo also requires rearming. Existing rig and patch files remain supported.

Adaptive sessions last at most 60 seconds, with a minimum ten-second interval and one request in flight. The user authorizes exact branch/processor/parameter min, max and maximum-delta envelopes. All other scene fields must remain byte-equivalent. No topology, target, camera, route, name or Program Change changes are allowed. Numeric updates preserve graph memory and existing MIDI bindings. Hidden/stale camera data, manual edits, timeout, cancellation or expiry stop adaptation. Network failure does not stop the audio renderer.

## Retrieval and diagnostics

The built-in Apache-2.0 feature/processor/effect/target catalog includes version, source, license and SHA-256 chunk hashes. Ingestion validates documents before embeddings, transactionally upserts and deletes stale chunks within one index version, and isolates embedding models. Explicit deletion is available. Startup creates the initial PostgreSQL schema idempotently. Named volumes preserve index data.

`Index built-in catalog locally` uses lexical retrieval without a provider. `Embed catalog with Gemini` calls `gemini-embedding-001` with 768 dimensions. Hybrid retrieval fuses exact lexical matches and vector rankings. Missing database, embeddings or compatible vectors fall back to the local versioned catalog, without changing the real-time graph.

The diagnostics view exposes retrieval evidence, software authoring durations, model-call counts, reports and deterministic evaluations. Fixture runs are explicitly marked as fixtures and are not provider evidence. Real Gemini evaluation is opt-in and checks whole-structure construction, incremental preservation and unsupported capabilities. Audio and physical camera-to-DAW latency are not inferred from these timings.

Langfuse export is optional: configure server-side `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` and `LANGFUSE_BASE_URL`. Only explicitly consented calls attach a tracing callback. The backend stores only bounded run metadata locally (at most 50 in memory; PostgreSQL entries expire after a day). Authoring transcripts stay in the tab unless the user exports them or consents to tracing. Langfuse retention must be configured on that installation.

## Validation boundaries

Automated browser tests use fake camera devices and mocked MIDI ports. Fixture provider tests prove validation and UI behavior, not model quality or musician usability. Real Gemini tests require an API key and report actual outcomes separately. Hardware compatibility remains unverified until tested with real equipment; synthetic evidence is not sufficient.

For optional local tracing, start `docker compose -f compose.yaml -f compose.observability.yaml --profile observability up -d`. Open http://localhost:3000, create a local account/project, then set its public/secret keys and `LANGFUSE_BASE_URL=http://langfuse-web:3000` in `.env`. Recreate `authoring` and enable the tracing checkbox for a request. This optional stack requires additional Docker memory; manual app and Gemini authoring do not depend on it. Compose uses loopback-bound development credentials; replace them before any shared deployment. Based on the [official Langfuse Docker Compose](https://github.com/langfuse/langfuse/blob/main/docker-compose.yml).
