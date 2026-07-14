# Browser QA Report

## 2026-07-14 Full Product and Responsive Rerun

The running Vite app at `http://127.0.0.1:3001` was inspected across phone portrait, phone landscape, the former 700–753 px breakpoint gap, tablet, laptop, and desktop sizes. The responsive harness now checks panel/form containment, non-zero chat space, minimum mobile composer/touch sizing, Studio/chat transitions, stage preservation, and overlap/overflow in nine viewports.

| Probe | Result | Application errors | Artifact |
| --- | --- | ---: | --- |
| Responsive | `9/9` PASS | 0 | `test-results/browser/responsive/report.json` |
| Experience | `9/9` PASS | 0 | `test-results/browser/experience/report.json` |
| Animation sample | `36/36` PASS | 0 issues / aborted assets | `test-results/browser/animations/report.json` |
| Interaction/audio faults | `8/8` PASS | 0 failed scenarios | `test-results/browser/interactions/final.json` |

Responsive coverage: `320 x 568`, `390 x 844`, `667 x 375`, `700 x 900`, `754 x 900`, `768 x 1024`, `844 x 390`, `1024 x 768`, and `1440 x 900`. The previously clipped short-landscape composer/log and dead intermediate breakpoint are covered by assertions rather than screenshots alone.

Experience coverage now includes the onboarding link to memory controls and the semantic interaction menu (Wave, Nod, Gentle Gesture, Curious Tilt), in addition to help/Escape, shortcuts, direct canvas interaction, reduced-motion persistence, performance stop, keyboard stage actions, and Studio state. The same nine checks passed in the installed visible Google Chrome via:

```powershell
node tests/browser/probe-experience.mjs --headed
```

The animation probe covers all eight deterministic motions on Mika, Sam, Naruto, and Carlotta plus one legacy smoke motion per model. The interaction rerun covers ordered multi-chunk playback, stopping first/later synthesis, rapid replacement, voice state changes, and unavailable, malformed, and deliberately slow TTS responses.

Static/runtime gates also pass: environment check, 59-file asset inventory, eight generated-VRMA checks, lint, typecheck, workspace tests `76/76`, Python tests `10/10`, and production build. The Vite warning for the approximately 754 kB `three-vrm` chunk remains.

The dated sections below are retained as historical evidence; their older `3/3`, `8/8`, `24/24`, five-motion, and text-response-cache results are superseded by this section where they conflict.

## 2026-07-13 Companion Experience Redesign

The browser harness has been updated for the redesigned frontend. New or expanded coverage includes:

- `tests/browser/probe-responsive.mjs`: mobile (`390 x 844`), tablet (`768 x 1024`), and desktop (`1440 x 900`) viewport bounds, preserved stage area, Studio drawer/sheet open and close behavior, and scroll/overflow checks.
- `tests/browser/probe-experience.mjs`: first-visit onboarding persistence, help dialog state and Escape close, `/`/`C`/`F` shortcuts, reduced-motion persistence, keyboard tab navigation, direct character interaction, and ARIA pressed/expanded state.
- `tests/browser/probe-animations.mjs`: regenerated core motions (`Relax`, `Wave`, `Nod`, `Listening`, and `Talking`) across representative VRM models, plus selected legacy motions.
- Existing chat, audio, memory, and baseline scripts now use shared helpers for the redesigned controls, localized status via `data-state`, welcome dismissal, Studio visibility, and voice state.

The complete local gate passes: environment/template validation, 57-asset verification, five generated-VRMA parity/spec checks, lint, workspace typecheck, shared/API/web unit tests (`2 + 22 + 40`), Python tests (`10`), and production build. The existing Vite warning for the `three-vrm` chunk above 500 kB remains.

Fresh browser results:

| Probe | Result | Application console | Artifact |
| --- | ---: | ---: | --- |
| Responsive | `3/3` PASS | 0 errors | `test-results/browser/responsive/report.json` |
| Experience | `8/8` PASS | 0 errors | `test-results/browser/experience/report.json` |
| Animation sample | `24/24` PASS | 0 errors, 0 issues | `test-results/browser/animations/report.json` |

