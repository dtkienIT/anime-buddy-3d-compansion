# Local Development

## Required tools

- Node.js 22 or newer.
- npm 10 or newer.
- Python compatible with the installed TTS stack.
- uv.

`pnpm` was not installed on this machine during implementation. The repository includes `pnpm-workspace.yaml`, but npm workspaces are the active verified workflow.

## Environment

Copy `.env.example` to `.env` and fill only local values. Do not add `VITE_MISTRAL_API_KEY`, `VITE_SUPABASE_SECRET_KEY`, or `VITE_SUPABASE_SERVICE_ROLE_KEY`.

Backend-only:

- `MISTRAL_API_KEY`
- `MISTRAL_MODEL`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TTS_SERVICE_URL`
- `RESPONSE_CACHE_ENABLED`
- `RESPONSE_CACHE_BUCKET`
- `RESPONSE_CACHE_SIMILARITY_THRESHOLD`
- `RESPONSE_CACHE_TOP_K`

Frontend-safe:

- `VITE_API_BASE_URL`

## Database Setup

Apply the migrations to your Supabase instance:

```powershell
# Apply original schema and memory schema
supabase db push
# Or run the files directly in Supabase SQL editor:
# 1. supabase/migrations/001_chat_schema.sql
# 2. supabase/migrations/002_persistent_memory.sql
# 3. supabase/migrations/003_memory_extraction_outbox.sql
# 4. supabase/migrations/004_response_audio_cache.sql
```

## Install

```powershell
npm install
uv sync --project apps/tts
```

VieNeu-TTS package/model setup, if available for your Python runtime:

```powershell
uv sync --project apps/tts --extra vieneu
```

## Run

```powershell
npm run dev
```

Or run services separately:

```powershell
npm run dev:web
npm run dev:api
npm run dev:tts
```

## Verify

```powershell
npm run check:env
npm run verify-assets
npm run lint
npm run typecheck
npm run test
npm run test:python
npm run build
```

`verify-assets` validates the complete public model, VRMA, background, and local performance-audio inventory. It also runs the deterministic core-motion check.

To intentionally regenerate the first-party companion motions:

```powershell
npm run generate:animations
npm run verify:generated-animations
```

The generator owns `Relax.vrma`, `Listening.vrma`, `Thinking.vrma`, `Talking.vrma`, `GentleGesture.vrma`, `CuriousTilt.vrma`, `Nod.vrma`, and `Wave.vrma` in both `animations/` and `apps/web/public/animations/`. Do not edit or copy only one side. Generated files are 30 fps VRMA 1.0 GLBs; verification checks byte-for-byte reproducibility, source/public parity, tracks, and seamless endpoints for looped clips.

With all three services running:

```powershell
npm run smoke-test
node tests/browser/probe-memory-e2e.mjs memory-e2e-after-timing.json
```

The memory probe writes sanitized JSON and screenshots under `test-results/browser/memory/`. It fails the process if core recall/forget/disabled-memory expectations are false.

The formal five-run memory artifact now passes the retrieval budget: memory wall p95 is 497 ms against a 700 ms target, with no timeout or fallback in that sample. Remote Supabase latency should still be monitored.

## Frontend experience QA

With the web app running at `http://127.0.0.1:3001`:

```powershell
npm run test:browser:responsive
npm run test:browser:experience
npm run test:browser:animations
npm run test:browser:interactions
# Responsive followed by experience:
npm run test:browser:ui
```

The probes seed `animeBuddy.uiPreferences.v2` so onboarding, chat-collapse state, and the Studio drawer start deterministically. They write screenshots and JSON under `test-results/browser/`. The current working tree passes responsive `9/9`, experience `9/9`, animation `36/36`, and interaction/audio scenarios `8/8`; reports are under the matching subdirectories. To watch the journey in the installed Google Chrome, run `node tests/browser/probe-experience.mjs --headed`.

Manual keyboard checks:

- `/` focuses the chat composer.
- `C` toggles Companion Studio.
- `R` resets the camera.
- `F` toggles focus mode.
- `?` opens help.
- `Esc` stops an active performance or closes the active dialog, Studio, data menu, or focus mode.

On compact layouts, opening Companion Studio temporarily collapses chat to preserve the 3D stage and restores the user's prior chat state when Studio closes. Reduced-motion, selected character/background, chat collapse, onboarding state, and Studio state persist locally. The long-term-memory toggle starts disabled until the API preference request completes; onboarding links directly to this control instead of silently opting the user into an invisible behavior.

## Windows Sandbox Notes

During the 2026-07-10 takeover run, this environment denied writes to some existing ignored generated directories such as `apps/web/node_modules/.vite-temp`, `dist/`, and `.uv-cache` when commands ran inside the sandbox.

- Web Vitest uses `vitest run --configLoader runner` to avoid Vite writing a temporary bundled config under `apps/web/node_modules/.vite-temp`.
- `npm run build` and `npm run test:python` passed when run outside the sandbox because they need to write existing generated output/cache paths.
- Do not delete or reset those generated directories as part of normal QA; use a shell with the correct permissions.

## Audio quality probes

With Web/API/TTS running:

```powershell
uv --cache-dir .uv-cache run --project apps/tts python scripts/audio_quality_probe.py --out test-results/audio-quality/final
node tests/browser/probe-audio-worklet.mjs
node tests/browser/collect-baseline.mjs "1+3=?" "final-real-chat.json" replay
```

Generated WAVs and browser artifacts are written under `test-results/`, which is ignored by git.

## Response and audio cache verification

The default cache configuration is:

```dotenv
RESPONSE_CACHE_ENABLED=true
RESPONSE_CACHE_BUCKET=response-audio
RESPONSE_CACHE_SIMILARITY_THRESHOLD=0.90
RESPONSE_CACHE_TOP_K=3
```

After applying migration `004`, `/api/chat` currently exposes `response-cache;dur=0;desc="BYPASS"`. Reusable assistant-text matching is intentionally disabled because replies can contain user-specific long-term memory; serving a fuzzy cached answer would risk stale or cross-user content. The independent TTS audio cache remains enabled: repeating synthesis with the same text, voice, and style can return `X-TTS-Cache: SUPABASE_HIT`.
