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
```
