# Agent Handoff

## Repository

- Frontend: `apps/web` (Vite, TypeScript, Three.js, VRM/VRMA, Web Audio Lip-Sync).
- API: `apps/api` (Fastify, Mistral Streaming SSE, Supabase, TTS proxy).
- TTS: `apps/tts` (FastAPI, VieNeu-TTS v3 Turbo, ONNX Runtime).
- Shared types and registries: `packages/shared`.
- Deterministic asset tooling: `scripts/generate-companion-vrma.mjs`, `scripts/verify-assets.mjs`.
- Browser probes: `tests/browser`.
- Reports: `docs`.

Current working branch is `main` (verified 2026-08-16).

## Ports and run commands

- Web: `http://127.0.0.1:3001`
- API: `http://127.0.0.1:3002`
- TTS: `http://127.0.0.1:8000`

```powershell
npm run dev
# Or separately:
npm run dev:web
npm run dev:api
npm run dev:tts
```

## Features & Frontend Experience

- `apps/web/index.html` and the CSS under `apps/web/src/styles/` define the responsive app shell: 3D stage, app bar, stage tools, Companion Studio drawer/sheet, chat dock, onboarding, help dialog, loader, and toast region.
- `AppController` coordinates character/background/animation selection, custom `.vrm` upload, control and menu tabs, focus/fullscreen/camera tools, session and memory CRUD, onboarding/privacy disclosure, reduced motion, shortcuts, network state, ambient moments, dynamic character identity, and direct/head-pat interactions.
- **Real-time SSE Streaming Chat**: `/api/chat/stream` emits incremental tokens for typewriter response rendering with instant TTFT, followed by full companion metadata (`emotion`, `animation`, `expression`, `intensity`, `voiceStyle`).
- **Real-time Audio Lip-Sync**: `LipSyncController` and `ExpressionController` perform time-domain RMS and frequency-domain formant analysis (`aa`, `ih`, `ou`, `ee`, `oh`) connected to Web Audio `AnalyserNode`, creating lifelike mouth movement during companion speech.
- **Hands-free Voice Mode & Barge-In**: Recording automatically halts ongoing speech (`audioPlayer.stop()`) and switches character to listening state when user speaks.
- **Head-Pat Gesture & Particles**: Raycasting distinguishes head vs body taps to trigger happy animations (`blush`/`happy`), heart/sparkle particles (`.heart-particle`), and affectionate voice lines.
- **Custom VRM Upload**: Companion Studio Models tab allows users to select any local `.vrm` file, loading dynamically into the scene with standard animations, expressions, and blinking.
- `UiPreferencesStore` persists selected character/background, Studio open state, chat-collapse state, reduced motion, and onboarding state under `animeBuddy.uiPreferences.v2`.
- `CharacterController` supports responsive left/center/right stage composition, pointer/touch hit testing, pointer-follow gaze, auto-centering, natural blinking, camera reset/zoom, and reduced-motion behavior.

Keyboard shortcuts: `/` composer focus, `C` Studio, `R` camera reset, `F` focus mode, `?` help, and `Esc` close/back.

## Verification

```powershell
npm run check:env
npm run verify-assets
npm run lint
npm run typecheck
npm run test
npm run test:python
npm run build
```

Browser UI probes:

```powershell
npm run test:browser:responsive
npm run test:browser:experience
npm run test:browser:animations
npm run test:browser:interactions
```

Current verification status (all passing):
- `lint`: 0 errors / warnings.
- `typecheck`: 0 TypeScript errors across shared, api, web.
- `test`: 142/142 tests passing (99 web, 32 api, 11 shared).
- `test:python`: 10/10 pytest passing.
- `build`: Production bundle generated successfully.
- `probe-responsive`: 9/9 viewports PASS.
- `probe-experience`: 7/7 checks PASS, 0 console errors.
- `probe-animations`: 36/36 animation checks PASS, 0 issues.
- `probe-interactions`: 8/8 interaction scenarios PASS.

## Audio format and behavior

- Cache HIT stream: `f32le`, 48,000 Hz, mono, 4 bytes/sample.
- Cache MISS: complete PCM16 WAV fallback for quality.
- Streaming chat text starts instantly; speech audio plays immediately upon first synthesized sentence chunk.
- Cache HIT browser reply-to-audio p95 is 324 ms.

## Security rules

- Do not expose `MISTRAL_API_KEY` or `SUPABASE_SECRET_KEY` to frontend code.
- Do not print `.env`.
- Keep generated audio under `test-results/` or `apps/tts/cache/`; both are ignored.
- Preserve unrelated user changes in the working tree.
