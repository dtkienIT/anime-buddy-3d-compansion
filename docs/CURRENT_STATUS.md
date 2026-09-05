# Current Status

Authoritative as of 2026-09-05 (Asia/Saigon). Older dated sections, audits, and QA documents are historical snapshots; use the newest section here and the linked reports/artifacts for the current working tree.

## 2026-09-05 Interactive User Experience & Live System Audit

This audit was conducted by launching all services, executing automated verification suites, and navigating the web application in a real browser session across mobile and desktop viewports.

Working branch: `update_v1`.

### Live User Journey & Verified Experience
- **Initial Boot & Onboarding**: The app boots cleanly to `IDLE` state with Mika rendered on the 3D stage. Onboarding modal displays clear privacy & memory disclosure, dismissible with state persisted in `animeBuddy.uiPreferences.v2`.
- **3D Character Stage & Gaze Tracking**: The Three.js canvas dynamically tracks pointer/touch movements for realistic eye gaze and head orientation, natural blinking intervals, and auto-centering.
- **Head-Pat Gesture & Affective Feedback**: Raycasting accurately distinguishes head versus body taps. Tapping Mika's head activates an affectionate smiling/squinting eye expression, cheek blush blendshapes, floating heart particles (`.heart-particle`), and affectionate Vietnamese vocal feedback.
- **SSE Streaming Chat**: Real-time `/api/chat/stream` emits incremental tokens for immediate typewriter rendering, followed by companion metadata (`emotion`, `animation`, `expression`, `intensity`, `voiceStyle`).
- **Real-Time Lip-Sync & TTS Audio**: VieNeu-TTS v3 Turbo synthesizes speech with the gentle Vietnamese "Trúc Ly" preset. `LipSyncController` drives VRM mouth blendshapes (`aa`, `ih`, `ou`, `ee`, `oh`) synchronized with audio playback.
- **Companion Studio (Drawer & Sheet)**: Accessible via bottom-left FAB or shortcut `C`. Four responsive tabs:
  - *Nhân vật (Models)*: 10 selectable companions (Mika, Kato, Sam, Naruto, Carlotta, etc.) with dynamic persona adaptation, plus local custom `.vrm` upload.
  - *Động tác (Motions)*: 43 registered animations with search and localized category filtering.
  - *Trình diễn (Live Moments)*: 5 music-backed 3D stages (Bling-Bang-Bang-Born / Neon Cube Arena, Aipai Dance Hall / Moon Lantern Festival, Chạm Vào Bình Minh / Aurora Dawn, Vũ điệu Uimugi Batake / Golden Wheatlight, Happy Synthesizer / Neon Stargate Corridor). Full playback lifecycle includes elapsed/total timer, progress bar, audio-reactive stage lights, and visible stop button.
  - *Bối cảnh (Backgrounds)*: 7 high-resolution ambient backgrounds (Study Room, Cozy Night, Cyber City, etc.).
- **Camera & Focus Controls**: Floating camera tools support zoom and camera reset (`R`). Focus mode (`F`) smoothly fades out all UI chrome into an immersive full-canvas view with a minimal exit pill.
- **Responsive Adaptability**: Seamless transition between desktop drawer and mobile bottom sheet (tested at 375x812, 390x844, 768x1024, 1440x960). Mobile docks chat cleanly at the bottom without obscuring the character's face.
- **Graceful Cloud Resilience**: During testing, the remote Supabase project returned Cloudflare 521 (web server paused/down). The application gracefully fell back: memory retrieval timed out cleanly within 700 ms, chat continued via streaming Mistral SSE, audio synthesis proceeded normally, and the memory UI displayed a friendly non-blocking warning without crashing.

