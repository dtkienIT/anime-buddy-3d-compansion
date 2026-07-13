#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(pwd)}"
PYTHON_BIN="$REPO_ROOT/apps/tts/.venv/bin/python"

nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader
"$PYTHON_BIN" -c "import onnxruntime as ort; getattr(ort, 'preload_dlls', lambda **_: None)(directory=''); providers=ort.get_available_providers(); print('ONNX providers:', providers); assert 'CUDAExecutionProvider' in providers"

TOKEN="$(sudo sed -n 's/^TTS_API_TOKEN=//p' /etc/anime-buddy-tts.env)"
curl --fail --silent --show-error \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/health
echo
sudo systemctl --no-pager --full status anime-buddy-tts.service
