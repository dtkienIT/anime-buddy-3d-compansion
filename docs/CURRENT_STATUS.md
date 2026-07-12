# Current Status

Authoritative as of 2026-07-12 (Asia/Saigon). Older audit and QA documents are historical snapshots; use this file and the linked reports/artifacts for the current working tree.

## Repository and runtime

- Branch: `perf/instant-chat-and-voice` (handoff expected `feat/persistent-memory-and-fast-tts-miss`, but both names point to the same pre-work commit).
- Commit before work: `6f28345b19d60d5036f71b04711dbfff59e297a1` (`v1.1`).
- Commit after work: unchanged; the verified implementation is currently uncommitted.
- OS/shell: Windows, PowerShell, timezone Asia/Saigon.
- Node `v22.20.0`; npm `10.9.3`; uv `0.11.19`; Python `3.14.2`.
- Headed browser: Google Chrome `150.0.7871.114`, 1440 × 960.
- Automated headless browser: Chromium `149.0.7827.55`, 1440 × 960.
- Services: Vite web `127.0.0.1:3001`, Fastify API `127.0.0.1:3002`, FastAPI/VieNeu TTS `127.0.0.1:8000`.

## Current architecture

- `apps/web`: Vite/TypeScript/Three.js/VRM frontend, request-local performance runs, pipelined sentence audio queue, exact cached-PCM buffer scheduling, lip-sync and cancellable/replacement chat operations.
- `apps/api`: Fastify Mistral/Supabase API, bounded and parallel memory retrieval, approved reusable response matching, detailed `Server-Timing`, and a TTS proxy backed by Supabase Storage audio reuse.
- `apps/tts`: warmed VieNeu v3 Turbo ONNX engine. MISS uses the incremental decoder to build a complete PCM16 WAV before response; HIT returns validated 48 kHz mono float32 PCM. Live MISS playback remains disabled to avoid underflow.
- `packages/shared`: registries/types. `supabase/migrations`: chat, memory, indexes, and durable extraction outbox schema.

## Latest measured results

### Supabase response and audio cache

Headed Chrome and direct API verification passed on 2026-07-12. Report: `docs/response-cache-qa-report.md`.

- An accent/punctuation variant reused the exact cached response.
- A fuzzy variant with one additional word also matched at the configured `0.90` threshold.
- Response hit: `response-cache;dur=191.9`, `mistral;dur=0`, total chat `1276.6 ms`.
- Fuzzy hit: `response-cache;dur=227.9`, `mistral;dur=0`, total chat `1271.6 ms`.
- Audio hit: `X-TTS-Cache: SUPABASE_HIT`, `audio/wav`, `576044` bytes.
- Both Chrome messages completed voice playback and returned to `IDLE`.

### Browser TTS benchmark (5 runs per mode)

Artifact: `test-results/browser/tts-benchmark/final.json`.

| Metric | Mode | Min | p50 | p95 | Max | Target | Status |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| First visible text | mocked deterministic chat | 266 ms | 286 ms | 504 ms | 553 ms | <1,000 ms | PASS |
| Reply-to-audio | cache HIT | 50 ms | 175 ms | 324 ms | 326 ms | ≤500 ms | PASS |
| Reply-to-audio | warm cache MISS | 6,910 ms | 8,627 ms | 9,724 ms | 9,942 ms | ≤4,000 ms | FAIL |
| TTS backend | cache HIT | 12 ms | 15 ms | 16 ms | 16 ms | — | PASS |
| TTS backend | cache MISS | 6,786 ms | 8,345 ms | 9,585 ms | 9,804 ms | — | measured limit |
| HIT download | cache HIT | 4.2 ms | 6.3 ms | 6.5 ms | 6.5 ms | — | PASS |

Real Mistral chat remains non-streaming. The final real run rendered the complete assistant reply in 2.61 s and therefore does not meet the <1 s first-visible-text target. Artifact: `test-results/browser/baseline/post-change-throttled-real-chat.json`.

