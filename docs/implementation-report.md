# Implementation Report

Date: 2026-07-10

## 1. Summary

Implemented an upgraded package-managed 3D AI Companion:

- Vite/TypeScript frontend in `apps/web`.
- Fastify/TypeScript backend in `apps/api`.
- Local FastAPI VieNeu-TTS service in `apps/tts`.
- Shared model/animation/background/chat registries in `packages/shared`.
- Supabase migration for chat sessions, messages, and preferences.
- Environment template, asset checks, smoke tests, and documentation.

## 2. Final Directory Structure

- `apps/web`: frontend app, public assets, character/chat/audio/UI modules.
- `apps/api`: backend API, Mistral, Supabase, TTS proxy, schemas, middleware.
- `apps/tts`: Python TTS service, cache, tests, VieNeu adapter.
- `packages/shared`: shared registries and types.
- `supabase/migrations`: SQL schema.
- `scripts`: env, asset, and smoke checks.
- `docs`: audit and reports.

## 3. Files Created

- Root: `package.json`, `package-lock.json`, `pnpm-workspace.yaml`, `.env.example`, `eslint.config.mjs`, `LICENSES.md`
- Frontend: `apps/web/**`
- Backend: `apps/api/**`
- TTS: `apps/tts/**`
- Shared: `packages/shared/**`
- Supabase: `supabase/migrations/001_chat_schema.sql`
- Scripts: `scripts/check-env.mjs`, `scripts/verify-assets.mjs`, `scripts/smoke-test.mjs`
- Docs: `docs/architecture-audit.md`, `docs/dependency-report.md`, `docs/local-development.md`, `docs/implementation-report.md`

## 4. Files Modified

- `.gitignore`
- `README.md`
- `start-ai.bat`

## 5. Files Moved

No original files were moved or deleted. Existing VRM/VRMA/background assets were copied into `apps/web/public`.

## 6. Dependencies Installed

See `docs/dependency-report.md`.

## 7. Tool Versions

- Node: `v22.20.0`
- npm: `10.9.3`
- Python: `3.14.2`
- uv: `0.11.19`

## 8. TTS Voice

Selected voice: `Trúc Ly`.

Reason: VieNeu-TTS v3 Turbo preset exists and matches the requested female, gentle Vietnamese voice target.

## 9. Sample TTS

Sample generated successfully:

- Text: `Xin chào, hôm nay bạn muốn nói chuyện gì với mình?`
- File: `apps/tts/cache/sample-truc-ly.wav`
- Size: `299564` bytes
- Git status: ignored by `.gitignore`

## 10. Supabase Migration

Created `supabase/migrations/001_chat_schema.sql`:

- `chat_sessions`
- `chat_messages`
- `user_preferences`
- indexes
- `updated_at` triggers
- RLS enabled
- no public write policies

## 11. Endpoints

API:

- `GET /health`
- `POST /api/chat`
- `POST /api/tts`
- `GET /api/conversations`
- `DELETE /api/conversations/:sessionId`

TTS:

- `GET /health`
- `GET /voices`
- `POST /synthesize`

## 12. Environment Variables

See `.env.example`. Forbidden frontend secret names are checked by `scripts/check-env.mjs`.

## 13. Commands Run

- `git status --short --branch`
- `git switch -c feat/3d-ai-companion` failed due repo ownership/ref lock issue
- `npm install --audit=false --fund=false --loglevel=info`
- `npm install -D @types/node @types/three --audit=false --fund=false`
- `uv --cache-dir .uv-cache sync --project apps/tts`
- `uv --cache-dir .uv-cache sync --project apps/tts --extra vieneu`
- `npm run check:env`
- `npm run verify-assets`
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run test:python`
- `npm run build`
- `npm run smoke-test`

## 14. Lint

Result: pass.

```text
npm run lint
eslint . --max-warnings=0
```

## 15. Typecheck

Result: pass.

```text
npm run typecheck
shared/api/web tsc --noEmit passed
```

## 16. Unit Tests

Result: pass.

- Shared: 2 tests passed.
- API: 5 tests passed.
- Web: 4 tests passed.
- Python TTS: 4 tests passed, 1 Starlette/httpx deprecation warning.

## 17. Build

Result: pass.

```text
npm run build
```

Vite warning: production JS chunk is larger than 500 KB because Three.js/VRM libraries are bundled. This is not a build failure.

## 18. Smoke Test

Result: pass for service availability.

```text
PASS Web: 200 OK
PASS API health: 200 OK
PASS TTS health: 200 OK
```

This pass was recorded while `npm run dev` was running in the foreground. Later attempts to launch the same command as a detached hidden Windows process exited immediately in this environment, so services were not left running at the end of the session.

Real `/api/chat` smoke attempted with Mistral configured, but the sandboxed API server failed outbound network with `fetch failed`. Restarting dev services with network escalation was requested and rejected by the execution environment due usage limits, so real Mistral chat could not be verified in this session.

## 19. Security and Bundle Checks

- `rg "VITE_MISTRAL_API_KEY|VITE_SUPABASE_SECRET_KEY|VITE_SUPABASE_SERVICE_ROLE_KEY|MISTRAL_API_KEY|SUPABASE_SECRET_KEY" apps/web/dist` returned no matches.
- `.env` was not printed.
- `.env.example` contains no secret values.
- `npm audit --audit-level=high` could not run because network escalation was rejected by the execution environment.

## 20. Remaining Limits and Next Work

- Verify real Mistral chat outside the sandbox or after network approval is available.
- Run `npm audit --audit-level=high` when registry audit access is available.
- Do full browser visual QA for VRM render, VRMA playback, and console errors. Service smoke passed, but browser console verification was not completed in this session.
- Consider code-splitting Three/VRM modules to reduce production bundle size.

## 21. Audio Quality Fix Addendum

Date: 2026-07-10

- Added explicit PCM metadata across TTS, API, and frontend.
- Added AudioWorklet ring-buffer playback for cache HIT PCM.
- Added frame alignment and stream metrics.
- Changed cache MISS to complete WAV fallback after browser QA proved live MISS streaming underflowed severely.
- Added `scripts/audio_quality_probe.py`, browser audio probes, and audio quality/latency/browser QA reports.
- Final integrity artifacts are under `test-results/audio-quality/final/`.

## 22. Persistent Memory and Offline Synced Queue Addendum

Date: 2026-07-10

- Implemented four-tier memory architecture (Raw Archive, Recent Context, Session Summary, Long-Term Memory).
- Added `supabase/migrations/002_persistent_memory.sql` introducing `conversation_memories`, `conversation_summaries`, and audit logs.
- Added backend MemoryService for memory extraction, retrieval, and rolling summarization.
- Added frontend `IndexedDbOutbox` for caching unsent messages during Supabase outages.
- Extended `ApiClient` with session CRUD, memory controls, data exports, and offline message POST syncs.
- Rewrote `AudioQueue` to split text responses into sentences and pipeline synthesis/playback sequentially.
- Embedded a tabbed UI menu in `#chat-panel` with:
  - "Hội thoại" tab for new chats, renaming, deleting, searching, and exporting conversations.
  - "Trí nhớ" tab with long-term memory toggle, delete all, and scrollable lists of memories with inline editing/deleting.
