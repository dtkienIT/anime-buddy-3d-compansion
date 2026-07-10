# Dependency Report

Date: 2026-07-10

## Environment

- Node: `v22.20.0`
- npm: `10.9.3`
- pnpm: not installed on this machine. `pnpm-workspace.yaml` is included, but npm workspaces were used and verified.
- Python: `3.14.2`
- uv: `0.11.19`
- OS: Windows / PowerShell environment.

## JavaScript Dependencies

Installed with:

```powershell
npm install --audit=false --fund=false --loglevel=info
npm install -D @types/node @types/three --audit=false --fund=false
```

| Package | Version | Scope | Purpose | License | Status |
| --- | ---: | --- | --- | --- | --- |
| three | 0.178.0 | web | Three.js scene/rendering | MIT | installed |
| @pixiv/three-vrm | 3.5.5 | web | VRM loading/runtime | MIT | installed |
| @pixiv/three-vrm-animation | 3.5.5 | web | VRMA loading/clips | MIT | installed |
| vite | 7.3.6 | web | dev/build server | MIT | installed |
| vitest | 3.2.7 | web/api/shared | unit tests | MIT | installed |
| zod | 3.25.76 | web/api | validation | MIT | installed |
| fastify | 5.10.0 | api | backend server | MIT | installed |
| @fastify/cors | 11.3.0 | api | CORS | MIT | installed |
| @fastify/rate-limit | 10.3.0 | api | rate limiting | MIT | installed |
| @mistralai/mistralai | 1.15.1 | api | official Mistral SDK | Apache-2.0 from package metadata | installed |
| @supabase/supabase-js | 2.110.2 | api | backend Supabase client | MIT | installed |
| dotenv | 17.4.2 | api | load `.env` | BSD-2-Clause | installed |
| pino | 9.14.0 | api | structured logging | MIT | installed |
| tsx | 4.23.0 | api | TS dev runtime | MIT | installed |
| typescript | 5.9.3 | root/apps | TypeScript compiler | Apache-2.0 | installed |
| eslint | 9.39.4 | root | lint | MIT | installed |
| prettier | 3.9.5 | root | formatting tool | MIT | installed |
| concurrently | 9.2.3 | root | run dev services | MIT | installed |
| @types/node | 26.1.1 | root | Node type definitions | MIT | installed |
| @types/three | 0.185.1 | root | Three type definitions | MIT | installed |

## Python Dependencies

Installed with:

```powershell
uv --cache-dir .uv-cache sync --project apps/tts
uv --cache-dir .uv-cache sync --project apps/tts --extra vieneu
```

Key installed packages:

| Package | Version | Purpose | License | Status |
| --- | ---: | --- | --- | --- |
| fastapi | 0.139.0 | TTS HTTP service | MIT | installed |
| uvicorn | 0.51.0 | ASGI server | BSD-3-Clause | installed |
| pydantic | 2.13.4 | request/response validation | MIT | installed |
| pytest | 9.1.1 | Python tests | MIT | installed |
| httpx | 0.28.1 | FastAPI test client dependency | BSD-3-Clause | installed |
| vieneu | 3.1.0 | VieNeu-TTS v3 Turbo SDK | upstream package license | installed |
| onnxruntime | 1.27.0 | local ONNX runtime dependency | MIT | installed |
| soundfile | 0.14.0 | WAV output support | BSD-3-Clause | installed |
| sea-g2p | 0.7.18 | Vietnamese text/phoneme dependency | upstream package license | installed |
| gradio | 6.20.0 | transitive dependency from `vieneu` | Apache-2.0 | installed |

## VieNeu Voice Discovery

Command:

```powershell
uv --cache-dir .uv-cache run --project apps/tts python -c "from vieneu.v3turbo import V3TurboVieNeuTTS; ..."
```

Result:

- `vieneu==3.1.0` installed.
- SDK class: `vieneu.v3turbo.V3TurboVieNeuTTS`.
- `list_preset_voices()` succeeded.
- `Trúc Ly` was found.
- Available presets included: `Trúc Ly`, `Phạm Tuyên`, `Thái Sơn`, `Xuân Vĩnh`, `Thanh Bình`, `Minh Đức`, `Ngọc Linh`, `Đoan Trang`, `Mai Anh`, `Thục Đoan`, `Minh Triết`, `Thùy Dung`, `Quang Sơn`, `Ngọc Trân`.

Sample command created:

```text
apps/tts/cache/sample-truc-ly.wav
```

Sample size: `299564` bytes. The cache folder is ignored by git.

## Security Audit

`npm audit --audit-level=high` was attempted, but the required network escalation was rejected by the execution environment due usage limits. No automatic dependency upgrade was performed.

## System Dependencies

- FFmpeg was not installed. The TTS path writes WAV directly and does not require system conversion at this stage.
- No administrator-level system configuration was changed.
