# 3D AI Companion

A browser-based VRM companion with a responsive 3D stage, expressive VRMA motion, Mistral chat, Supabase-backed conversations and memory, and optional local VieNeu TTS.

## Experience

The current frontend is designed around the character instead of treating the Three.js canvas as a background:

- Responsive stage, chat dock, and Companion Studio layouts for mobile, tablet, desktop, and short screens.
- First-visit onboarding, contextual help, empty-state prompts, loading progress, network status, and non-blocking toasts.
- Camera zoom/reset/fullscreen controls, focus mode, animation search, character/background cards, a semantic quick-interaction palette, and two local music performances.
- Direct character interaction: pointer/touch hit testing, gaze following, natural blinking, wave/nod/gentle/curious responses, speech bubbles, and quiet ambient moments.
- Accessible tabs and controls with keyboard focus states, ARIA state, screen-reader status updates, reduced-motion support, and IME-safe chat input.
- Conversation search, rename, delete, export, replay, quick new chat, and long-term-memory view/edit/delete controls.
- Local experience preferences preserve the selected character, background, studio state, chat-collapse state, onboarding state, and reduced-motion choice.
- Onboarding explains long-term memory before use and links directly to its controls; every character has its own bounded persona and dynamic UI identity.

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

The shared registry exposes 38 companion animations plus two music-synchronized performance assets. Eight core motions are generated deterministically at 30 fps:

- `Relax.vrma` — regenerated seamless idle loop.
- `Listening.vrma` — attentive loop used while speech input is active.
- `Thinking.vrma` — regenerated seamless thinking loop.
- `Talking.vrma` — conversational loop used during voice playback.
- `GentleGesture.vrma` — calm conversational one-shot.
- `CuriousTilt.vrma` — curiosity/attention one-shot.
- `Nod.vrma` — short acknowledgement.
- `Wave.vrma` — short greeting.

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
uv sync --project apps/tts
npm run dev
```

Open `http://127.0.0.1:3001/`.

Services:

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3002`
- TTS: `http://127.0.0.1:8000`

Run services separately with `npm run dev:web`, `npm run dev:api`, and `npm run dev:tts`.

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
