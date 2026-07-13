# TTS Latency Report

> Historical snapshot. See `docs/CURRENT_STATUS.md` and `test-results/browser/tts-benchmark/final.json` for current measurements.

Date: 2026-07-10

## Final Strategy

- Cache HIT: stream cached WAV as `f32le` PCM to an AudioWorklet ring buffer.
- Cache MISS: synthesize full WAV before playback to avoid live-stream underflow/crackle.

## Measured Results

| Scenario | Result |
| --- | ---: |
| Endpoint direct reference HIT | 44 ms completed |
| Python cache HIT PCM | 26 ms completed |
| API cache HIT PCM | 39 ms completed |
| API MISS WAV fallback | 5637 ms completed in integrity probe |
| Browser cache HIT replay | 407 ms `replyToAudioLatency` |
| Browser real chat cache HIT | 480 ms `replyToAudioLatency` |
| Browser short MISS WAV fallback | 33799 ms `replyToAudioLatency` |
| Takeover browser MISS, 79-char reply | 55838 ms `replyToAudioLatency` |
| Takeover browser replay HIT, same reply | 728 ms `replyToAudioLatency`, 0 underflows/drops/duplicates |
| Takeover browser MISS, 117-char reply | 53225 ms `replyToAudioLatency`, 1 chunk |
| Takeover audio integrity API HIT PCM | 9 ms completed |
| Takeover audio integrity MISS WAV fallback | 5999 ms completed |

## Notes

- The previous live MISS stream could start earlier, but measured severe browser underflow on a medium sentence: `underflowCount=20025`, `underflowDurationMs=53400`.
- Cache HIT browser playback after the fix measured zero underflows, dropped frames, and duplicated frames.
- MISS latency is currently CPU/model bound when using full WAV fallback.
- Cold start remains separate from request latency; TTS health reports ready only after model load and warm-up.
- Takeover rerun fixed a queued-playback regression where `AudioPlayer.stop()` left `stopRequested=true`, preventing `AudioQueue` direct WAV/PCM playback from starting.
- New chunk timing metrics are written to `window.__BUDDY_PERF__.runs[].chunks` when performance metrics are enabled.

## Remaining Performance Work

- A 2026-07-12 CUDA probe on the GeForce MX330 completed warm-up in 1.44 s and one short cache MISS in 3.11 s. A later five-run direct probe measured min/p50/p95/max synthesis of 6.54/7.17/8.59/8.89 s; repeat cache HIT requests took 9.0-14.9 ms. Browser benchmark attempts with normal and software WebGL timed out under severe 3D/TTS contention, so the historical CPU browser p95 must not yet be replaced by the direct CUDA figures.
- A follow-up CPU run measured direct synthesis min/p50/p95/max of 5.82/6.81/14.84/16.11 s and end-to-end API MISS wall time of 9.02-10.55 s. Concurrent headless WebGL caused the frontend to abort TTS at its 30-second timeout, so the run did not produce a valid browser distribution and does not demonstrate an improvement over the historical CPU result.
- The GPU packages were subsequently removed and the verified dependency baseline restored: `onnxruntime` 1.27.0, `CPUExecutionProvider`, and CPU as the default when `TTS_DEVICE` is unset. The first post-restore five-run direct probe measured min/p50/p95/max of 5.96/8.68/10.87/11.03 s; the historical 9.72-second figure remains the formal browser p95 rather than a guaranteed constant.

- Investigate VieNeu full WAV CPU latency.
- Test larger native `chunk_frames` values in a separate branch before re-enabling MISS streaming.
- Consider sentence-level streaming only if integrity tests prove no underflow.
- The later five-run browser benchmark measured warm MISS p95 at 9.72 s and cache HIT reply-to-audio p95 at 324 ms. Deterministic and real cache-HIT three-chunk continuity pass with zero scheduled gap; real multi-chunk MISS still exceeds the 90-second browser budget. See `docs/CURRENT_STATUS.md`.
