from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


APP_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = APP_DIR.parents[1]


class Settings(BaseModel):
    host: str = Field(default="127.0.0.1")
    port: int = Field(default=8000)
    voice: str = Field(default="Trúc Ly")
    style: str = Field(default="tu_nhien")
    max_text_length: int = Field(default=600)
    cache_dir: Path = Field(default=APP_DIR / "cache")
    cache_max_files: int = Field(default=200)
    api_token: str = Field(default="")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    load_env_file(REPO_ROOT / ".env")
    cache_dir = Path(os.getenv("TTS_CACHE_DIR", "./cache"))
    if not cache_dir.is_absolute():
        cache_dir = APP_DIR / cache_dir

    return Settings(
        host=os.getenv("TTS_HOST", "127.0.0.1"),
        port=int(os.getenv("TTS_PORT", "8000")),
        voice=os.getenv("TTS_VOICE", "Trúc Ly"),
        style=os.getenv("TTS_STYLE", "tu_nhien"),
        max_text_length=int(os.getenv("TTS_MAX_TEXT_LENGTH", "600")),
        cache_dir=cache_dir,
        cache_max_files=int(os.getenv("TTS_CACHE_MAX_FILES", "200")),
        api_token=os.getenv("TTS_API_TOKEN", "").strip(),
    )


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)
