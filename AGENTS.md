# Agent Handoff

## Repository

- Frontend: `apps/web` (Vite, TypeScript, Three.js, VRM/VRMA).
- API: `apps/api` (Fastify, Mistral, Supabase, TTS proxy).
- TTS: `apps/tts` (FastAPI, VieNeu-TTS v3 Turbo, ONNX Runtime).
- Shared types/registries: `packages/shared`.
- Browser probes: `tests/browser`.
- Reports: `docs`.

## Branch

Current work was done on `fix/tts-stream-audio-quality`.

## Ports

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3002`
- TTS: `http://127.0.0.1:8000`

## Run

```powershell
npm run dev
```

Or separately:

```powershell
npm run dev:web
npm run dev:api
npm run dev:tts
```

## Test

```powershell
npm run check:env
npm run verify-assets
npm run lint
npm run typecheck
npm run test
npm run test:python
npm run build
```

Audio integrity:

```powershell
uv --cache-dir .uv-cache run --project apps/tts python scripts/audio_quality_probe.py --out test-results/audio-quality/final
```

Browser audio probe:

```powershell
node tests/browser/probe-audio-worklet.mjs
```

Real browser chat probe:

```powershell
node tests/browser/collect-baseline.mjs "1+3=?" "final-real-chat.json" replay
```

## Audio Format

- Cache HIT stream: `f32le`, 48000 Hz, mono, 4 bytes/sample.
- Cache MISS: complete WAV fallback for quality.
- WAV cache: PCM16 WAV.

## Security Rules

- Do not expose `MISTRAL_API_KEY` or `SUPABASE_SECRET_KEY` to frontend code.
- Do not print `.env`.
- Keep generated audio under `test-results/` or `apps/tts/cache/`; both are ignored.

## Fixed Issues

- Browser crackle/gaps from live streamed MISS underflow.
- Missing PCM metadata.
- Worklet startup bug caused by counting transferred buffers after detachment.
- ESLint browser/Node global errors.

## Remaining Limits

- Cache HIT browser latency is clean but measured slightly above the 400 ms target in final runs.
- Cache MISS WAV fallback is clean but slow on CPU.
- Formal Playwright coverage for stop, rapid replacement, voice toggle, TTS unavailable, security assertions, and lip-sync thresholds still needs expansion.
