# Browser QA Report

## 2026-07-13 Long Vietnamese Reply Prefetch

The frontend now keeps a three-chunk initial WAV reserve and uses smaller speech chunks for long replies. A dedicated Chromium probe routed the exact reported Vietnamese cat story through six delayed MISS-style WAV responses (2.5 seconds each). All six requests returned `200`; the five scheduled inter-chunk gaps were `[0, 0, 0, 0, 0]` ms. Artifact: `test-results/browser/audio-prefetch/long-vietnamese-mocked-miss.json`.

This deterministic browser result verifies ordering, prefetch, decode, and Web Audio scheduling independently of local model speed. A separate real VieNeu MISS attempt reached the API's structured 120-second `504 TTS_TIMEOUT` path under concurrent browser/WebGL load. The frontend scheduling fix is therefore verified, while real local CPU synthesis for long uncached text remains an unresolved performance constraint.

> Historical snapshot (2026-07-10). See `docs/CURRENT_STATUS.md` for current verified results.

## 2026-07-12 Interactive Chrome Rerun

A fresh manual-style Chrome pass against the already-running local stack verified boot to `IDLE`, model/canvas rendering, character change (Mika to Kato and back), background change (Study Room to Cozy Night and back), a standalone Greeting animation, Bling-Bang-Bang-Born performance start/stop, voice off/on, real Mistral chat (`2 + 3 = 5 nè!`), chat collapse/expand, conversation manager loading, and the long-term-memory panel. The browser was returned to Mika, Study Room, voice enabled, and `IDLE`.

No application error was logged. One non-blocking warning remains: checked-in VRMA files omit `specVersion`, so the loader assumes VRMA 1.0.

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
