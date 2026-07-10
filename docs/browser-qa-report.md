# Browser QA Report

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

Current caveats:

- Supabase-backed memory E2E now passes after migrations and fixes. Artifact: `test-results/browser/memory/memory-e2e-after-forget-guard.json`.
- Live memory E2E verified refresh, browser restart, new chat recall, contradiction, forget, memory disabled, guitar-not-stored, and final memory re-enable.
- A stuck `REACTING` browser state was fixed by adding a bounded fallback for one-shot animation completion when the Three.js `finished` event is delayed/missed.
- Remote memory query latency remains variable and still needs formal 5-run benchmarking.
- The longer real-chat prompt still produced one TTS chunk; deterministic multi-chunk browser gap coverage remains pending.
- Stop, rapid replacement, voice toggle, TTS unavailable, and security assertion specs remain pending.

## Mocked Audio Probes

Artifacts: `test-results/browser/audio-worklet/`

- Cache HIT Worklet probes completed with zero underflow/drop/duplicate metrics.
- Cache MISS live streaming reproduced severe underflow before fallback.
- Cache MISS WAV fallback played cleanly, but with high synthesis latency on CPU.

## Console

No app uncaught exceptions were seen in the passing runs. Chromium emitted WebGL context/gpu stall warnings during screenshot capture; these are known headless/WebGL diagnostics and were not associated with app failure.

## Not Fully Covered

- Formal Playwright specs for stop, rapid replacement, voice toggle, TTS unavailable, and secret assertions are still pending.
- Headed hardware-accelerated Chrome was not run in this environment.
- Browser audio output was verified by app PCM/frame metrics and saved WAV artifacts, not by an OS loopback recording.