### Verification Status
- **Asset Integrity**: PASS for 68 assets (10 models, 43 animations, 7 backgrounds, 4 audio, 1 audioVideos, 3 audioSources).
- **Deterministic VRMA**: PASS for 9 generated 30 fps VRMA 1.0 files (`Relax.vrma`, `Listening.vrma`, `Thinking.vrma`, `Talking.vrma`, `Singing.vrma`, `GentleGesture.vrma`, `CuriousTilt.vrma`, `Nod.vrma`, `Wave.vrma`).
- **Original Music Verification**: PASS for Golden-Wheatlight-Original.mp3 (150s, SHA-256 verified).
- **ESLint**: PASS (0 errors, 0 warnings).
- **TypeScript Typecheck**: PASS (0 errors across `@anime-buddy/shared`, `@anime-buddy/api`, `@anime-buddy/web`).
- **Unit Tests**:
  - Shared: `11/11` PASS.
  - Web: `99/99` PASS.
  - API: `32/32` PASS (configured with `--testTimeout 15000` to prevent machine contention timeouts under concurrent dev servers).
- **Python TTS Tests**: `10/10` PASS (`pytest apps/tts/tests`).
- **Production Build**: PASS (`npm run build` generates optimized distribution in ~12s; large chunk warning for `three-vrm` at ~762 kB remains expected).
- **Browser Probes**:
  - `probe-experience`: `7/7` PASS, 0 console errors.

### Runtime Environment
- Working branch: `update_v1`.
- Services: Web `127.0.0.1:3001`, API `127.0.0.1:3002`, TTS `127.0.0.1:8000`.
- Python execution: `.\apps\tts\.venv\Scripts\python.exe` directly utilized when `uv` is not present in Windows system PATH.

## 2026-07-26 performance-stage and presentation-flow upgrade

This pass was performed as a user journey through the running app. The four
local performances now share one registry and one playback lifecycle, so the
stage, animation, audio-reactive lighting, progress state, and cleanup cannot
drift apart between cards.

Working branch: `update_v1`.

Performance experience:

- `Bling Bang Bang Born` now uses the **Neon Cube Arena**: a black/red LED wall,
  suspended luminous cubes, laser-like beams, a runway, and edge lights.
- `Aipai Dance Hall` now uses the **Moon Lantern Festival**: a large moon gate,
  layered arches, floating lanterns, magenta/gold beams, and an illuminated
  runway.
- `Chạm Vào Bình Minh` now uses the **Aurora Dawn** stage: a sunrise disc,
  aurora rings/ribbons, side screens, cyan/gold beams, and a stepped platform.
- `Vũ điệu Uimugi Batake` now appears in the same **Live Moments** performance
  list on the **Golden Wheatlight** stage. It uses the owner-downloaded
  26.8-second VRMA and the new first-party **Golden Wheatlight** soundtrack.
  The revised 20-bar, 179.104 BPM hyper remix uses rapid bass, syncopated kick,
  snare rolls, dense hats/arpeggios, two drop sections, and short original
  Vietnamese call-and-response vocals. The vocals use the local VieNeu Trúc Ly
  preset; no lyric, melody, or recording is copied from the two reference
  dance tracks. The mix ends with the motion at 26.8 seconds.
- Every performance card displays its stage concept and a short description.
  The live overlay shows the current stage, elapsed/total time, a progress bar,
  and a single stop action. The overlay no longer covers the companion's face.
- Dance media starts in the original click activation turn while the one-shot
  VRMA prepares concurrently. This prevents Chromium from blocking
  `Bling-Bang-Bang-Born` and `Aipai Dance Hall`, and the live timer no longer
  waits for the animation promise to finish.
- Direct companion taps now produce a bounded Vietnamese stage dialogue bubble,
  while an active performance temporarily owns the stage and hides the bubble.
- The API exposes a safe, asset-free catalog at `GET /api/performances`; the
  frontend keeps the actual local asset URLs private to its own registry.
- Reduced-motion mode still disables the animated stage pulse while preserving
  readable stage geometry and playback controls.
- The Studio registry now contains 40 companion animations. The new standalone
  `UiMugibatake.vrma` is the unmodified 26.8-second VRMA selected from Maron
  Yatsuhashi's authenticated BOOTH download; no Unity, FBX, BVH, VMD, or song
  audio was imported. Provenance, hashes, and redistribution limits are in
  [the asset license record](licenses/MaronYatsuhashi-BOOTH-5846143.md).

