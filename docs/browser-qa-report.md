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