The responsive run covered `390 x 844`, `768 x 1024`, and `1440 x 900`. Its five warnings were headless Chrome WebGL context/readback diagnostics during viewport changes and screenshots, not application errors. The experience run additionally verifies a real pointer tap on the canvas reaches the companion without a Three.js raycast error, starts a local performance, verifies the visible stop overlay/body state, stops it, and returns to `IDLE`. The animation sample covers all five generated motions on Mika, Sam, Naruto, and Carlotta plus one legacy smoke motion per model.

The manual Chrome inspection that motivated the redesign used a `745 x 656` viewport. The previous top chat sheet and bottom control sheet obscured the character's face and lower body. The new responsive layout docks chat lower/right, keeps Companion Studio closed by default below desktop width, and preserves a directly usable 3D stage with camera and touch controls.

A final connected-Chrome pass at the same `745 x 656` viewport verified one rendered canvas, `IDLE`, exact document/viewport bounds, correct closed-drawer `aria-hidden`/`inert` state, and zero Chrome console warnings or errors.

## 2026-07-13 Long Vietnamese Reply Scheduling Correction

The current frontend starts WAV playback as soon as the first speech chunk is ready. It no longer keeps the earlier three-chunk startup reserve. Synthesis for chunk 1 begins immediately after chunk 0 synthesis and overlaps chunk 0 playback; later chunks remain ordered and cancellable.

The earlier deterministic Chromium probe routed the reported Vietnamese cat story through six delayed MISS-style WAV responses (2.5 seconds each). All six requests returned `200`, and the five scheduled inter-chunk gaps were `[0, 0, 0, 0, 0]` ms. Artifact: `test-results/browser/audio-prefetch/long-vietnamese-mocked-miss.json`. That artifact remains evidence for ordered look-ahead scheduling, not evidence that the removed three-chunk reserve is still active.

This deterministic browser result verifies ordering, prefetch, decode, and Web Audio scheduling independently of local model speed. A separate real VieNeu MISS attempt reached the API's structured 120-second `504 TTS_TIMEOUT` path under concurrent browser/WebGL load. The frontend scheduling fix is therefore verified, while real local CPU synthesis for long uncached text remains an unresolved performance constraint.

> Historical snapshot (2026-07-10). See `docs/CURRENT_STATUS.md` for current verified results.

## 2026-07-12 Interactive Chrome Rerun

A fresh manual-style Chrome pass against the already-running local stack verified boot to `IDLE`, model/canvas rendering, character change (Mika to Kato and back), background change (Study Room to Cozy Night and back), a standalone Greeting animation, Bling-Bang-Bang-Born performance start/stop, voice off/on, real Mistral chat (`2 + 3 = 5 nè!`), chat collapse/expand, conversation manager loading, and the long-term-memory panel. The browser was returned to Mika, Study Room, voice enabled, and `IDLE`.

No application error was logged in that historical run. At the time, legacy checked-in VRMA files emitted a non-blocking missing-`specVersion` warning. The current loader normalizes missing legacy metadata in memory before parsing. The five generated core motions include `specVersion: "1.0"` in their source files and are checked for source/public parity.

## 2026-07-12 Response Cache Addendum

Headed Chrome verified the Supabase response/audio cache with voice enabled. An unaccented input and an accented/punctuated equivalent produced the same assistant text, both completed audio playback, and returned to `IDLE`. Direct headers confirmed `response-cache ... desc="HIT"`, `mistral;dur=0`, and `X-TTS-Cache: SUPABASE_HIT`. A fuzzy input with one extra word also hit. Full evidence is in `docs/response-cache-qa-report.md`.

Date: 2026-07-10

Browser: Chromium `149.0.7827.55`

## Covered

