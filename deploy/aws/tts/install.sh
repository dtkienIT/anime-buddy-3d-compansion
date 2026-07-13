#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-$(pwd)}"
RUN_USER="${SUDO_USER:-$USER}"
TTS_API_TOKEN="${TTS_API_TOKEN:-}"
ENV_FILE="/etc/anime-buddy-tts.env"
STATE_DIR="/var/lib/anime-buddy-tts"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$REPO_ROOT/apps/tts/pyproject.toml" ]]; then
  echo "Run this script from the repository root or pass the repository path." >&2
  exit 1
fi

if (( ${#TTS_API_TOKEN} < 32 )); then
  echo "Set TTS_API_TOKEN to a random value of at least 32 characters first." >&2
  echo 'Example: export TTS_API_TOKEN="$(openssl rand -hex 32)"' >&2
  exit 1
fi

if ! command -v nvidia-smi >/dev/null 2>&1; then
  echo "nvidia-smi is unavailable. Use an AWS GPU AMI with NVIDIA drivers." >&2
  exit 1
fi
nvidia-smi >/dev/null

if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

uv python install 3.11
uv --cache-dir "$REPO_ROOT/.uv-cache" sync \
  --project "$REPO_ROOT/apps/tts" \
  --python 3.11 \
  --extra vieneu

PYTHON_BIN="$REPO_ROOT/apps/tts/.venv/bin/python"
UVICORN_BIN="$REPO_ROOT/apps/tts/.venv/bin/uvicorn"

uv --cache-dir "$REPO_ROOT/.uv-cache" pip uninstall \
  --python "$PYTHON_BIN" onnxruntime || true
uv --cache-dir "$REPO_ROOT/.uv-cache" pip install \
  --python "$PYTHON_BIN" 'onnxruntime-gpu[cuda,cudnn]==1.26.0'

"$PYTHON_BIN" -c "import onnxruntime as ort; getattr(ort, 'preload_dlls', lambda **_: None)(directory=''); providers=ort.get_available_providers(); print(providers); assert 'CUDAExecutionProvider' in providers"

sudo install -d -m 0750 -o "$RUN_USER" -g "$RUN_USER" "$STATE_DIR/cache" "$STATE_DIR/huggingface"

TEMP_ENV="$(mktemp)"
trap 'rm -f "$TEMP_ENV"' EXIT
{
  echo 'TTS_HOST=127.0.0.1'
  echo 'TTS_PORT=8000'
  echo 'TTS_DEVICE=cuda'
  echo 'TTS_BACKEND=onnx'
  echo 'TTS_VOICE="Trúc Ly"'
  echo 'TTS_STYLE=tu_nhien'
  echo 'TTS_MAX_TEXT_LENGTH=600'
  echo "TTS_CACHE_DIR=$STATE_DIR/cache"
  echo 'TTS_CACHE_MAX_FILES=500'
  echo 'TTS_STREAM_CHUNK_FRAMES=1'
  echo "HF_HOME=$STATE_DIR/huggingface"
  echo "HUGGINGFACE_HUB_CACHE=$STATE_DIR/huggingface/hub"
  printf 'TTS_API_TOKEN=%s\n' "$TTS_API_TOKEN"
} > "$TEMP_ENV"
sudo install -m 0600 -o root -g root "$TEMP_ENV" "$ENV_FILE"

TEMP_SERVICE="$(mktemp)"
sed \
  -e "s|__RUN_USER__|$RUN_USER|g" \
  -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
  -e "s|__ENV_FILE__|$ENV_FILE|g" \
  -e "s|__UVICORN__|$UVICORN_BIN|g" \
  "$SCRIPT_DIR/anime-buddy-tts.service.template" > "$TEMP_SERVICE"
sudo install -m 0644 "$TEMP_SERVICE" /etc/systemd/system/anime-buddy-tts.service
rm -f "$TEMP_SERVICE"

sudo systemctl daemon-reload
sudo systemctl enable --now anime-buddy-tts.service

echo "Anime Buddy TTS is installed and bound to 127.0.0.1:8000."
echo "Port 8000 must remain closed in the EC2 security group."
echo "Run deploy/aws/tts/verify-gpu.sh after the model finishes warming up."
