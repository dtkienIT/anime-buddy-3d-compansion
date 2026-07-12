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

- Investigate VieNeu full WAV CPU latency.
- Test larger native `chunk_frames` values in a separate branch before re-enabling MISS streaming.
- Consider sentence-level streaming only if integrity tests prove no underflow.
- The later five-run browser benchmark measured warm MISS p95 at 9.72 s and cache HIT reply-to-audio p95 at 324 ms. Deterministic and real cache-HIT three-chunk continuity pass with zero scheduled gap; real multi-chunk MISS still exceeds the 90-second browser budget. See `docs/CURRENT_STATUS.md`.