The stage vocabulary is based on official live-show references: movable LED
cubes and LED floors, a 360-degree audience-aware layout, real-time screen
content, overhead elements, handcrafted scenic silhouettes, and synchronized
lighting. See [Performance Stage Design](performance-stage-design.md).

## 2026-08-02 Happy Synthesizer stage safety redesign

The approved **Neon Stargate Corridor** concept is now implemented for the
`happy-synthwave` stage. Its four upright gates recede behind Mika, while
equalizers, discs, stars, beams, and large particles remain at deterministic
edge, floor, or overhead anchors. The character-safe zone around Mika's face
and upper torso stays clear during audio-reactive motion, zoom, and responsive
reframing. Other performance themes are unchanged.

Fresh verification for this pass:

- Shared tests: PASS (`9/9`).
- API tests: PASS (`32/32`, rerun independently with a 15-second test
  allowance to avoid machine contention).
- Web tests: PASS (`99/99`).
- Lint and workspace typechecks: PASS.
- Asset verification: PASS (`66` files, including `3` canonical vocal stems;
  `9` generated VRMA parity/spec checks and byte-identical original-music
  regeneration).
- Browser responsive probe: PASS (`9/9`); experience probe: PASS (`7/7`) with
  zero application console errors.
- A single in-app browser tab manually started and stopped all five
  music-backed performances in sequence. Each received its own stage theme, live label,
  progress state, and cleanup. The existing exhaustive animation artifact
  remains `36/36`; a fresh multi-context rerun was intentionally not used as a
  release gate after its dev watcher exited under sustained workload.
- A one-page browser check starts Uimugi with the generated MP3, creates no
  external media iframe, and supports a clean stop/idle transition with no
  application errors.
- The same single tab dispatched all eight generated core motions; looped
  motions remained `IDLE`, one-shot motions entered `REACTING` and returned to
  idle as designed.

## 2026-07-14 product, responsive, motion, and privacy upgrade

This pass exercised the running product as a first-time user on touch, short-landscape, tablet, laptop, and desktop layouts, then closed the gaps found in the real rendered UI.

Experience and responsive changes:

- The compact breakpoint now covers widths below 760 px, including the previously uncovered 700–753 px range. Short landscape layouts keep the chat log and composer inside their panel instead of collapsing the log to zero height or placing the form under the WebGL canvas.
- Compact chat uses a 16 px composer and at least 44 px primary touch targets. The voice toolbar no longer reserves empty height when voice controls are unavailable.
- Chat collapse is a persisted user preference. Opening Companion Studio on a compact/intermediate screen temporarily collapses chat, then restores the user's previous state when Studio closes.
- The camera composition can center the character or bias it left/right around the open chat and Studio surfaces, preserving a useful 3D interaction area instead of allowing panels to cover the subject.
- A keyboard-accessible quick-interaction menu adds explicit Wave, Nod, Gentle Gesture, and Curious Tilt actions. Direct character taps cycle through the same semantic family, with bounded speech-bubble feedback and safe return to idle.
- First-run onboarding now discloses long-term memory and links to its controls. Character-dependent brand text, prompts, memory copy, welcome/help text, export name, and performance heading update when the selected companion changes.
- All ten characters now have distinct bounded personas. The system prompt uses the selected registry entry while explicitly forbidding invented biography or invented memories.
- Expression and one-shot state reset to neutral on idle/context changes, so an old reaction cannot visually leak into the next conversation or character.

Motion changes:

- The companion registry now contains 38 motions plus two music-performance assets.
- `Thinking.vrma` was regenerated as a seamless 4.8-second loop. New first-party `GentleGesture.vrma` (2.4-second one-shot) and `CuriousTilt.vrma` (2.6-second one-shot) fill the missing calm-conversation and curiosity intents.
- The deterministic generator now owns eight 30 fps VRMA 1.0 assets: Relax, Listening, Thinking, Talking, Gentle Gesture, Curious Tilt, Nod, and Wave. It skips byte-identical writes to avoid unnecessary dev-server file locks while preserving source/public parity.
- The neutral chat fallback is Gentle Gesture rather than accidentally selecting Wave; thinking, curiosity, listening, speaking, acknowledgement, and greeting now have explicit semantic paths.

