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

With all three services running:

```powershell
npm run smoke-test
node tests/browser/probe-memory-e2e.mjs memory-e2e-after-timing.json
```

The memory probe writes sanitized JSON and screenshots under `test-results/browser/memory/`. It fails the process if core recall/forget/disabled-memory expectations are false.

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
