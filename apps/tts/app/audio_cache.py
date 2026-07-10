from __future__ import annotations

import hashlib
from pathlib import Path


def cache_key(text: str, voice: str, style: str) -> str:
    payload = f"{voice}\0{style}\0{text}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


class AudioCache:
    def __init__(self, cache_dir: Path, max_files: int) -> None:
        self.cache_dir = cache_dir
        self.max_files = max_files
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def path_for(self, text: str, voice: str, style: str) -> Path:
        return self.cache_dir / f"{cache_key(text, voice, style)}.wav"

    def trim(self) -> None:
        files = sorted(self.cache_dir.glob("*.wav"), key=lambda item: item.stat().st_mtime, reverse=True)
        for item in files[self.max_files :]:
            item.unlink(missing_ok=True)