- App booted at `http://127.0.0.1:3001`.
- Canvas rendered at `1440 x 960`.
- Real `/api/chat` completed after running the dev stack with network escalation.
- `/api/tts` returned explicit PCM metadata for cache HIT.
- AudioWorklet playback started and ended.
- Replay/cache HIT completed.
- Lip-sync analyser remained connected through the audio graph.
- Screenshots and JSON artifacts were written under `test-results/browser/`.

## Final Real Chat Run

Artifact: `test-results/browser/baseline/final-real-chat.json`

- Chat status: 200.
- TTS cache: HIT.
- Audio format: `f32le`, 48000 Hz, mono, 4 bytes/sample.
- Received frames: `49920`.
- Played frames: `49920`.
- Dropped frames: `0`.
- Duplicated frames: `0`.
- Underflow count: `0`.
- Replay `replyToAudioLatency`: `406.8 ms`.

## Takeover Real Browser Rerun

Date: 2026-07-10

Artifacts:

- `test-results/browser/baseline/final-real-chat.json`
- `test-results/browser/baseline/multi-chunk-real-chat.json`
- `test-results/browser/baseline/boot.png`
- `test-results/browser/baseline/audio-playing.png`
- `test-results/browser/baseline/cache-replay-playing.png`

Verified:

- Chromium `149.0.7827.55`.
- Canvas rendered at `1440 x 960`.
- Real `/api/chat` returned `200`.
- `/api/sessions` no longer hung; missing `anonymousId` returned `400`, real Supabase failure returned bounded `503`.
- TTS MISS WAV playback started after fixing queued playback stop-state reset.
- Replay/cache HIT returned `f32le`, 48 kHz, mono, 4 bytes/sample.
- Cache HIT replay metrics: `receivedFrames=230400`, `playedFrames=230400`, dropped `0`, duplicated `0`, underflow `0`.
- Audio quality probe remained bit-aligned/correlated with cache references.

Measured:

| Scenario | Result |
| --- | ---: |
| Chat total with memory fallback | 2356 ms |
| Browser MISS `replyToAudioLatency`, 79-char reply | 55838 ms |
| Browser replay HIT `replyToAudioLatency`, 79-char reply | 728 ms |
| Browser MISS `replyToAudioLatency`, 117-char reply | 53225 ms |
| Chunk count in 117-char run | 1 |
| Max measured inter-chunk gap in latest browser run | 0 ms (single chunk only) |

Historical caveats at the time of this snapshot:

- Supabase-backed memory E2E now passes after migrations and fixes. Artifact: `test-results/browser/memory/memory-e2e-after-forget-guard.json`.
- Live memory E2E verified refresh, browser restart, new chat recall, contradiction, forget, memory disabled, guitar-not-stored, and final memory re-enable.
- A stuck `REACTING` browser state was fixed by adding a bounded fallback for one-shot animation completion when the Three.js `finished` event is delayed/missed.
- These items were later covered by the final benchmark and interaction probes summarized in `docs/CURRENT_STATUS.md`; real multi-chunk MISS remains the main unresolved audio case.

## Mocked Audio Probes

Artifacts: `test-results/browser/audio-worklet/`

- Cache HIT Worklet probes completed with zero underflow/drop/duplicate metrics.
- Cache MISS live streaming reproduced severe underflow before fallback.
- Cache MISS WAV fallback played cleanly, but with high synthesis latency on CPU.

## Console

No app uncaught exceptions were seen in the passing runs. Chromium emitted WebGL context/gpu stall warnings during screenshot capture; these are known headless/WebGL diagnostics and were not associated with app failure.

## Not Fully Covered In This Historical Run

- The later interaction suite covers stop, rapid replacement, voice toggle, TTS unavailable, and production secret scans. See `docs/CURRENT_STATUS.md`.
- A later headed Chrome run completed successfully.
- Browser audio output was verified by app PCM/frame metrics and saved WAV artifacts, not by an OS loopback recording.
