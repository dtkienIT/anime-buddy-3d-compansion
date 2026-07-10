# Licenses

This project combines first-party application code with third-party packages and user-provided assets.

## JavaScript packages

Package licenses are resolved from installed package metadata during dependency review. The project intentionally uses common permissive packages where possible:

- Three.js: MIT.
- @pixiv/three-vrm: MIT.
- @pixiv/three-vrm-animation: MIT.
- Fastify and official Fastify plugins: MIT.
- Zod: MIT.
- Supabase JavaScript client: MIT.
- Mistral TypeScript SDK: Apache-2.0 or the license declared by the installed package metadata.
- Vite, Vitest, TypeScript, ESLint, Prettier, tsx, concurrently: licenses declared in their package metadata.

## Python packages

- FastAPI, Uvicorn, Pydantic, pytest, and httpx use their published package licenses.
- VieNeu-TTS / `vieneu` must be used under its upstream license and model terms. Voice presets must be used only when legally provided by the installed model package. No voice cloning is implemented.

## Assets

VRM models, VRMA animations, and backgrounds under `vrm-models/`, `animations/`, `backgrounds/`, and `apps/web/public/` are treated as project assets supplied with this repository. Confirm redistribution rights before publishing.
