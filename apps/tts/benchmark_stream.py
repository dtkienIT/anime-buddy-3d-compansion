"""Manual VieNeu first-chunk benchmark; logs lengths and timings, never text."""

from time import perf_counter

from app.config import get_settings
from vieneu.v3turbo import V3TurboVieNeuTTS
from vieneu_utils.phonemize_text import phonemize_text_with_emotions


settings = get_settings()
started = perf_counter()
engine = V3TurboVieNeuTTS(device="cpu", backend="onnx")
print({"event": "loaded", "ms": round((perf_counter() - started) * 1000, 2)})

for warm_text in ["Chao."]:
    list(engine.infer_stream(
        warm_text,
        voice=settings.voice,
        style=settings.style,
        denoise=False,
        use_ref_codes=True,
        apply_watermark=False,
    ))

for text in ["4", "1 cong 3 bang 4 ne!"]:
    started = perf_counter()
    chunks = engine.infer_stream(
        text,
        voice=settings.voice,
        style=settings.style,
        denoise=False,
        use_ref_codes=True,
        apply_watermark=False,
    )
    first = next(chunks)
    first_ms = (perf_counter() - started) * 1000
    sample_count = len(first)
    chunk_count = 1
    for chunk in chunks:
        sample_count += len(chunk)
        chunk_count += 1
    print({
        "event": "stream",
        "chars": len(text),
        "firstChunkMs": round(first_ms, 2),
        "totalMs": round((perf_counter() - started) * 1000, 2),
        "chunks": chunk_count,
        "samples": sample_count,
    })

speaker_emb, ref_codes = engine._resolve_ref(settings.voice, None, False, True)
for text in ["Chào bạn", "Bốn nha! Dễ quá phải không?"]:
    started = perf_counter()
    chunks = engine.engine.infer_stream(
        phonemes=phonemize_text_with_emotions(text),
        speaker_emb=speaker_emb,
        ref_codes=ref_codes,
        style=settings.style,
        use_ref_codes=True,
        chunk_frames=1,
    )
    first = next(chunks)
    first_ms = (perf_counter() - started) * 1000
    sample_count = len(first)
    chunk_count = 1
    for chunk in chunks:
        sample_count += len(chunk)
        chunk_count += 1
    print({
        "event": "stream-one-frame",
        "chars": len(text),
        "firstChunkMs": round(first_ms, 2),
        "totalMs": round((perf_counter() - started) * 1000, 2),
        "chunks": chunk_count,
        "samples": sample_count,
    })
