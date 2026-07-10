# Architecture Audit

Date: 2026-07-10

## Initial repository state

- Current stack: static HTML/CSS, bundled browser JavaScript, Three.js/VRM code in `app.bundle.js`, source copy in `src/app.js`, and a hand-written Node HTTP server in `server.mjs`.
- Package manager: no `package.json`, no lock file, and no workspace package manager were present at audit time. Node `v22.20.0`, npm `10.9.3`, Python `3.14.2`, and uv `0.11.19` are available. `pnpm` is not installed.
- Git status: clean on `main` at the start. Creating `feat/3d-ai-companion` failed because Git could not create `.git/refs/heads/feat/3d-ai-companion` after the repo was flagged for dubious ownership. Work continued in the working tree and this is documented here.
- Current port: existing `server.mjs` serves the static app and `/api/chat` on `127.0.0.1:3001` by default.

## Current asset layout

- VRM models: `vrm-models/`.
- VRMA animations: `animations/`.
- Background images: `backgrounds/`.
- Assets were copied into `apps/web/public/models`, `apps/web/public/animations`, and `apps/web/public/backgrounds` for the new Vite app. The original root assets were not deleted.

## Current VRM load flow

- The current viewer uses Three.js, `GLTFLoader`, `VRMLoaderPlugin`, and `@pixiv/three-vrm`.
- Models are listed in `src/app.js` as `MODEL_OPTIONS`.
- A selected VRM is loaded, normalized to a target height, mounted into a scene group, and previous model resources are disposed.
- The bundled runtime file is `app.bundle.js`; the unbundled `src/app.js` references a previous external `frontend/node_modules` path and is not directly runnable in this repo without rebuilding.

## Current VRMA load flow

- Animations are listed in `src/app.js` as `ANIMATION_OPTIONS`.
- `GLTFLoader` with `VRMAnimationLoaderPlugin` loads `.vrma` files.
- `createVRMAnimationClip` creates a clip for the active VRM.
- The current implementation loops every animation and falls back to `Relax` on load failure.

## Current Mistral flow

- `server.mjs` loads `.env`, validates request JSON manually, and calls Mistral through `fetch`.
- The frontend `chat-client.js` calls `/api/chat` on the same origin.
- The API key stays server-side in the current MVP, which is good, but there is no package-managed official SDK yet.

## Current Supabase flow

- `.env` contains Supabase variable names, but the audited code did not include Supabase persistence.
- There is no migration folder and no backend data access layer yet.

## Security issues

- No `.env.example` existed.
- `.gitignore` only ignored `.env`; it did not cover `.env.*`, TTS cache, generated audio, `node_modules`, `dist`, or Python caches.
- Existing `/api/chat` has no rate limit and no structured schema validation library.
- Existing `/api/health` reports whether an API key exists. It does not leak the key value, but the new endpoint should use neutral `configured` booleans and avoid model/API calls.
- Frontend does not expose `MISTRAL_API_KEY`; this must be preserved.
- Supabase service/secret keys must remain backend-only and must never use a `VITE_` prefix.

## Code that needs restructuring

- Move runtime source into package-managed `apps/web/src`.
- Create a shared registry for model, animation, and background metadata.
- Move Mistral calls into `apps/api` with official SDK, validation, rate limiting, and safe response parsing.
- Add Supabase persistence through backend-only service code.
- Add Python FastAPI TTS service and a backend proxy endpoint.
- Add frontend chat state machine, audio queue, audio player, lip-sync, and status UI.

## Working behavior to preserve

- All existing VRM models remain selectable.
- All existing VRMA animations remain selectable.
- All existing backgrounds remain selectable.
- The viewer still opens locally on `127.0.0.1`.
- Chat continues to function as text even when Supabase or TTS is unavailable.
