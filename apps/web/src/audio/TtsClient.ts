import { env } from "../config/env.js";
import { perfMetrics } from "../utils/PerformanceMetrics.js";
import type { VoiceSettings } from "./VoiceSettings.js";

export type PcmAudioFormat = "f32le" | "s16le";

export interface PcmAudioMetadata {
  format: PcmAudioFormat;
  sampleRate: number;
  channels: number;
  bytesPerSample: number;
}

export type TtsAudio =
  | { kind: "blob"; blob: Blob }
  | ({ kind: "pcm-stream"; stream: ReadableStream<Uint8Array> } & PcmAudioMetadata);

export class TtsClient {
  constructor(private readonly baseUrl = env.apiBaseUrl) {}

  async synthesize(text: string, settings: VoiceSettings, signal?: AbortSignal): Promise<TtsAudio> {
    perfMetrics.mark("ttsRequestStartedAt");
    const response = await fetch(`${this.baseUrl}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voice: settings.voice,
        style: settings.style,
        stream: true
      }),
      signal
    });
    perfMetrics.mark("ttsResponseHeadersAt");
    perfMetrics.addTtsMetadata({
      cache: response.headers.get("x-tts-cache"),
      synthesisMs: response.headers.get("x-tts-synthesis-ms"),
      queueMs: response.headers.get("x-tts-queue-ms"),
      engineWarm: response.headers.get("x-tts-engine-warm"),
      audioFormat: response.headers.get("x-audio-format"),
      audioSampleRate: response.headers.get("x-audio-sample-rate"),
      audioChannels: response.headers.get("x-audio-channels"),
      audioBytesPerSample: response.headers.get("x-audio-bytes-per-sample"),
      serverTiming: response.headers.get("server-timing")
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `TTS failed with ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.startsWith("application/octet-stream") && response.body) {
      return { kind: "pcm-stream", stream: response.body, ...parsePcmMetadata(response.headers) };
    }

    const blob = await response.blob();
    perfMetrics.mark("ttsResponseCompletedAt");
    return { kind: "blob", blob };
  }
}

function parsePcmMetadata(headers: Headers): PcmAudioMetadata {
  const format = headers.get("x-audio-format");
  const sampleRate = Number(headers.get("x-audio-sample-rate"));
  const channels = Number(headers.get("x-audio-channels"));
  const bytesPerSample = Number(headers.get("x-audio-bytes-per-sample"));

  if (format !== "f32le" && format !== "s16le") {
    throw new Error("TTS stream is missing a supported X-Audio-Format header");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8_000 || sampleRate > 192_000) {
    throw new Error("TTS stream has an invalid X-Audio-Sample-Rate header");
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > 2) {
    throw new Error("TTS stream has an invalid X-Audio-Channels header");
  }
  if (!Number.isInteger(bytesPerSample) || bytesPerSample <= 0) {
    throw new Error("TTS stream has an invalid X-Audio-Bytes-Per-Sample header");
  }
  if ((format === "f32le" && bytesPerSample !== 4) || (format === "s16le" && bytesPerSample !== 2)) {
    throw new Error("TTS stream audio format does not match bytes per sample");
  }

  return { format, sampleRate, channels, bytesPerSample };
}
