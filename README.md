# 3D AI Companion

A browser-based VRM companion with a responsive 3D stage, expressive VRMA motion, Mistral chat, Supabase-backed conversations and memory, and optional local VieNeu TTS.

## Experience

- **Real-time SSE Streaming Chat**: `/api/chat/stream` streams tokens incrementally for instant typewriter UI rendering and sentence-level audio prefetching.
- **Audio Lip-Sync & Viseme Modulation**: Formant-aware spectral analysis maps audio to VRM blendshapes (`aa`, `ih`, `ou`, `ee`, `oh`) in real time for lifelike mouth movement.
- **Hands-Free Voice Mode & Barge-In**: Automatic speech interruption stops audio immediately when the user speaks.
- **Touch & Head-Pat Interaction**: Click/tap on character's head triggers blushing animations, floating heart particles, and warm vocal reactions.
- **Custom VRM Upload**: Load and interact with any local `.vrm` 3D model directly from Companion Studio.
- Responsive stage, chat dock, and Companion Studio layouts for mobile, tablet, desktop, and short screens.
- Direct camera gestures, focus mode, animation search, character/background cards, direct companion interaction, and five music-backed performances with distinct 3D stages.
- Accessible tabs and controls with keyboard focus states, ARIA state, screen-reader status updates, reduced-motion support, and IME-safe chat input.
- Conversation search, rename, delete, export, replay, quick new chat, and long-term-memory view/edit/delete controls.

Keyboard shortcuts:

| Key | Action |
| --- | --- |
| `/` | Focus the message composer |
| `C` | Toggle Companion Studio |
| `R` | Reset the camera |
| `F` | Toggle focus mode |
| `?` | Open help |
| `Esc` | Close the active overlay, drawer, menu, or focus mode |

## Motion library

The shared registry exposes 43 companion animations and five local music-backed performances. Nine core motions are generated deterministically at 30 fps:

- `Relax.vrma` — regenerated seamless idle loop.
- `Listening.vrma` — attentive loop used while speech input is active.
- `Thinking.vrma` — regenerated seamless thinking loop.
- `Talking.vrma` — conversational loop used during voice playback.
- `Singing.vrma` — expressive melodic motion loop.
- `GentleGesture.vrma` — calm conversational one-shot.
- `CuriousTilt.vrma` — curiosity/attention one-shot.
- `Nod.vrma` — short acknowledgement.
- `Wave.vrma` — short greeting.

`UiMugibatake.vrma` is an owner-downloaded third-party BOOTH motion registered
as a standalone 26.8-second Studio animation and Live Moments performance. Its
commercial reference song is not copied into the repository. The performance
uses the approved `Golden-Wheatlight-Original.mp3` runtime asset, an original
high-energy Uimugi Night Parade soundtrack generated with Gemini Pro/Lyria 3
and downloaded as MP3 after preview approval. The controller plays the first
26.8 seconds to match the motion. The detailed provenance and hash are in
[`docs/licenses/Golden-Wheatlight-Original.md`](docs/licenses/Golden-Wheatlight-Original.md).

The detailed BOOTH motion provenance and redistribution limits are documented
in [`docs/licenses/MaronYatsuhashi-BOOTH-5846143.md`](docs/licenses/MaronYatsuhashi-BOOTH-5846143.md).

Verify the approved Uimugi Night Parade soundtrack with:

```powershell
npm run verify:uimugi-music
```

The generator writes identical assets to `animations/` and `apps/web/public/animations/`, declares `VRMC_vrm_animation.specVersion` `1.0`, and validates tracks and loop endpoints. Generate or verify them with:

```powershell
npm run generate:animations
npm run verify:generated-animations
npm run verify-assets
```

Older third-party VRMA files that omit `specVersion` are normalized in memory immediately before parsing; source files are not mutated at runtime.

## Quick start

Create `.env` from `.env.example`, then fill backend-only secrets:

```powershell
Copy-Item .env.example .env
npm install
```

If `apps/tts/.venv` already exists, run the full project in three PowerShell
terminals from the repository root:

Terminal 1 - AI/TTS:

```powershell
.\apps\tts\.venv\Scripts\python.exe -m uvicorn --app-dir apps/tts app.main:app --host 127.0.0.1 --port 8000
```

Terminal 2 - API:

```powershell
npm run dev:api
```

Terminal 3 - Web:

```powershell
npm run dev:web
```

Open `http://127.0.0.1:3001/`.

Services:

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3002`
- TTS: `http://127.0.0.1:8000`

If `uv` is installed and available on `PATH`, install/sync the TTS environment
and start all three services in one terminal:

```powershell
uv sync --project apps/tts
npm run dev
```

`npm run dev:tts` also requires the `uv` command to be available on `PATH`.

## Verification

```powershell
npm run check:env
npm run verify-assets
npm run lint
npm run typecheck
npm run test
npm run test:python
npm run build
```

UI browser probes, with the web app running:

```powershell
npm run test:browser:responsive
npm run test:browser:experience
npm run test:browser:animations
npm run test:browser:interactions
```

For this UI/motion working tree, the full static/unit/Python/build gate passes. Fresh browser results are also recorded: responsive `9/9`, experience `9/9`, animation `36/36`, and interaction/audio fault scenarios `8/8`, all with zero application console errors in the UI probes. The experience suite also passes in the installed, visible Google Chrome via `node tests/browser/probe-experience.mjs --headed`. See [Current Status](docs/CURRENT_STATUS.md) and [Browser QA](docs/browser-qa-report.md) for artifacts and remaining limits.

## Current backend snapshot

- Persistent-memory functional E2E and the formal five-run benchmark passed. Memory wall p95 was `497 ms`, within the `700 ms` retrieval budget; remote Supabase variance remains worth monitoring.
- Reusable assistant-text cache lookup is intentionally bypassed so a fuzzy match cannot leak or stale a memory-personalized answer. TTS audio caching remains enabled.
- Offline message sync verifies that the supplied anonymous identity owns the target session before inserting.
- Cache HIT browser reply-to-audio p95 is `324 ms`. Cache MISS WAV synthesis remains CPU-bound and is intentionally outside the current UI upgrade.
- Long replies start playback after the first completed speech chunk. This replaced the earlier three-chunk startup reserve; later chunks are still synthesized and scheduled in order.
- Formal browser fault injection remains partial for a Supabase outage, a missing VRMA `finished` event, and an initially suspended `AudioContext`.

Audio integrity commands and historical measurements remain in `docs/tts-audio-quality-report.md`, `docs/tts-latency-report.md`, and `docs/response-cache-qa-report.md`.

## Security

- Mistral requests go through `apps/api`; the frontend never receives `MISTRAL_API_KEY`.
- Supabase secret/service keys are backend-only and must not use a `VITE_` prefix.
- Frontend variables are limited to `VITE_API_BASE_URL` and optional publishable Supabase values if direct frontend access is added later.
- AI output is inserted as text, not rendered as HTML.
- Never print or commit `.env`.

## Legacy viewer

The original standalone viewer remains at the repository root (`index.html`, `app.bundle.js`, `chat-client.js`, `server.mjs`, and `start-mika.bat`). Use `npm run dev` or `start-ai.bat` for the package-managed companion; `start-mika.bat` is only for the legacy viewer.
