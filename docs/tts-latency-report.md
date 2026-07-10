# TTS Latency Report

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

## Notes

- The previous live MISS stream could start earlier, but measured severe browser underflow on a medium sentence: `underflowCount=20025`, `underflowDurationMs=53400`.
- Cache HIT browser playback after the fix measured zero underflows, dropped frames, and duplicated frames.
- MISS latency is currently CPU/model bound when using full WAV fallback.
- Cold start remains separate from request latency; TTS health reports ready only after model load and warm-up.

## Remaining Performance Work

- Investigate VieNeu full WAV CPU latency.
- Test larger native `chunk_frames` values in a separate branch before re-enabling MISS streaming.
- Consider sentence-level streaming only if integrity tests prove no underflow.