- Verified all workspace TypeScript, lint, Vitest unit tests, and production Vite compilation pass successfully.

## 23. Takeover Reliability Addendum

Date: 2026-07-10

- Added `.agent-backups/` to `.gitignore` and created takeover backup artifacts under `.agent-backups/`.
- Added bounded `GET /api/sessions` behavior with controlled `400`/`503` responses.
- Added API tests for sessions success, missing `anonymousId`, unconfigured Supabase, Supabase error, Supabase timeout, and empty result.
- Changed web Vitest script to `vitest run --configLoader runner` to avoid Vite writing config bundles under unwritable `apps/web/node_modules/.vite-temp` in this Windows sandbox.
- Fixed queued audio playback by clearing `AudioPlayer.stopRequested` before direct `AudioQueue` playback.
- Added per-chunk browser performance metrics under `window.__BUDDY_PERF__.runs[].chunks`.
- Added browser probe failure artifacts: `last-failure.json` and `last-failure.png`.

Latest regression:

- `npm run check:env`: pass.
- `npm run verify-assets`: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm run test`: pass, 28 JS tests.
- `npm run test:python`: pass, 6 tests, 2 warnings.
- `npm run build`: pass, with existing Vite large chunk warning.
- Bundle secret-name scan: no forbidden key names in `apps/web/dist`.
- `npm audit --audit-level=high`: sandboxed request failed; unsandboxed request was rejected by approval policy because it discloses dependency metadata to the npm registry.

## 24. Memory Timing and Browser E2E Addendum

Date: 2026-07-10

- Applied Supabase migrations externally before this rerun; `PGRST205` for `chat_sessions` is no longer the current blocker.
- Fixed `/api/chat` Server-Timing isolation by returning request-local memory timing snapshots instead of reading shared `MemoryService` state.
- Added disabled-memory timing marker: `memory-disabled;dur=0`, with zero `memory-db-*` timings.
- Added API tests for enabled-to-disabled timing isolation, concurrent request isolation, and timeout-state isolation.
- Changed memory retrieval timeout handling to use completed subquery results plus cache fallbacks instead of discarding all memory context when one subquery is slow.
- Added forgotten-key guardrails so past summaries and assistant-only statements do not resurrect deleted user memories.
- Added a bounded one-shot animation fallback so browser chat does not remain stuck in `REACTING`.
- Live browser memory E2E passed: `test-results/browser/memory/memory-e2e-after-forget-guard.json`.

Current remaining blocker:

- TTS MISS breakdown, deterministic multi-chunk audio QA, and formal memory performance benchmarking remain pending.

## 25. Supabase Response and Audio Cache Addendum

Date: 2026-07-12

- Added `supabase/migrations/004_response_audio_cache.sql` with `response_cache`, `response_audio_cache`, trigram matching, RLS, and the private `response-audio` Storage bucket.
- Added backend response matching before memory/LLM work and automatic `approved = true` insertion for this single-user testing version.
- Added deterministic text normalization for Vietnamese accents, punctuation, casing, and whitespace.
- Added TTS audio lookup/persistence keyed by text, voice, and style; a Storage hit bypasses local TTS synthesis.
- Added cache timing/transport markers: `response-cache` in chat `Server-Timing` and `X-TTS-Cache: SUPABASE_HIT` for stored audio.
- Headed Chrome passed first generation, normalized repeat, voice playback completion, and final `IDLE`.
- Direct verification passed fuzzy matching, Mistral bypass, and a 576044-byte stored WAV hit.
- Regression checks passed: lint, workspace typecheck, API tests, full workspace tests, and production build. See `docs/response-cache-qa-report.md`.
