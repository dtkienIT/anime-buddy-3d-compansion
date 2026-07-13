# Agent Handoff

## Repository

- Frontend: `apps/web` (Vite, TypeScript, Three.js, VRM/VRMA).
- API: `apps/api` (Fastify, Mistral, Supabase, TTS proxy).
- TTS: `apps/tts` (FastAPI, VieNeu-TTS v3 Turbo, ONNX Runtime).
- Shared types and registries: `packages/shared`.
- Deterministic asset tooling: `scripts/generate-companion-vrma.mjs`, `scripts/verify-assets.mjs`.
- Browser probes: `tests/browser`.
- Reports: `docs`.

Current working branch is `main` (verified 2026-07-13). Historical takeover work referenced `feat/persistent-memory-and-fast-tts-miss`; earlier audio work referenced `fix/tts-stream-audio-quality`.

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

## Current frontend experience

- `apps/web/index.html` and the CSS under `apps/web/src/styles/` define the responsive app shell: 3D stage, app bar, stage tools, Companion Studio drawer/sheet, chat dock, onboarding, help dialog, loader, and toast region.
- `AppController` coordinates character/background/animation selection, control and menu tabs, focus/fullscreen/camera tools, session and memory CRUD, onboarding, reduced motion, shortcuts, network state, ambient moments, and quick character interaction.
- `UiPreferencesStore` persists selected character/background, Studio open state, reduced motion, and onboarding state under `animeBuddy.uiPreferences.v2`.
- `ChatPanel` supports IME-safe Enter handling, autosizing/counting, prompt starters, speech-to-text state, accessible message roles, copy actions, typing state, replay, stop/cancel, and quick new chat.
- `CharacterController` supports responsive framing, pointer/touch hit testing, pointer-follow gaze, auto-centering, natural blinking, camera reset/zoom, and reduced-motion behavior.
- On narrow screens the Studio opens as a sheet and collapses chat to preserve the visible 3D interaction area. Do not reintroduce permanently stacked overlays over the character.

Keyboard shortcuts are `/` composer focus, `C` Studio, `R` camera reset, `F` focus mode, `?` help, and `Esc` close/back.

## VRMA workflow

The shared registry currently exposes 36 companion animations. Two additional VRMA files are used by local music performances.

Core first-party motions are deterministic 30 fps assets:

- `Relax.vrma` (5.2 s loop, regenerated)
- `Listening.vrma` (4.0 s loop)
- `Talking.vrma` (2.4 s loop)
- `Nod.vrma` (1.4 s one-shot)
- `Wave.vrma` (2.8 s one-shot)

Never hand-edit one copy of a generated asset. Run:

```powershell
npm run generate:animations
npm run verify:generated-animations
npm run verify-assets
```

The generator writes byte-identical files to `animations/` and `apps/web/public/animations/`, declares `VRMC_vrm_animation.specVersion: "1.0"`, and validates structure and seamless loop endpoints. Some legacy third-party files still omit `specVersion`; `ensureVrmaSpecVersion` patches the fetched GLB in memory before the Pixiv loader parses it. The source assets remain unchanged.

One-shot playback has event, frame-observation, and bounded-timeout completion paths. Short chat/interaction reactions also supply a maximum duration so a missing Three.js `finished` event cannot leave the app in `REACTING`.

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

Browser UI probes, with the app running:

```powershell
npm run test:browser:responsive
npm run test:browser:experience
npm run test:browser:animations
npm run test:browser:interactions
```

`probe-responsive` covers mobile/tablet/desktop geometry and drawer behavior. `probe-experience` covers onboarding persistence, help/escape, shortcuts, reduced motion, tab keyboard navigation, character interaction, and ARIA state. `probe-animations` checks core companion motions across representative models.

Current UI working-tree verification: `check:env`, `verify-assets`, `lint`, `typecheck`, workspace tests, Python tests, and production build pass. Fresh browser artifacts pass responsive `3/3`, experience `8/8`, and animation `24/24` with zero application console errors; see `test-results/browser/{responsive,experience,animations}/report.json`.

Audio integrity:

```powershell
uv --cache-dir .uv-cache run --project apps/tts python scripts/audio_quality_probe.py --out test-results/audio-quality/final
node tests/browser/probe-audio-worklet.mjs
node tests/browser/collect-baseline.mjs "1+3=?" "final-real-chat.json" replay
```

## Audio format and current behavior

- Cache HIT stream: `f32le`, 48,000 Hz, mono, 4 bytes/sample.
- Cache MISS: complete PCM16 WAV fallback for quality.
- Long-reply playback starts after the first completed chunk; this replaced the earlier three-chunk startup reserve.
- Cache HIT browser reply-to-audio p95 is 324 ms. Cache MISS remains CPU-bound. TTS optimization was not part of the current UI/motion upgrade.

## Security rules

- Do not expose `MISTRAL_API_KEY` or `SUPABASE_SECRET_KEY` to frontend code.
- Do not print `.env`.
- Keep generated audio under `test-results/` or `apps/tts/cache/`; both are ignored.
- Preserve unrelated user changes in the working tree.

## Verified reliability

- `/api/sessions` validates missing `anonymousId`, uses a bounded Supabase query, and returns controlled `503` fallback responses rather than hanging.
- Queued TTS playback clears the stopped flag before direct buffer/stream scheduling.
- Browser baseline failures write `last-failure.json` and `last-failure.png`.
- `/api/chat` memory `Server-Timing` is request-local; disabled-memory responses include `memory-disabled;dur=0` with zero memory DB timing.
- Persistent-memory E2E passed after migrations, including recall, contradiction, forget/non-resurrection, disabled-memory no-store, and re-enable.
- The formal five-run memory benchmark passes the 700 ms budget: memory wall p95 497 ms, with no timeout or fallback in that sample.
- Cache HIT three-chunk audio continuity passed with zero scheduled gap, underflow, drop, or duplicate in the recorded artifact.

## Remaining limits

- Real Mistral output is response-based rather than token-streamed, so first visible text can miss the 1 s goal.
- Cache MISS WAV is clean but slow on local CPU; a real multi-chunk MISS exceeds the 90-second browser budget.
- Remote Supabase query latency remains variable even though the formal memory benchmark passed.
- Formal browser fault injection is still partial for a Supabase outage, a missing VRMA `finished` event, and an initially suspended `AudioContext`.
- The production bundle still triggers Vite's >500 kB chunk warning.
- `npm audit --audit-level=high` was not run because registry metadata disclosure was rejected by the approval layer.
