# TTS Audio Quality Report

Date: 2026-07-10

## Symptoms

After the low-latency PCM streaming change, browser playback could crackle, pop, or contain audible gaps. The issue reproduced in Chromium when uncached TTS was streamed live into small scheduled chunks.

## Audio Architecture Before Fix

- Python TTS emitted native VieNeu `infer_stream()` chunks as `f32le` mono PCM.
- Fastify proxied the bytes to `/api/tts`.
- The frontend decoded every received chunk and scheduled a separate `AudioBufferSourceNode`.
- Playback could start before enough future audio existed.

## Root Cause

The source audio format was valid: VieNeu v3 Turbo reports 48 kHz float32 mono output, and reconstructed Python/API streams match cached WAV references exactly. The browser quality problem came from playback continuity:

- Live MISS streaming produced audio slower than real time on this CPU path.
- The browser started playback while the network/inference stream still had long gaps.
- The old per-chunk `AudioBufferSourceNode` strategy had no robust underflow accounting.
- The first AudioWorklet attempt transferred buffers before counting frames, preventing the Worklet `start` message. This was fixed.

## Source Format

- Source sample rate: 48000 Hz.
- Stream sample rate: 48000 Hz.
- Cache HIT stream format: `f32le`.
- Channels: 1 mono.
- Bytes per sample: 4.
- WAV cache format: PCM16 WAV.

## Fix

- Added explicit PCM headers: `X-Audio-Format`, `X-Audio-Sample-Rate`, `X-Audio-Channels`, and `X-Audio-Bytes-Per-Sample`.
- Frontend now refuses ambiguous raw PCM.
- Added AudioWorklet ring-buffer playback for cache HIT PCM streams.
- Added frame-aligned parsing with carry-over bytes.
- Added stream metrics: received/played/dropped/duplicated frames, underflow count/duration, and buffered audio.
- Switched cache MISS back to complete WAV synthesis/playback to protect quality.
- Increased API/TTS timeout to 120 seconds for the quality fallback.

## Integrity Results

Artifacts: `test-results/audio-quality/final/`

- Direct reference vs Python stream: sample count difference `0`, correlation `1.0`.
- Direct reference vs API stream: sample count difference `0`, correlation `1.0`.
- MISS fallback vs cache reference: sample count difference `0`, correlation `0.99999988`.
- NaN/Infinity: `0`.
- Clipping ratio: `0`.
- Boundary spike count: `0`.

Takeover rerun on 2026-07-10 regenerated `test-results/audio-quality/final/metrics.json`:

- Direct reference vs Python stream: sample count difference `0`, correlation `1.0`.
- Direct reference vs API stream: sample count difference `0`, correlation `1.0`.
- MISS API WAV vs cache reference: sample count difference `0`, correlation `1.0`.
- Direct/API peak: `0.417572`, RMS `0.094039`, clipping ratio `0`, NaN/Infinity `0`, boundary spike count `0`.
- MISS API peak: `0.621277`, RMS `0.103784`, clipping ratio `0`, NaN/Infinity `0`, boundary spike count `0`.

Manual listening files:

- `test-results/audio-quality/final/short-miss.wav`
- `test-results/audio-quality/final/short-hit.wav`
- `test-results/audio-quality/final/medium-vietnamese.wav`

## Latency Impact

Cache HIT remains fast and clean, but Chromium measured `replyToAudioLatency` around 407-480 ms in final browser runs. MISS fallback is clean but can be slow on CPU; one short uncached browser probe measured about 33 seconds for synthesis. This is intentionally documented as a remaining performance limitation rather than hidden behind crackly playback.

## Conclusion

Audio quality now passes integrity checks and browser playback reports zero dropped frames, zero duplicated frames, and zero underflows for cache HIT Worklet playback. Cache MISS no longer streams crackly partial audio; it falls back to complete WAV playback.

Takeover note: queued playback now calls `AudioPlayer.prepareForPlayback()` after replacement stop/reset so MISS WAV and HIT PCM direct scheduling can start in browser after `AudioPlayer.stop()`.

Latest takeover note: memory E2E and timing isolation were completed in the current pass. Deterministic multi-chunk audio continuity, rapid replacement, voice toggle, TTS unavailable, and full TTS MISS browser/API breakdown still need dedicated coverage before being marked PASS.