The MISS bottleneck is proven to be model compute under browser contention: direct warm synthesis took 4.29 s for a short Vietnamese line; the comparable browser run spent 12.09 s in TTS synthesis, 2.6 ms downloading, ~7.5 ms decoding, and ~9 ms scheduling. Adaptive VRM rendering reduced the earlier same-browser synthesis result from 47.15 s to 7–10 s in the five-run benchmark, but this CPU/model still cannot meet 4 s without a faster backend/device or quality-safe incremental playback.

### Audio continuity

- Deterministic mocked three-chunk scenario: 3 chunks, ordered, scheduled maximum gap 0 ms, no skip/duplicate, final `IDLE`.
- Real TTS three-chunk cache-HIT scenario: 3 chunks, scheduled maximum gap 0 ms, 337,920 frames received/played for the final reported chunk metrics, 0 dropped, 0 duplicated, 0 underflows, final `IDLE`.
- A real multi-chunk MISS run started cleanly but exceeded the 90 s test budget while synthesizing the long second chunk. This is retained as a FAIL artifact rather than reported as a pass.
- Audio integrity probe: correlation 1.0 for direct/Python/API and MISS/cache comparisons; zero clipping, NaN/Infinity, and boundary spikes.

Artifacts:

- `test-results/browser/interactions/final.json`
- `test-results/browser/audio-worklet/real-multi-chunk-hit-final.json`
- `test-results/browser/audio-worklet/failure-real-multi-chunk-final.json`
- `test-results/audio-quality/final/metrics.json`

### Persistent memory benchmark (5 enabled + 5 disabled)

Artifact: `test-results/browser/memory/memory-benchmark-final.json`.

| Metric (enabled) | Min | p50 | p75 | p95 | Max |
| --- | ---: | ---: | ---: | ---: | ---: |
| Memory wall | 186 ms | 344 ms | 448 ms | 497 ms | 509 ms |
| General memories | 0 ms | 188 ms | 201 ms | 315 ms | 344 ms |
| Matched memories | 173 ms | 186 ms | 193 ms | 250 ms | 264 ms |
| Deleted-memory guards | 0 ms | 270 ms | 320 ms | 471 ms | 509 ms |
| Current summary | 0 ms | 253 ms | 298 ms | 418 ms | 448 ms |
| Past summaries | 0 ms | 194 ms | 269 ms | 271 ms | 271 ms |
| Context build | 0 ms | 0 ms | 0 ms | 0.08 ms | 0.1 ms |
| Mistral | 596 ms | 771 ms | 774 ms | 793 ms | 797 ms |
| Total chat | 1,238 ms | 1,465 ms | 1,615 ms | 1,724 ms | 1,751 ms |

- Enabled mode: 0 timeouts, 0 fallbacks, 4 cache hits across five runs.
- Disabled mode: all memory wall/subquery/context metrics exactly 0 ms across five runs.
- Functional E2E passed refresh, browser restart, new-session recall, contradiction, forget, non-resurrection, memory-disabled no-store, and final re-enable: `test-results/browser/memory/memory-e2e-final.json`.

## Real Chrome verification

Headed Google Chrome `150.0.7871.114` ran at 1440 × 960. It rendered the canvas and chat, played real cached multi-chunk TTS, stopped playback, returned to `IDLE`, opened the memory UI, replayed audio, stopped again, and finished `IDLE`. There were no page errors, failed requests, or application console errors. Artifact: `test-results/browser/headed-chrome/final.json` and screenshots in the same directory.

## Interaction matrix

