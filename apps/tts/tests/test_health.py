import os
from pathlib import Path

import numpy as np
import soundfile as sf
from fastapi.testclient import TestClient

os.environ.setdefault("TTS_SKIP_MODEL_LOAD", "1")

from app.audio_cache import cache_key
from app.main import PCM_STREAM_HEADERS, _read_cached_pcm, app


client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "warming"
    assert payload["engine"] == "vieneu"
    assert payload["modelLoaded"] is False
    assert payload["warmedUp"] is False


def test_empty_text_rejected():
    response = client.post("/synthesize", json={"text": ""})
    assert response.status_code == 422


def test_text_too_long_rejected():
    response = client.post("/synthesize", json={"text": "a" * 601})
    assert response.status_code == 422


def test_cache_key_is_stable():
    first = cache_key("xin chao", "Trúc Ly", "tu_nhien")
    second = cache_key("xin chao", "Trúc Ly", "tu_nhien")
    assert first == second
    assert first != cache_key("xin chao", "Other", "tu_nhien")


def test_cached_wav_reconstructs_f32le_pcm():
    path = Path(__file__).resolve().parents[3] / "test-results" / "audio-quality" / "unit" / "cached.wav"
    path.parent.mkdir(parents=True, exist_ok=True)
    samples = np.array([-0.25, 0.0, 0.25, 0.5], dtype=np.float32)
    sf.write(str(path), samples, 48000, subtype="PCM_16")

    try:
        pcm, sample_rate = _read_cached_pcm(path)
        decoded = np.frombuffer(pcm, dtype="<f4")
    finally:
        path.unlink(missing_ok=True)

    assert sample_rate == 48000
    assert len(pcm) == samples.size * 4
    assert decoded.dtype == np.dtype("<f4")
    assert np.max(np.abs(decoded - samples)) < 1 / 32768


def test_pcm_stream_headers_are_explicit():
    assert PCM_STREAM_HEADERS == {
        "X-Audio-Format": "f32le",
        "X-Audio-Channels": "1",
        "X-Audio-Bytes-Per-Sample": "4",
    }
