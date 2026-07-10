from __future__ import annotations

import argparse
import json
import math
import time
import urllib.error
import urllib.request
import wave
from pathlib import Path
from typing import Any

import numpy as np
import soundfile as sf


DEFAULT_TEXT = "Xin chao, hom nay ban cam thay the nao?"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="test-results/audio-quality/current")
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--python-url", default="http://127.0.0.1:8000/synthesize")
    parser.add_argument("--api-url", default="http://127.0.0.1:3002/api/tts")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    miss_text = f"{args.text} Probe {time.time_ns()}."

    direct = request_audio(args.python_url, args.text, stream=False)
    direct_path = out_dir / "direct-reference.wav"
    direct_path.write_bytes(direct["body"])

    python_stream = request_audio(args.python_url, args.text, stream=True)
    python_stream_path = out_dir / "streamed-reconstructed.wav"
    write_audio_response(python_stream, python_stream_path)

    api_stream = request_audio(args.api_url, args.text, stream=True)
    api_stream_path = out_dir / "api-reconstructed.wav"
    write_audio_response(api_stream, api_stream_path)

    miss_stream = request_audio(args.api_url, miss_text, stream=True)
    miss_stream_path = out_dir / "miss-api-reconstructed.wav"
    write_audio_response(miss_stream, miss_stream_path)

    miss_reference = request_audio(args.python_url, miss_text, stream=False)
    miss_reference_path = out_dir / "miss-cache-reference.wav"
    miss_reference_path.write_bytes(miss_reference["body"])

    metrics = {
        "text": args.text,
        "missText": miss_text,
        "artifacts": {
            "directReference": str(direct_path),
            "streamedReconstructed": str(python_stream_path),
            "apiReconstructed": str(api_stream_path),
            "missApiReconstructed": str(miss_stream_path),
            "missCacheReference": str(miss_reference_path),
        },
        "responses": {
            "directReference": response_summary(direct),
            "streamedReconstructed": response_summary(python_stream),
            "apiReconstructed": response_summary(api_stream),
            "missApiReconstructed": response_summary(miss_stream),
            "missCacheReference": response_summary(miss_reference),
        },
        "analysis": {
            "directVsPythonStream": compare_wavs(direct_path, python_stream_path),
            "directVsApiStream": compare_wavs(direct_path, api_stream_path),
            "missStreamVsCache": compare_wavs(miss_reference_path, miss_stream_path),
            "direct": analyze_wav(direct_path),
            "pythonStream": analyze_wav(python_stream_path),
            "apiStream": analyze_wav(api_stream_path),
            "missApiStream": analyze_wav(miss_stream_path),
        },
    }

    metrics_path = out_dir / "metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


