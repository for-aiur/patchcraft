# Patchcraft contributor rules

Patchcraft is an independent YNY Labs open-source project owned by `for-aiur`.
The EVR issue prefix and Linear team name do not change that identity.

- Communicate with the maintainer in Turkish. Code, comments, technical documentation, Linear issues, commits and PR descriptions must be English.
- Linear is the sole planning source: https://linear.app/yildirim-labs/project/patchcraft-c3d5288da3ae . Read the relevant existing issue and acceptance criteria before implementation. Link all development to EVR issues; create an English issue before untracked scope. Do not create a competing roadmap.
- Current scope: milestone 01, Live Audio PoC & Latency Test (EVR-101, EVR-106, EVR-94, EVR-98, EVR-102, EVR-107, EVR-100). Follow the existing milestone order: audio PoC, patch engine, musician rig integrations, community, optional AI stack, independent deployment.
- Never commit, push, merge or deploy without explicit permission. Use `git config user.name "for-aiur"` and `git config user.email "yildirimmehmet82@gmail.com"` for authorized commits. Format: `EVR-###: Short descriptive message`.
- Do not add automated/bot authorship, Codex/AI co-author trailers, generated labels, signatures or promotional footers. Preserve other contributors' legitimate authorship.
- Local startup: `docker compose up --build`. Tests: `docker compose run --rm tests`. No host application dependencies or cloud account may be required. Optional future AI/GPU services use Compose profiles.
- Docker serves the application. The user's browser accesses USB audio, MIDI and camera hardware and processes audio locally.
- Keep audio graph, control graph and output adapters independent. A control graph must eventually support browser DSP, MIDI, OSC and native adapters without routing guitar audio through Patchcraft.
- No network, database, camera, LLM or unbounded work in an audio callback. UI or external input failure must not interrupt rendering. Smooth parameter changes; preserve safe gain, bypass and mute/fallback behavior.
- Do not confuse browser-reported latency, scheduling indicators and physically measured round-trip latency. Never claim playable latency without real hardware measurement. Report OS, browser/version, interface, sample rate, configuration and measurement method.
- Keep camera, patch editor, MIDI, community, RAG and production infrastructure out of milestone 01.
- Preserve Apache-2.0 licensing and dependency notices; check dependency compatibility on changes. Never commit secrets, tokens or personal audio/test recordings.
- Run relevant automated checks. State verification limits and hardware/deployment blockers honestly. Keep issue updates in English and user progress summaries in Turkish.
