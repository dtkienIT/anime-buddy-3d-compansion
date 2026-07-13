# 3D AI Companion

Package-managed VRM/VRMA companion app with a Vite frontend, Fastify API, Supabase chat history, and a local FastAPI TTS service.

## Quick Start

Create `.env` from `.env.example`, then fill backend-only secrets:

```powershell
Copy-Item .env.example .env
npm install
uv sync --project apps/tts
npm run dev
```

Open:

```text
http://127.0.0.1:3001/
```

Services:

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3002`
- TTS: `http://127.0.0.1:8000`

## Commands

```powershell
npm run dev
npm run dev:web
npm run dev:api
npm run dev:tts
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:python
npm run check
npm run verify-assets
npm run smoke-test
```

## Audio QA

The TTS path uses explicit PCM metadata for cache HIT playback and a WAV fallback for cache MISS quality. To regenerate audio integrity artifacts:

```powershell
uv --cache-dir .uv-cache run --project apps/tts python scripts/audio_quality_probe.py --out test-results/audio-quality/final
node tests/browser/probe-audio-worklet.mjs
```

See `docs/tts-audio-quality-report.md`, `docs/tts-latency-report.md`, `docs/browser-qa-report.md`, and `docs/response-cache-qa-report.md`.

`pnpm-workspace.yaml` is present for pnpm users, but this machine did not have pnpm installed during implementation, so npm workspaces are the verified package manager.

## Current QA Snapshot

Long-reply audio look-ahead verification on 2026-07-13 added timeout-safe speech chunks (target 100-120, hard split limit 140 characters) and a three-chunk initial WAV reserve. A browser fault-injection run using the reported Vietnamese cat story completed six delayed MISS-style TTS responses and scheduled all five chunk boundaries with `0 ms` gap. The local VieNeu CPU path remains the limiting factor: a real uncached long-chunk run can still reach the 120-second backend timeout under concurrent WebGL load, so the look-ahead queue removes frontend scheduling gaps when audio is ready but does not make slow model inference faster.

Response/audio cache verification on 2026-07-12 confirmed that normalized and fuzzy input variants reuse the approved Supabase response, bypass Mistral (`mistral;dur=0`), and return stored WAV audio with `X-TTS-Cache: SUPABASE_HIT`.

Takeover rerun on 2026-07-10 verified:

- `/api/sessions` returns `400` for missing `anonymousId` and a bounded `503` fallback instead of hanging when Supabase reports `PGRST205`.
- After applying `001_chat_schema.sql` and `002_persistent_memory.sql`, live browser memory E2E passed with Supabase-backed session creation, history restore, browser restart, new-chat recall, contradiction, forget, memory-disabled skip, and final memory re-enable.
- `/api/chat` now emits request-local memory timing; disabled-memory responses include `memory-disabled;dur=0` and zero memory DB timings.
- Browser real chat completed with Mistral `200`, TTS MISS WAV playback, and cache HIT replay.
- Cache HIT replay used `f32le`, 48 kHz, mono PCM with `0` underflows, drops, and duplicated frames.
- Audio quality probe correlation remained `1.0` for direct/Python/API streams and MISS cache comparison.

Current blockers:

- Real Mistral output is not token-streamed, so first visible text can miss the 1 s goal.
- Warm cache MISS TTS remains CPU-bound (9.72 s p95 versus the 4 s goal), and a real multi-chunk MISS exceeds the 90 s browser budget.
- Supabase outage, missing VRMA `finished`, and initially suspended AudioContext fault injection remain only partially covered.
- `npm audit --audit-level=high` was blocked by the approval layer because it would disclose dependency metadata to the npm registry.

## Security

- Mistral requests go through `apps/api`; the frontend never receives `MISTRAL_API_KEY`.
- Supabase secret/service keys are backend-only and must not use a `VITE_` prefix.
- Frontend variables are limited to `VITE_API_BASE_URL` and optional publishable Supabase values if direct frontend Supabase access is added later.
- AI output is inserted with `textContent`, not rendered as HTML.

## Legacy Viewer

The original standalone viewer files remain at the repository root:

- `index.html`
- `app.bundle.js`
- `chat-client.js`
- `server.mjs`
- `start-mika.bat`

Use `start-mika.bat` only for the old static viewer. Use `npm run dev` or `start-ai.bat` for the upgraded companion.
