"""Render the original companion song once with local TTS and a gentle backing track.

The running VieNeu service supplies the vocal. Intermediate WAV segments live under
test-results so an interrupted render can resume without touching runtime caches.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import math
from pathlib import Path
import urllib.request

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_LYRICS = ROOT / "apps/web/public/audio/music/Cham-Vao-Binh-Minh.lyrics.txt"
DEFAULT_OUTPUT = ROOT / "apps/web/public/audio/music/Cham-Vao-Binh-Minh.mp3"
SEGMENT_DIR = ROOT / "test-results/companion-song/segments"
SAMPLE_RATE = 48_000
CACHE_SCHEMA_VERSION = "companion-song-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lyrics", type=Path, default=DEFAULT_LYRICS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--tts-url", default="http://127.0.0.1:8000/synthesize")
    parser.add_argument("--voice", default="Trúc Ly")
    parser.add_argument("--style", default="doc_truyen")
    parser.add_argument("--renderer-id", default="vieneu-tts-v3-turbo")
    parser.add_argument("--target-seconds", type=float, default=180.0)
    parser.add_argument("--force", action="store_true", help="Ignore cached vocal segments")
    return parser.parse_args()


def load_sections(path: Path) -> list[str]:
    blocks = path.read_text(encoding="utf-8").split("\n\n")
    sections: list[str] = []
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip() and not line.lstrip().startswith("#")]
        if not lines:
            continue
        text = " ".join(lines)
        if len(text) > 600:
            raise ValueError(f"A lyric section exceeds the TTS 600-character limit: {len(text)}")
        sections.append(text)
    if not sections:
        raise ValueError("No lyric sections found")
    return sections


def synthesize_section(
    text: str,
    url: str,
    voice: str,
    style: str,
    renderer_id: str,
    index: int,
    force: bool,
) -> np.ndarray:
    cache_key = hashlib.sha256(
        f"{CACHE_SCHEMA_VERSION}\0{renderer_id}\0{url}\0{voice}\0{style}\0{text}".encode("utf-8")
    ).hexdigest()
    cached = SEGMENT_DIR / f"{index:02d}-{cache_key}.wav"
    if cached.exists() and not force:
        audio, sample_rate = sf.read(cached, dtype="float32", always_2d=False)
        print(f"segment {index:02d}: reuse {cached.name}")
    else:
        payload = json.dumps({
            "text": text,
            "voice": voice,
            "style": style,
            "stream": False,
        }, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json; charset=utf-8",
                "X-Buddy-TTS-Request-Id": f"companion-song-{index:02d}",
            },
        )
        print(f"segment {index:02d}: rendering {len(text)} characters")
        with urllib.request.urlopen(request, timeout=180) as response:
            wav_bytes = response.read()
        audio, sample_rate = sf.read(io.BytesIO(wav_bytes), dtype="float32", always_2d=False)
        SEGMENT_DIR.mkdir(parents=True, exist_ok=True)
        sf.write(cached, audio, sample_rate, subtype="PCM_16")

    if audio.ndim > 1:
        audio = audio.mean(axis=1)
    audio = resample(np.asarray(audio, dtype=np.float32), int(sample_rate), SAMPLE_RATE)
    return trim_silence(audio)


def resample(audio: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or audio.size == 0:
        return audio
    target_length = max(1, round(audio.size * target_rate / source_rate))
    source_positions = np.linspace(0, audio.size - 1, num=audio.size, dtype=np.float64)
    target_positions = np.linspace(0, audio.size - 1, num=target_length, dtype=np.float64)
    return np.interp(target_positions, source_positions, audio).astype(np.float32)


def trim_silence(audio: np.ndarray) -> np.ndarray:
    audible = np.flatnonzero(np.abs(audio) > 0.001)
    if audible.size == 0:
        return audio
    margin = round(0.08 * SAMPLE_RATE)
    start = max(0, int(audible[0]) - margin)
    end = min(audio.size, int(audible[-1]) + margin + 1)
    clipped = audio[start:end].copy()
    fade_frames = min(round(0.025 * SAMPLE_RATE), clipped.size // 2)
    if fade_frames:
        fade = np.linspace(0, 1, fade_frames, dtype=np.float32)
        clipped[:fade_frames] *= fade
        clipped[-fade_frames:] *= fade[::-1]
    return clipped


def arrange_vocals(segments: list[np.ndarray], target_seconds: float) -> tuple[np.ndarray, float]:
    intro_seconds = 6.0
    outro_seconds = 7.0
    minimum_gap = 0.7
    vocal_seconds = sum(segment.size for segment in segments) / SAMPLE_RATE
    gap_count = max(0, len(segments) - 1)
    minimum_duration = intro_seconds + vocal_seconds + gap_count * minimum_gap + outro_seconds
    duration = max(target_seconds, minimum_duration)
    gap = (duration - intro_seconds - outro_seconds - vocal_seconds) / gap_count if gap_count else 0
    total_frames = math.ceil(duration * SAMPLE_RATE)
    vocal = np.zeros(total_frames, dtype=np.float32)
    cursor = round(intro_seconds * SAMPLE_RATE)
    for segment in segments:
        end = min(total_frames, cursor + segment.size)
        vocal[cursor:end] += segment[: end - cursor]
        cursor = end + round(gap * SAMPLE_RATE)
    return vocal, duration


def build_backing(duration: float) -> np.ndarray:
    total_frames = math.ceil(duration * SAMPLE_RATE)
    backing = np.zeros(total_frames, dtype=np.float32)
    beat_seconds = 60 / 76
    chord_seconds = beat_seconds * 4
    chords = [
        (130.81, 164.81, 196.00),  # C
        (98.00, 146.83, 196.00),   # G
        (110.00, 130.81, 164.81),  # Am
        (87.31, 130.81, 174.61),   # F
    ]

    chord_index = 0
    start = 0.0
    while start < duration:
        chord = chords[chord_index % len(chords)]
        add_pad(backing, start, min(chord_seconds, duration - start), chord)
        for beat in range(4):
            beat_at = start + beat * beat_seconds
            if beat_at >= duration:
                break
            note = chord[beat % len(chord)] * 2
            add_pluck(backing, beat_at, note)
            add_soft_beat(backing, beat_at, strong=beat == 0)
        start += chord_seconds
        chord_index += 1

    fade_frames = min(round(4 * SAMPLE_RATE), backing.size // 2)
    fade = np.linspace(0, 1, fade_frames, dtype=np.float32)
    backing[:fade_frames] *= fade
    backing[-fade_frames:] *= fade[::-1]
    return backing


def add_pad(output: np.ndarray, start: float, duration: float, frequencies: tuple[float, ...]) -> None:
    first = round(start * SAMPLE_RATE)
    count = min(output.size - first, round(duration * SAMPLE_RATE))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    attack = np.minimum(1, t / 0.55)
    release = np.minimum(1, (duration - t) / 0.7)
    envelope = np.maximum(0, attack * release)
    tone = np.zeros(count, dtype=np.float32)
    for frequency in frequencies:
        tone += np.sin(2 * np.pi * frequency * t) + 0.18 * np.sin(4 * np.pi * frequency * t)
    output[first:first + count] += tone * envelope * (0.018 / len(frequencies))


def add_pluck(output: np.ndarray, start: float, frequency: float) -> None:
    first = round(start * SAMPLE_RATE)
    count = min(output.size - first, round(0.72 * SAMPLE_RATE))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    envelope = np.exp(-5.5 * t)
    tone = np.sin(2 * np.pi * frequency * t) + 0.35 * np.sin(4 * np.pi * frequency * t)
    output[first:first + count] += tone * envelope * 0.022


def add_soft_beat(output: np.ndarray, start: float, strong: bool) -> None:
    first = round(start * SAMPLE_RATE)
    count = min(output.size - first, round(0.22 * SAMPLE_RATE))
    if count <= 0:
        return
    t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    frequency = 58 - 20 * (t / max(t[-1], 1 / SAMPLE_RATE))
    phase = 2 * np.pi * np.cumsum(frequency) / SAMPLE_RATE
    output[first:first + count] += np.sin(phase) * np.exp(-18 * t) * (0.035 if strong else 0.018)


def mix_and_write(vocal: np.ndarray, backing: np.ndarray, output: Path) -> None:
    audible = vocal[np.abs(vocal) > 0.002]
    if audible.size:
        rms = float(np.sqrt(np.mean(audible * audible)))
        vocal_gain = min(1.8, 0.12 / max(rms, 1e-6))
    else:
        vocal_gain = 1.0
    mixed = vocal * vocal_gain + backing
    peak = float(np.max(np.abs(mixed))) if mixed.size else 1.0
    mixed *= min(1.0, 0.94 / max(peak, 1e-6))
    output.parent.mkdir(parents=True, exist_ok=True)
    sf.write(
        output,
        mixed,
        SAMPLE_RATE,
        format="MP3",
        subtype="MPEG_LAYER_III",
        compression_level=0.72,
    )


def main() -> None:
    args = parse_args()
    if not math.isfinite(args.target_seconds) or not 30 <= args.target_seconds <= 600:
        raise ValueError("--target-seconds must be a finite value between 30 and 600")
    if not args.renderer_id.strip():
        raise ValueError("--renderer-id must not be empty")
    output = args.output.resolve()
    if not output.is_relative_to(ROOT):
        raise ValueError("--output must stay inside the repository")

    sections = load_sections(args.lyrics.resolve())
    segments = [
        synthesize_section(
            text,
            args.tts_url,
            args.voice,
            args.style,
            args.renderer_id,
            index,
            args.force,
        )
        for index, text in enumerate(sections, start=1)
    ]
    vocal, duration = arrange_vocals(segments, args.target_seconds)
    backing = build_backing(duration)
    mix_and_write(vocal, backing, output)
    info = sf.info(output)
    print(json.dumps({
        "output": str(output.relative_to(ROOT)),
        "sections": len(sections),
        "durationSeconds": round(info.duration, 3),
        "sampleRate": info.samplerate,
        "channels": info.channels,
        "bytes": output.stat().st_size,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
