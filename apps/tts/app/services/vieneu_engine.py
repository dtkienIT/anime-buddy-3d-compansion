from __future__ import annotations

import asyncio
import importlib
import os
import re
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any, AsyncIterator


class VieNeuEngine:
    def __init__(self) -> None:
        self._engine: Any | None = None
        self._load_error: str | None = None
        self._lock = asyncio.Lock()
        self._synthesis_lock = asyncio.Lock()
        self._warmed_up = False

    @property
    def model_loaded(self) -> bool:
        return self._engine is not None

    @property
    def load_error(self) -> str | None:
        return self._load_error

    @property
    def warmed_up(self) -> bool:
        return self._warmed_up

    @property
    def sample_rate(self) -> int:
        return int(getattr(self._engine, "sample_rate", 48_000))

    async def ensure_loaded(self) -> None:
        if self._engine is not None or self._load_error:
            return

        async with self._lock:
            if self._engine is not None or self._load_error:
                return
            if os.getenv("TTS_SKIP_MODEL_LOAD") == "1":
                self._load_error = "Model loading skipped by TTS_SKIP_MODEL_LOAD"
                return
            try:
                self._engine = await asyncio.to_thread(self._create_engine)
            except Exception as exc:  # pragma: no cover - depends on optional package
                self._load_error = str(exc)

    async def warm_up(self, voice: str, style: str) -> None:
        await self.ensure_loaded()
        if self._engine is None or self._warmed_up:
            return
        async with self._synthesis_lock:
            if self._warmed_up:
                return
            resolved_voice = await asyncio.to_thread(self._resolve_voice_sync, voice)
            await asyncio.to_thread(self._warm_up_sync, resolved_voice, style)
            self._warmed_up = True

    async def acquire_synthesis(self) -> float:
        queued_at = time.perf_counter()
        await self._synthesis_lock.acquire()
        return (time.perf_counter() - queued_at) * 1000

    def release_synthesis(self) -> None:
        if self._synthesis_lock.locked():
            self._synthesis_lock.release()

    async def list_voices(self) -> list[dict[str, str | None]]:
        await self.ensure_loaded()
        if self._engine is None:
            return [{"name": "Trúc Ly", "gender": "female", "locale": "vi-VN"}]

        voices = await asyncio.to_thread(self._list_voices_sync)
        if not voices:
            return [{"name": "Trúc Ly", "gender": "female", "locale": "vi-VN"}]
        return voices

    async def resolve_voice(self, voice: str) -> str:
        await self.ensure_loaded()
        if self._engine is None:
            return voice
        return await asyncio.to_thread(self._resolve_voice_sync, voice)

    async def synthesize(self, text: str, voice: str, style: str, output_path: Path) -> None:
        await self.ensure_loaded()
        if self._engine is None:
            raise RuntimeError("vieneu package is not installed or could not be loaded")

        resolved_voice = await asyncio.to_thread(self._resolve_voice_sync, voice)
        normalized = normalize_spoken_text(text)
        async with self._synthesis_lock:
            await asyncio.to_thread(self._synthesize_sync, normalized, resolved_voice, style, output_path)

    async def synthesize_to_cache_fast(
        self,
        text: str,
        voice: str,
        style: str,
        output_path: Path,
    ) -> tuple[float, float, bool]:
        """Populate one cache entry with the low-latency decoder.

        The synthesis lock and the cache re-check make concurrent requests for the
        same text collapse to one generation. Audio is still returned only after a
        complete PCM16 WAV exists, so slow CPU inference cannot underflow browser
        playback.
        """
        await self.ensure_loaded()
        if self._engine is None:
            raise RuntimeError("vieneu package is not installed or could not be loaded")

        resolved_voice = await asyncio.to_thread(self._resolve_voice_sync, voice)
        queued_at = time.perf_counter()
        async with self._synthesis_lock:
            queue_ms = (time.perf_counter() - queued_at) * 1000
            if output_path.exists() and output_path.stat().st_size > 44:
                return queue_ms, 0.0, False

            started_at = time.perf_counter()
            normalized = normalize_spoken_text(text)
            await asyncio.to_thread(
                self._synthesize_streaming_sync,
                normalized,
                resolved_voice,
                style,
                output_path,
            )
            synthesis_ms = (time.perf_counter() - started_at) * 1000
            return queue_ms, synthesis_ms, True

    async def stream_to_cache_locked(
        self,
        text: str,
        voice: str,
        style: str,
        output_path: Path,
    ) -> AsyncIterator[bytes]:
        """Stream native VieNeu float32 PCM while atomically populating the WAV cache."""
        if self._engine is None:
            self.release_synthesis()
            raise RuntimeError("vieneu package is not installed or could not be loaded")

        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[tuple[str, Any]] = asyncio.Queue()
        stop_event = threading.Event()
        normalized = normalize_spoken_text(text)
        temp_path = output_path.with_name(f".{output_path.name}.{uuid.uuid4().hex}.part")

        def produce() -> None:
            import numpy as np
            import soundfile as sf

            completed = False
            try:
                with sf.SoundFile(
                    str(temp_path),
                    mode="w",
                    samplerate=self.sample_rate,
                    channels=1,
                    subtype="PCM_16",
                    format="WAV",
                ) as wav_file:
                    for raw_chunk in self._stream_chunks_sync(normalized, voice, style):
                        if stop_event.is_set():
                            break
                        chunk = np.asarray(raw_chunk, dtype="<f4").reshape(-1)
                        if chunk.size == 0:
                            continue
                        wav_file.write(chunk)
                        loop.call_soon_threadsafe(queue.put_nowait, ("chunk", chunk.tobytes()))
                    else:
                        completed = True

                if completed and temp_path.exists() and temp_path.stat().st_size > 44:
                    os.replace(temp_path, output_path)
                loop.call_soon_threadsafe(queue.put_nowait, ("done", None))
            except Exception as exc:
                loop.call_soon_threadsafe(queue.put_nowait, ("error", exc))
            finally:
                if temp_path.exists():
                    temp_path.unlink(missing_ok=True)

        producer = asyncio.create_task(asyncio.to_thread(produce))
        try:
            while True:
                kind, payload = await queue.get()
                if kind == "chunk":
                    yield payload
                elif kind == "error":
                    raise payload
                else:
                    break
        finally:
            stop_event.set()
            self.release_synthesis()
            try:
                await asyncio.shield(producer)
            except asyncio.CancelledError:
                # The single worker owns VieNeu's threading.Lock and will observe
                # stop_event on its next native chunk, then clean its temp file.
                pass

    def _create_engine(self) -> Any:
        module = importlib.import_module("vieneu.v3turbo")
        engine_class = getattr(module, "V3TurboVieNeuTTS")
        requested_device = os.getenv("TTS_DEVICE", "cpu").strip().lower()
        device = self._resolve_device(requested_device)
        return engine_class(
            device=device,
            backend=os.getenv("TTS_BACKEND", "onnx"),
        )

    @staticmethod
    def _resolve_device(requested_device: str) -> str:
        if requested_device not in {"auto", "cpu", "cuda"}:
            raise ValueError("TTS_DEVICE must be one of: auto, cpu, cuda")
        if requested_device == "cpu":
            return "cpu"

        try:
            ort = importlib.import_module("onnxruntime")
            preload_dlls = getattr(ort, "preload_dlls", None)
            if callable(preload_dlls):
                preload_dlls(directory="")
            providers = set(ort.get_available_providers())
        except Exception:
            if requested_device == "cuda":
                raise
            return "cpu"

        if "CUDAExecutionProvider" in providers:
            return "cuda"
        if requested_device == "cuda":
            raise RuntimeError(
                "TTS_DEVICE=cuda was requested but CUDAExecutionProvider is unavailable"
            )
        return "cpu"

    def _warm_up_sync(self, voice: str, style: str) -> None:
        engine = self._engine
        if engine is None:
            return
        # A tiny real inference initializes ONNX graphs and the streaming codec.
        for _ in engine.infer_stream(
            "Chao.",
            voice=voice,
            style=style,
            denoise=False,
            use_ref_codes=True,
            apply_watermark=True,
        ):
            pass

    def _resolve_voice_sync(self, requested: str) -> str:
        voices = self._list_voices_sync()
        names = [str(voice["name"]) for voice in voices if voice.get("name")]
        if not names:
            return requested
        if requested in names:
            return requested

        requested_key = voice_match_key(requested)
        for name in names:
            if voice_match_key(name) == requested_key:
                return name

        return names[0]

    def _stream_chunks_sync(self, text: str, voice: str, style: str):
        """Use the v3.1 ONNX decode-step API with a one-frame lead-in when available."""
        engine = self._engine
        underlying = getattr(engine, "engine", None)
        stream_fn = getattr(underlying, "infer_stream", None)
        resolve_ref = getattr(engine, "_resolve_ref", None)
        apply_watermark = getattr(engine, "_apply_watermark", lambda audio: audio)
        if stream_fn is None or resolve_ref is None:
            yield from engine.infer_stream(
                text,
                voice=voice,
                style=style,
                denoise=False,
                use_ref_codes=True,
            )
            return

        from vieneu_utils.phonemize_text import normalize_to_chunks_v3, phonemize_text_with_emotions

        speaker_emb, ref_codes = resolve_ref(voice, None, False, True)
        chunk_frames = max(1, min(8, int(os.getenv("TTS_STREAM_CHUNK_FRAMES", "1"))))
        for text_chunk in normalize_to_chunks_v3(text, max_chars=256):
            phonemes = phonemize_text_with_emotions(text_chunk)
            for audio_chunk in stream_fn(
                phonemes=phonemes,
                speaker_emb=speaker_emb,
                ref_codes=ref_codes,
                style=style,
                use_ref_codes=True,
                temperature=0.8,
                top_k=25,
                top_p=0.95,
                max_new_frames=300,
                chunk_frames=chunk_frames,
                repetition_penalty=1.2,
            ):
                yield apply_watermark(audio_chunk)

    def _list_voices_sync(self) -> list[dict[str, str | None]]:
        engine = self._engine
        if engine is None:
            return []

        if hasattr(engine, "list_preset_voices"):
            raw = engine.list_preset_voices()
        elif hasattr(engine, "voices"):
            raw = engine.voices
        else:
            raw = []

        result: list[dict[str, str | None]] = []
        for item in raw or []:
            if isinstance(item, str):
                result.append({"name": item, "gender": None, "locale": "vi-VN"})
            elif isinstance(item, tuple):
                name = str(item[1] if len(item) > 1 and isinstance(item[1], str) else item[0]) if item else ""
                display = str(item[0]) if item else ""
                metadata = item[1] if len(item) > 1 and isinstance(item[1], dict) else {}
                result.append({
                    "name": name,
                    "gender": metadata.get("gender") or ("female" if "Nữ" in display else "male" if "Nam" in display else None),
                    "locale": metadata.get("locale") or "vi-VN",
                })
            elif isinstance(item, dict):
                result.append({
                    "name": str(item.get("name") or item.get("voice") or item.get("id")),
                    "gender": item.get("gender"),
                    "locale": item.get("locale") or "vi-VN",
                })
            else:
                name = getattr(item, "name", None) or getattr(item, "voice", None) or getattr(item, "id", None)
                if name:
                    result.append({
                        "name": str(name),
                        "gender": getattr(item, "gender", None),
                        "locale": getattr(item, "locale", "vi-VN"),
                    })
        return [voice for voice in result if voice["name"]]

    def _synthesize_sync(self, text: str, voice: str, style: str, output_path: Path) -> None:
        engine = self._engine
        if engine is None:
            raise RuntimeError("vieneu is not loaded")

        if hasattr(engine, "infer") and hasattr(engine, "save"):
            audio = engine.infer(text, voice=voice, style=style, denoise=False, use_ref_codes=True)
            engine.save(audio, output_path)
            if output_path.exists() and output_path.stat().st_size > 44:
                return

        module = importlib.import_module("vieneu")
        candidates = [
            getattr(module, "synthesize_to_file", None),
            getattr(module, "synthesize", None),
            getattr(module, "tts", None),
        ]
        for candidate in candidates:
            if candidate is None:
                continue
            result = self._call_candidate(candidate, text, voice, style, output_path)
            if self._materialize_result(result, output_path):
                return

        raise RuntimeError("Could not find a compatible vieneu synthesis function")

    def _synthesize_streaming_sync(self, text: str, voice: str, style: str, output_path: Path) -> None:
        import numpy as np
        import soundfile as sf

        temp_path = output_path.with_name(f".{output_path.name}.{uuid.uuid4().hex}.part")
        try:
            with sf.SoundFile(
                str(temp_path),
                mode="w",
                samplerate=self.sample_rate,
                channels=1,
                subtype="PCM_16",
                format="WAV",
            ) as wav_file:
                for raw_chunk in self._stream_chunks_sync(text, voice, style):
                    chunk = np.asarray(raw_chunk, dtype="<f4").reshape(-1)
                    if chunk.size:
                        wav_file.write(chunk)

            if not temp_path.exists() or temp_path.stat().st_size <= 44:
                raise RuntimeError("VieNeu produced an empty audio stream")
            os.replace(temp_path, output_path)
        finally:
            temp_path.unlink(missing_ok=True)

    def _call_candidate(self, candidate: Any, text: str, voice: str, style: str, output_path: Path) -> Any:
        try:
            return candidate(text=text, voice=voice, style=style, output_path=str(output_path))
        except TypeError:
            try:
                return candidate(text, voice=voice, style=style)
            except TypeError:
                return candidate(text)

    def _materialize_result(self, result: Any, output_path: Path) -> bool:
        if output_path.exists() and output_path.stat().st_size > 44:
            return True

        if isinstance(result, (bytes, bytearray)):
            output_path.write_bytes(bytes(result))
            return output_path.stat().st_size > 44

        if isinstance(result, str) and Path(result).exists():
            output_path.write_bytes(Path(result).read_bytes())
            return output_path.stat().st_size > 44

        if hasattr(result, "save"):
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
                temp_path = Path(temp.name)
            result.save(str(temp_path))
            output_path.write_bytes(temp_path.read_bytes())
            temp_path.unlink(missing_ok=True)
            return output_path.stat().st_size > 44

        return False


def normalize_spoken_text(text: str) -> str:
    text = re.sub(r"https?://\S+", " duong dan ", text)
    text = re.sub(r"[#*_`>\[\](){}|]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def voice_match_key(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", text.casefold())