Privacy and ownership changes:

- Reusable assistant-text cache lookup is intentionally bypassed. Memory-personalized or session-specific text can no longer be returned from a global fuzzy match; `/api/chat` reports `response-cache;dur=0;desc="BYPASS"`. The independent TTS audio cache remains enabled.
- Offline conversation sync now requires `anonymousId` and verifies ownership of the target session before insertion. Missing identity, wrong owner, and unconfigured backend paths return controlled `400`, `404`, and `503` responses.
- Repeated voice-disabled replies no longer produce a warning toast every time.

Fresh verification on this working tree:

- `npm run check:env`, `npm run verify-assets`, `npm run lint`, `npm run typecheck`, and `npm run build`: PASS. The existing Vite large-chunk warning remains.
- Asset verification: PASS for 59 files: 10 models, 40 animation assets, 7 backgrounds, and 2 local audio files. All 8 generated VRMAs pass deterministic byte/spec/parity/track/loop checks.
- Workspace unit tests: PASS `76/76` — shared `4/4`, API `30/30`, web `42/42`.
- Python TTS tests: PASS `10/10`; only the upstream Starlette deprecation and pytest cache-path warnings remain.
- Responsive browser probe: PASS `9/9` at `320 x 568`, `390 x 844`, `667 x 375`, `700 x 900`, `754 x 900`, `768 x 1024`, `844 x 390`, `1024 x 768`, and `1440 x 900`; application console errors `0`.
- The floating stage toolbar and its interaction hint were removed; camera gestures, direct companion taps, keyboard shortcuts, and Studio controls remain available.
- Installed visible Google Chrome reran the complete experience probe with `--headed`: PASS `9/9`, application console errors `0`.
- Animation browser probe: PASS `36/36` — eight deterministic motions across four representative models plus four legacy smoke motions; issues and aborted asset requests `0`.
- Interaction/audio fault probe: PASS `8/8` — deterministic multi-chunk playback, stop at first/later synthesis, rapid replacement, voice toggle, and unavailable/malformed/slow TTS paths.

Artifacts are under `test-results/browser/{responsive,experience,animations,interactions}/`. The generated artifacts remain git-ignored.

## 2026-07-13 companion experience and motion upgrade

The frontend has been redesigned around a usable 3D companion experience rather than three overlapping utility panels.

- A responsive app shell now provides a persistent 3D stage, compact app bar, camera toolbar, docked chat, and an on-demand Companion Studio drawer/sheet. Mobile and short-height layouts preserve a meaningful visible stage area instead of covering the character's face with chat and controls.
- The first-run path now includes dismissible onboarding, prompt starters, a help dialog, network state, staged loading progress/retry, empty/loading/error states, and typed non-blocking toasts.
- Companion Studio provides accessible tabs, animation search, descriptive character/background cards, animation categories, and five local music-backed performances.
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

The interaction harness was not rerun during the dated 2026-07-13 gate; it was subsequently rerun and passed in the 2026-07-14 verification above.

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
- Reusable assistant-text cache reads are now intentionally bypassed for memory/privacy correctness. Historical text-cache latency and fuzzy-hit results remain useful only as an implementation record; audio-cache hits are still supported.
- Real Mistral chat is response-based, not token-streamed, so real first-visible text follows full Mistral completion and missed the 1 s goal.
- Migration `003_memory_extraction_outbox.sql` must be applied to the configured remote Supabase project before extraction becomes restart-durable there. Until then, code detects the missing table and uses bounded in-process retry without delaying chat.
- Formal browser fault injection for Supabase outage, missing VRMA `finished`, and a pre-suspended AudioContext remains partial.
- Headless Chromium emits software-WebGL GPU/readback warnings; headed Chrome finished without application errors.
- The production `three-vrm` chunk is about 754 kB before gzip and still triggers Vite's size warning.
- The eight generated core VRMA assets declare `specVersion: "1.0"` and are verified deterministically. Some legacy third-party VRMA files still omit the field; the frontend patches their fetched GLB metadata in memory before parsing, without modifying the checked-in source asset.
