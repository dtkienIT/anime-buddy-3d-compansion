from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
import time

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import FileResponse, Response

from .audio_cache import AudioCache
from .config import get_settings
from .schemas import HealthResponse, SynthesizeRequest, VoiceInfo
from .services.vieneu_engine import VieNeuEngine, normalize_spoken_text


PCM_STREAM_HEADERS = {
    "X-Audio-Format": "f32le",
    "X-Audio-Channels": "1",
    "X-Audio-Bytes-Per-Sample": "4",
}

settings = get_settings()
engine = VieNeuEngine()
cache = AudioCache(settings.cache_dir, settings.cache_max_files)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await engine.ensure_loaded()
    if engine.model_loaded:
        await engine.warm_up(settings.voice, settings.style)
    yield


app = FastAPI(title="Anime Buddy Local TTS", version="0.2.0", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok" if engine.model_loaded and engine.warmed_up else "warming",
        engine="vieneu",
        modelLoaded=engine.model_loaded,
        warmedUp=engine.warmed_up,
    )


@app.get("/voices", response_model=list[VoiceInfo])
async def voices() -> list[VoiceInfo]:
    return [VoiceInfo(**voice) for voice in await engine.list_voices()]


@app.post("/synthesize")
async def synthesize(
    request: SynthesizeRequest,
    x_buddy_tts_request_id: str | None = Header(default=None),
):
    request_received_at = time.perf_counter()
    request_id = (x_buddy_tts_request_id or "unassigned")[:128]
    text = normalize_spoken_text(request.text)
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty after normalization")
    if len(text) > settings.max_text_length:
        raise HTTPException(status_code=400, detail="Text is too long")

    voice = request.voice or settings.voice
    style = request.style or settings.style
    available_voices = await engine.list_voices()
    voice_names = {item["name"] for item in available_voices}
    if engine.model_loaded and voice_names and voice not in voice_names:
        raise HTTPException(status_code=400, detail="Voice is not available")
    if not engine.model_loaded:
        raise HTTPException(status_code=503, detail=engine.load_error or "VieNeu engine is not available")

    path = cache.path_for(text, voice, style)
    if path.exists():
        if request.stream:
            return await _cached_pcm_response(path, "HIT", "0", request_id)
        return FileResponse(
            path,
            media_type="audio/wav",
            filename="speech.wav",
            headers={
                "X-TTS-Cache": "HIT",
                "X-TTS-Synthesis-Ms": "0",
                "X-TTS-Queue-Ms": "0",
                "X-TTS-Engine-Warm": str(engine.warmed_up).lower(),
                "X-TTS-Request-Id": request_id,
                "Server-Timing": "tts-cache-read;dur=0, tts-total;dur=0",
            },
        )

    queue_ms, synthesis_ms, generated = await engine.synthesize_to_cache_fast(
        text, voice, style, path
    )
    cache.trim()
    total_ms = (time.perf_counter() - request_received_at) * 1000
    return FileResponse(
        path,
        media_type="audio/wav",
        filename="speech.wav",
        headers={
            "X-TTS-Cache": "MISS" if generated else "HIT",
            "X-TTS-Synthesis-Ms": f"{synthesis_ms:.2f}",
            "X-TTS-Queue-Ms": f"{queue_ms:.2f}",
            "X-TTS-Engine-Warm": str(engine.warmed_up).lower(),
            "X-TTS-Request-Id": request_id,
            "Server-Timing": (
                f"tts-queue;dur={queue_ms:.2f}, "
                f"tts-synthesis;dur={synthesis_ms:.2f}, "
                f"tts-total;dur={total_ms:.2f}"
            ),
        },
    )


def _read_cached_pcm(path) -> tuple[bytes, int]:
    import numpy as np
    import soundfile as sf

    audio, sample_rate = sf.read(str(path), dtype="float32", always_2d=False)
    if getattr(audio, "ndim", 1) > 1:
        audio = audio.mean(axis=1)
    return np.asarray(audio, dtype="<f4").reshape(-1).tobytes(), int(sample_rate)


async def _cached_pcm_response(path, cache_status: str, queue_ms: str, request_id: str = "unassigned") -> Response:
    pcm, sample_rate = await asyncio.to_thread(_read_cached_pcm, path)
    return Response(
        content=pcm,
        media_type="application/octet-stream",
        headers={
            **PCM_STREAM_HEADERS,
            "X-TTS-Cache": cache_status,
            "X-TTS-Synthesis-Ms": "0",
            "X-TTS-Queue-Ms": queue_ms,
            "X-TTS-Engine-Warm": str(engine.warmed_up).lower(),
            "X-TTS-Request-Id": request_id,
            "X-Audio-Sample-Rate": str(sample_rate),
            "Server-Timing": "tts-cache-read;dur=0, tts-total;dur=0",
        },
    )
