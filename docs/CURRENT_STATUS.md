# Current Status

Authoritative as of 2026-07-13 (Asia/Saigon). Older audit and QA documents are historical snapshots; use this file and the linked reports/artifacts for the current working tree.

## 2026-07-13 companion experience and motion upgrade

The frontend has been redesigned around a usable 3D companion experience rather than three overlapping utility panels.

- A responsive app shell now provides a persistent 3D stage, compact app bar, camera toolbar, docked chat, and an on-demand Companion Studio drawer/sheet. Mobile and short-height layouts preserve a meaningful visible stage area instead of covering the character's face with chat and controls.
- The first-run path now includes dismissible onboarding, prompt starters, a help dialog, network state, staged loading progress/retry, empty/loading/error states, and typed non-blocking toasts.
- Companion Studio provides accessible tabs, animation search, descriptive character/background cards, animation categories, and the existing two local music performances.
- Chat now has IME-safe keyboard submission, autosizing and character count, quick new chat, message copy, stop/replacement behavior, replay state, speech-input state, session search/rename/delete/export, and explicit long-term-memory view/edit/delete controls.
- Experience controls include reduced motion, focus mode, fullscreen, camera zoom/reset, reset experience, and persistent device-local preferences for character, background, Studio state, onboarding, and reduced motion.
- Keyboard and assistive-technology behavior was expanded with visible focus, skip navigation, ARIA tab/state semantics, live regions, focus restoration, and shortcuts: `/`, `C`, `R`, `F`, `?`, and `Esc`.
- The character now follows the pointer with its gaze, recenters automatically, blinks naturally, responds to direct pointer/touch hits with wave/nod and a speech bubble, and uses bounded ambient moments while idle. Responsive camera framing and reduced-motion behavior are applied inside the render controller.
- Chat state transitions now use dedicated `Listening.vrma` and `Talking.vrma` loops. Semantic one-shots are bounded and return to the regenerated `Relax.vrma` idle, preventing excessively long reaction locks.
- Interaction ownership guards prevent an old gesture or animation fallback from overwriting a newer chat/model state. Pending performance audio can be cancelled before playback starts, stale model-bound clips cannot repopulate the next model's cache, and the help modal owns shortcuts while open.
- Four new first-party VRMA files were added: `Wave.vrma`, `Nod.vrma`, `Listening.vrma`, and `Talking.vrma`. `Relax.vrma` was regenerated as a clean loop. All five are deterministic 30 fps GLB/VRMA outputs with `specVersion: "1.0"`, written byte-identically to the source and public asset trees.
- `npm run generate:animations` regenerates the five core motions. `npm run verify:generated-animations` checks determinism; `npm run verify-assets` additionally checks the full model/animation/background/audio inventory, signatures, source/public parity, generated VRMA metadata, tracks, and loop seams.

Working-tree verification for this upgrade:

- `npm run verify-assets`: PASS.
- `npm run lint`: PASS.
- `npm run typecheck`: PASS.
- `npm run test`: PASS — shared `2/2`, API `22/22`, web `40/40`.
- `npm run test:python`: PASS — `10/10` (one upstream Starlette deprecation warning).
- `npm run build`: PASS (the existing large-chunk warning remains).

Fresh redesigned-shell browser verification:

- Responsive: PASS `3/3` at `390 x 844`, `768 x 1024`, and `1440 x 900`; application console errors `0`. Artifact: `test-results/browser/responsive/report.json`.
- Experience: PASS `8/8`, including onboarding persistence, modal/shortcut behavior, direct canvas-to-character interaction, reduced motion, keyboard stage actions, Studio state, and a visible performance stop path; console errors `0`. Artifact: `test-results/browser/experience/report.json`.
- Animation: PASS `24/24`: five generated motions across four representative models plus four legacy smoke checks; issues, aborted assets, and console errors `0`. Artifact: `test-results/browser/animations/report.json`.
- Connected headed Chrome at `745 x 656` booted the new shell to `IDLE` with one WebGL canvas, no document overflow, the closed Studio correctly inert, and zero console warnings/errors.