def request_audio(url: str, text: str, stream: bool) -> dict[str, Any]:
    payload = json.dumps({"text": text, "stream": stream}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        headers={"content-type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            headers_at = time.perf_counter()
            body = response.read()
            completed_at = time.perf_counter()
            headers = {key.lower(): value for key, value in response.headers.items()}
            return {
                "status": response.status,
                "headers": headers,
                "body": body,
                "headersMs": (headers_at - started) * 1000,
                "completedMs": (completed_at - started) * 1000,
            }
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"{url} returned {exc.code}: {exc.read().decode('utf-8', 'ignore')}") from exc


def write_audio_response(response: dict[str, Any], path: Path) -> None:
    headers = response["headers"]
    content_type = headers.get("content-type", "")
    if content_type.startswith("audio/wav"):
        path.write_bytes(response["body"])
        return

    fmt = headers.get("x-audio-format")
    sample_rate = int(headers.get("x-audio-sample-rate", "0"))
    channels = int(headers.get("x-audio-channels", "0"))
    bytes_per_sample = int(headers.get("x-audio-bytes-per-sample", "0"))
    body = response["body"]

    if fmt not in {"f32le", "s16le"} or sample_rate <= 0 or channels != 1:
        raise RuntimeError(f"Unsupported PCM stream metadata: {headers}")
    if len(body) % (channels * bytes_per_sample) != 0:
        raise RuntimeError(f"PCM stream ended off frame boundary: {len(body)} bytes")

    if fmt == "f32le":
        if bytes_per_sample != 4:
            raise RuntimeError(f"f32le stream has invalid bytes per sample: {bytes_per_sample}")
        samples = np.frombuffer(body, dtype="<f4")
    else:
        if bytes_per_sample != 2:
            raise RuntimeError(f"s16le stream has invalid bytes per sample: {bytes_per_sample}")
        samples = np.frombuffer(body, dtype="<i2").astype(np.float32) / 32768
    sf.write(str(path), samples, sample_rate, subtype="PCM_16")


def response_summary(response: dict[str, Any]) -> dict[str, Any]:
    headers = response["headers"]
    return {
        "status": response["status"],
        "contentType": headers.get("content-type"),
        "cache": headers.get("x-tts-cache"),
        "format": headers.get("x-audio-format"),
        "sampleRate": headers.get("x-audio-sample-rate"),
        "channels": headers.get("x-audio-channels"),
        "bytesPerSample": headers.get("x-audio-bytes-per-sample"),
        "bytes": len(response["body"]),
        "headersMs": response["headersMs"],
        "completedMs": response["completedMs"],
    }


def analyze_wav(path: Path) -> dict[str, Any]:
    samples, sample_rate = sf.read(str(path), dtype="float32", always_2d=False)
    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim > 1:
        samples = samples.mean(axis=1)

    finite = np.isfinite(samples)
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    rms = float(np.sqrt(np.mean(samples * samples))) if samples.size else 0.0
    clipping_ratio = float(np.mean(np.abs(samples) >= 0.999)) if samples.size else 0.0
    zero_gap_ms = longest_zero_gap_ms(samples, sample_rate)
    boundary_spikes = boundary_spike_count(samples, sample_rate)

    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        frames = wav.getnframes()

    return {
        "sampleRate": int(sample_rate),
        "channels": int(channels),
        "bitDepth": int(sample_width * 8),
        "sampleCount": int(samples.size),
        "durationMs": float(samples.size / sample_rate * 1000) if sample_rate else 0.0,
        "peak": peak,
        "rms": rms,
        "dcOffset": float(np.mean(samples)) if samples.size else 0.0,
        "clippingRatio": clipping_ratio,
        "nanOrInfinity": int(samples.size - np.count_nonzero(finite)),
        "longestZeroGapMs": zero_gap_ms,
        "boundarySpikeCount": boundary_spikes,
        "waveFrames": int(frames),
    }


def compare_wavs(reference_path: Path, candidate_path: Path) -> dict[str, Any]:
    reference, reference_rate = read_mono(reference_path)
    candidate, candidate_rate = read_mono(candidate_path)
    count = min(reference.size, candidate.size)
    if count == 0:
        correlation = 0.0
    else:
        ref = reference[:count] - np.mean(reference[:count])
        cand = candidate[:count] - np.mean(candidate[:count])
        denominator = np.linalg.norm(ref) * np.linalg.norm(cand)
        correlation = float(np.dot(ref, cand) / denominator) if denominator else 0.0
    sample_diff = int(candidate.size - reference.size)
    denominator = max(1, reference.size)
    return {
        "referenceSampleRate": int(reference_rate),
        "candidateSampleRate": int(candidate_rate),
        "sampleCountDifference": sample_diff,
        "sampleCountDifferenceRatio": abs(sample_diff) / denominator,
        "correlation": correlation,
    }


def read_mono(path: Path) -> tuple[np.ndarray, int]:
    samples, sample_rate = sf.read(str(path), dtype="float32", always_2d=False)
    samples = np.asarray(samples, dtype=np.float32)
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    return samples, int(sample_rate)


def longest_zero_gap_ms(samples: np.ndarray, sample_rate: int) -> float:
    if samples.size == 0 or sample_rate <= 0:
        return 0.0
    silent = np.abs(samples) < 1e-6
    longest = 0
    current = 0
    for item in silent:
        if item:
            current += 1
            longest = max(longest, current)
        else:
            current = 0
    return longest / sample_rate * 1000


def boundary_spike_count(samples: np.ndarray, sample_rate: int) -> int:
    if samples.size < 2 or sample_rate <= 0:
        return 0
    diff = np.abs(np.diff(samples))
    threshold = max(0.25, float(np.mean(diff) + 8 * np.std(diff)))
    return int(np.count_nonzero(diff > threshold))


if __name__ == "__main__":
    main()