| Scenario | Status | Evidence |
| --- | --- | --- |
| Normal real chat | PASS | `browser/baseline/post-change-throttled-real-chat.json` |
| Cache MISS playback | PASS, target FAIL | `browser/tts-benchmark/final.json` |
| Cache HIT replay | PASS | `browser/tts-benchmark/final.json` |
| Supabase response cache normalized/fuzzy hit | PASS | `docs/response-cache-qa-report.md` |
| Supabase Storage audio reuse | PASS | `docs/response-cache-qa-report.md` |
| Deterministic ≥3 chunks | PASS | `browser/interactions/final.json` |
| Real TTS ≥3 chunks (HIT) | PASS | `browser/audio-worklet/real-multi-chunk-hit-final.json` |
| Real TTS ≥3 chunks (MISS) | FAIL (90 s budget) | `browser/audio-worklet/failure-real-multi-chunk-final.json` |
| Stop first/later synthesis | PASS | `browser/interactions/final.json` |
| Rapid replacement | PASS | `browser/interactions/final.json` |
| Two rapid submissions | PASS via replacement path | `browser/interactions/final.json` |
| Voice off before/during/on | PASS | `browser/interactions/final.json` |
| TTS unavailable/timeout/malformed PCM | PASS | `browser/interactions/final.json` |
| Refresh/restart/new-session recall | PASS | `browser/memory/memory-e2e-final.json` |
| Contradiction/forget/no resurrection | PASS | `browser/memory/memory-e2e-final.json` |
| Memory disabled zero retrieval | PASS | `browser/memory/memory-benchmark-final.json` |
| Supabase unavailable browser flow | PARTIAL (unit/fallback coverage only this run) | API tests |
| One-shot animation missing `finished` | PARTIAL (bounded production fallback; no new browser fault injection) | existing implementation |
| AudioContext initially suspended | PARTIAL (resume path exercised; no explicit suspended-state artifact) | browser runs |
| Lip-sync analyser/neutral reset | PASS | `browser/interactions/final.json` |
| Final state `IDLE` | PASS | interaction/headed artifacts |
| Production bundle secret names/values | PASS | final build scan |

## Latest passing commands

- `npm run check:env`
- `npm run verify-assets`
- `npm run lint`
- `npm run typecheck`
- `npm run test` (32 tests: shared 2, API 18, web 12)
- `npm run test:python` (6 passed; one upstream Starlette deprecation warning)
- `npm run build` (pass; existing >500 kB bundle warning)
- `npm run smoke-test`
- `uv --cache-dir .uv-cache run --project apps/tts python scripts/audio_quality_probe.py --out test-results/audio-quality/final`
- `node tests/browser/probe-audio-worklet.mjs`
- `node tests/browser/probe-interactions.mjs final.json`
- `node tests/browser/benchmark-tts.mjs 5 final.json`
- `node tests/browser/benchmark-memory.mjs 5 memory-benchmark-final.json`
- `node tests/browser/probe-memory-e2e.mjs memory-e2e-final.json`
- `node tests/browser/headed-chrome-final.mjs`

## Known limitations and blockers

- Warm cache MISS p95 is 9.72 s, above the 4 s goal. The installed CPU ONNX path is the limiting stage; live MISS streaming remains disabled because prior deterministic measurements showed severe underflow.
- A response-cache hit still waits for session/preference persistence and took about 1.27 s in the latest remote Supabase run; the frontend's 300 ms fallback status can temporarily say `Đang truy xuất ký ức...` even though memory and Mistral are bypassed.
- Real Mistral chat is response-based, not token-streamed, so real first-visible text follows full Mistral completion and missed the 1 s goal.
- Migration `003_memory_extraction_outbox.sql` must be applied to the configured remote Supabase project before extraction becomes restart-durable there. Until then, code detects the missing table and uses bounded in-process retry without delaying chat.
- Formal browser fault injection for Supabase outage, missing VRMA `finished`, and a pre-suspended AudioContext remains partial.
- Headless Chromium emits software-WebGL GPU/readback warnings; headed Chrome finished without application errors.
- The production JS bundle remains ~868 kB before gzip and triggers Vite's size warning.