The interaction harness was updated for the redesigned DOM but was not rerun as part of this focused UI/motion gate; its earlier chat/audio reliability artifacts remain listed below.

## 2026-07-13 first-audio latency fix

- Long assistant replies are split into smaller timeout-safe speech chunks: first target 100 characters, later target 120 characters, and a hard per-chunk split limit of 140 characters before the bounded final merge.
- `AudioQueue` now schedules the first WAV as soon as chunk 0 is ready. Chunk 1 synthesis starts immediately after chunk 0 synthesis and overlaps chunk 0 playback; later chunks remain ordered and retain cancellation/replacement behavior.
- This replaces the earlier three-chunk startup reserve, which made long cache-MISS replies appear silent while three serial VieNeu requests completed.
- Unit coverage verifies that playback starts after exactly one completed synthesis and that the next synthesis overlaps the first playback. Web tests pass 28 tests.
- The change removes the avoidable three-chunk startup delay. It cannot make local synthesis faster than playback, so uncached long replies may have pauses between later chunks under heavy WebGL/CPU contention, but they no longer wait for three complete chunks before producing the first sound.
- Chrome verification at 745 x 712 found and fixed a responsive grid overflow that placed the chat form outside the clipped panel, allowing the Three.js canvas to intercept clicks on `Gửi`. The responsive grid now permits the chat log row to shrink while keeping the form inside the panel.
- A real two-chunk cache-MISS Chrome run entered audible `Đang nói...` at 10.88 seconds, completed speech at 19.25 seconds, and returned to `IDLE` at 25.35 seconds. Replay entered `Đang nói...` at 2.60 seconds and returned to `IDLE` at 11.65 seconds. The final Chrome console contained no warnings or errors.
- TTS timeout handling is now aligned: backend timeout 120 seconds, frontend timeout 125 seconds. Backend timeout responses use HTTP `504`, code `TTS_TIMEOUT`, and a correlated TTS request ID.

## Repository and runtime

- Branch: `main` (verified with `git status --short --branch` on 2026-07-12). Older handoff branch names in historical reports are no longer current.
- Commit before work: `6f28345b19d60d5036f71b04711dbfff59e297a1` (`v1.1`).
- Commit after work: unchanged; the verified implementation is currently uncommitted.
- OS/shell: Windows, PowerShell, timezone Asia/Saigon.
- Node `v22.20.0`; npm `10.9.3`; uv `0.11.19`; Python `3.14.2`.
- Headed browser: Google Chrome `150.0.7871.114`, 1440 × 960.
- Automated headless browser: Chromium `149.0.7827.55`, 1440 × 960.
- Services: Vite web `127.0.0.1:3001`, Fastify API `127.0.0.1:3002`, FastAPI/VieNeu TTS `127.0.0.1:8000`.

## Current architecture

- `apps/web`: Vite/TypeScript/Three.js/VRM frontend with a responsive stage/chat/Studio shell, accessible onboarding and controls, persistent local experience preferences, gaze/blink/touch interaction, deterministic core motion, request-local performance runs, pipelined sentence audio, exact cached-PCM buffer scheduling, lip-sync, and cancellable/replacement chat operations.
- `apps/api`: Fastify Mistral/Supabase API, bounded and parallel memory retrieval, approved reusable response matching, detailed `Server-Timing`, and a TTS proxy backed by Supabase Storage audio reuse.
- `apps/tts`: warmed VieNeu v3 Turbo ONNX engine. MISS uses the incremental decoder to build a complete PCM16 WAV before response; HIT returns validated 48 kHz mono float32 PCM. Live MISS playback remains disabled to avoid underflow.
- `packages/shared`: registries/types. `supabase/migrations`: chat, memory, indexes, and durable extraction outbox schema.

## Latest measured results

### Local CUDA TTS probe

On 2026-07-12, the TTS environment was switched from CPU-only `onnxruntime` to `onnxruntime-gpu` 1.26.0 with CUDA/cuDNN runtimes. The NVIDIA GeForce MX330 exposed `CUDAExecutionProvider`; VieNeu loaded successfully with automatic CUDA selection. A fresh 36-character Vietnamese MISS measured 3,105 ms after a 1,441 ms warm-up and produced a valid 215,084-byte WAV without exhausting the 2 GB VRAM. This is a focused local probe, not yet a replacement for the five-run browser benchmark.

