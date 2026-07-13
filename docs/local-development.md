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
- `TTS_SERVICE_TOKEN` (optional bearer token for a remote/tunneled TTS service)
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

## Remote GPU TTS development

When using the prepared EC2 GPU service, set `TTS_SERVICE_URL` to the local SSH
tunnel endpoint and set the matching token:

```dotenv
TTS_SERVICE_URL=http://127.0.0.1:8001
TTS_SERVICE_TOKEN=replace_with_the_ec2_token
```

Run `npm run dev:web` and `npm run dev:api` separately so the local CPU TTS is
not started. The complete Free Plan-conscious runbook is
`docs/aws-gpu-tts-deployment.md`.

## Response and audio cache verification

The default cache configuration is:

```dotenv
RESPONSE_CACHE_ENABLED=true
RESPONSE_CACHE_BUCKET=response-audio
RESPONSE_CACHE_SIMILARITY_THRESHOLD=0.90
RESPONSE_CACHE_TOP_K=3
```

After applying migration `004`, send a message once and then send an accent/punctuation variant. A cache hit exposes `response-cache` with `desc="HIT"` and `mistral;dur=0` in the `/api/chat` `Server-Timing` header. Repeating TTS with the same text, voice, and style returns `X-TTS-Cache: SUPABASE_HIT`.
