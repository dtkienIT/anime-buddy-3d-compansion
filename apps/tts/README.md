# Local TTS Service

FastAPI service for Vietnamese text-to-speech. It is designed for VieNeu-TTS through the `vieneu` Python package, with no paid TTS APIs and no voice cloning.

## Setup

```powershell
uv sync --project apps/tts
uv sync --project apps/tts --extra vieneu
```

If `vieneu` is not available for your Python version, install the Python version required by VieNeu-TTS and run the second command again.

## Run

```powershell
uv run --project apps/tts uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## CPU and GPU

The service prefers local CPU inference. If VieNeu-TTS provides a GPU/ONNX runtime option, configure that through the upstream package and environment variables without changing the API shape here.

Default voice:

```text
TTS_VOICE=Trúc Ly
TTS_STYLE=tu_nhien
TTS_DEVICE=cpu
TTS_BACKEND=onnx
```

The default `TTS_DEVICE=cpu` preserves the verified browser baseline. `TTS_DEVICE=auto` can select CUDA when ONNX Runtime exposes `CUDAExecutionProvider`, but CUDA is experimental on the 2 GB MX330 because it contends with browser WebGL. To install that optional Windows CUDA runtime:

```powershell
npm run tts:setup:gpu
uv --cache-dir .uv-cache run --project apps/tts --no-sync python -c "import onnxruntime as ort; ort.preload_dlls(directory=''); print(ort.get_available_providers())"
```

The provider list must contain `CUDAExecutionProvider`. Run GPU-enabled TTS commands with `--no-sync`; a normal `uv sync` follows VieNeu's CPU dependency and replaces the manually selected GPU wheel.

## AWS EC2 GPU

The prepared EC2 deployment binds TTS to `127.0.0.1`, requires a bearer token,
and is reached from the local Fastify API through an SSH tunnel. It deliberately
does not expose port 8000 or require a domain/load balancer. See
`../../docs/aws-gpu-tts-deployment.md` and `../../deploy/aws/tts/`.

## Hugging Face cache on Windows

VieNeu-TTS downloads model files through Hugging Face. To keep those files on the E: drive, set these values in the repo root `.env` before starting the TTS service:

```text
HF_HOME=E:\python\build phase\1\anime-buddy-3d-viewer\.hf-cache
HUGGINGFACE_HUB_CACHE=E:\python\build phase\1\anime-buddy-3d-viewer\.hf-cache\hub
```

Hugging Face can use symlinks on Windows only when Windows allows the current Python process to create them. Enable Windows Developer Mode, or run the TTS service from an elevated terminal.