A subsequent five-run direct-TTS probe with longer unique Vietnamese inputs measured synthesis min 6,539 ms, p50 7,168 ms, p95 8,590 ms, max 8,894 ms. Four repeat cache HIT requests completed in 9.0-14.9 ms. Two browser benchmark attempts failed before collecting a run: with normal WebGL the TTS request exceeded the frontend timeout and Chromium reported WebGL context loss/GPU stalls; software WebGL still failed to start audio within the extended 120-second harness timeout. On this 2 GB MX330, CUDA therefore passes direct inference but is not yet a browser-level performance win while the 3D scene is active.

After switching to `TTS_DEVICE=cpu`, a fresh five-run direct probe under the current desktop load measured min 5,820 ms, p50 6,809 ms, p95 14,845 ms, max 16,115 ms. Five end-to-end API MISS requests measured 9,023-10,549 ms wall time. The browser harness still aborted `/api/tts` at the frontend's 30-second timeout under concurrent headless WebGL load, so no valid five-run browser sample was collected. This current CPU run is not faster than the earlier CPU browser benchmark and indicates substantial load/thermal variance.

The experimental GPU environment was then removed at the user's request. The active baseline is again `onnxruntime` 1.27.0 with only `CPUExecutionProvider`, and an unset `TTS_DEVICE` defaults to CPU. A fresh five-run direct probe after restart measured min 5,963 ms, p50 8,684 ms, p95 10,868 ms, max 11,034 ms. This is close to but does not exactly reproduce the historical 9.72-second browser p95; timing varies with system load and the direct/browser measurement surfaces are different.

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

## Historical real Chrome verification (before the UI redesign)

Headed Google Chrome `150.0.7871.114` ran at 1440 × 960. It rendered the canvas and chat, played real cached multi-chunk TTS, stopped playback, returned to `IDLE`, opened the memory UI, replayed audio, stopped again, and finished `IDLE`. There were no page errors, failed requests, or application console errors. Artifact: `test-results/browser/headed-chrome/final.json` and screenshots in the same directory.

This artifact verifies the pre-redesign frontend and the underlying chat/audio path. It is not a fresh visual or interaction pass for the 2026-07-13 app shell.

## Interaction matrix

The entries below summarize the earlier full-stack run. Scenarios whose DOM interaction changed in the new shell require a fresh browser rerun.

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

## Historical full-stack passing commands

- `npm run check:env`
- `npm run verify-assets`
- `npm run lint`
- `npm run typecheck`
- `npm run test` (45 tests on 2026-07-12: shared 2, API 21, web 22)
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

- The historical CPU browser warm cache MISS p95 is 9.72 s. Direct CUDA p95 is 8.59 s for the later five-run probe, but CUDA browser runs currently time out under 3D/WebGL contention; GPU mode is not marked as a browser performance pass. Live MISS streaming remains disabled because prior deterministic measurements showed severe underflow.
- A response-cache hit still waits for session/preference persistence and took about 1.27 s in the latest remote Supabase run; the frontend's 300 ms fallback status can temporarily say `Đang truy xuất ký ức...` even though memory and Mistral are bypassed.
- Real Mistral chat is response-based, not token-streamed, so real first-visible text follows full Mistral completion and missed the 1 s goal.
- Migration `003_memory_extraction_outbox.sql` must be applied to the configured remote Supabase project before extraction becomes restart-durable there. Until then, code detects the missing table and uses bounded in-process retry without delaying chat.
- Formal browser fault injection for Supabase outage, missing VRMA `finished`, and a pre-suspended AudioContext remains partial.
- Headless Chromium emits software-WebGL GPU/readback warnings; headed Chrome finished without application errors.
- The production JS bundle remains ~868 kB before gzip and triggers Vite's size warning.
- The five generated core VRMA assets declare `specVersion: "1.0"` and are verified deterministically. Some legacy third-party VRMA files still omit the field; the frontend patches their fetched GLB metadata in memory before parsing, without modifying the checked-in source asset.
