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
  | ({ kind: "blob"; blob: Blob } & TtsTransportTiming)
  | ({ kind: "pcm-stream"; stream: ReadableStream<Uint8Array> } & PcmAudioMetadata & TtsTransportTiming);

export interface TtsTransportTiming {
  requestId: string;
  requestStartedAt: number;
  responseHeadersAt: number;
  firstByteAt: number;
  responseCompletedAt: number;
  cache: string | null;
  serverTiming: string | null;
}

export class TtsClient {
  constructor(
    private readonly baseUrl = env.apiBaseUrl,
    private readonly timeoutMs = 30_000
  ) {}

  async synthesize(text: string, settings: VoiceSettings, signal?: AbortSignal, runId = 0): Promise<TtsAudio> {
    const requestId = crypto.randomUUID();
    const requestStartedAt = performance.now();
    perfMetrics.mark(runId, "ttsRequestStartedAt", requestStartedAt);
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
    const response = await fetch(`${this.baseUrl}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Buddy-TTS-Request-Id": requestId },
      body: JSON.stringify({
        text,
        voice: settings.voice,
        style: settings.style,
        stream: true
      }),
      signal: requestSignal
    });
    const responseHeadersAt = performance.now();
    perfMetrics.mark(runId, "ttsResponseHeadersAt", responseHeadersAt);
    perfMetrics.addTtsMetadata(runId, {
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

    const { bytes, firstByteAt, completedAt } = await readResponseBytes(response, requestSignal);
    perfMetrics.mark(runId, "ttsFirstByteAt", firstByteAt);
    perfMetrics.mark(runId, "ttsResponseCompletedAt", completedAt);
    const timing: TtsTransportTiming = {
      requestId,
      requestStartedAt,
      responseHeadersAt,
      firstByteAt,
      responseCompletedAt: completedAt,
      cache: response.headers.get("x-tts-cache"),
      serverTiming: response.headers.get("server-timing")
    };

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.startsWith("application/octet-stream")) {
      return { kind: "pcm-stream", stream: streamOf(bytes), ...parsePcmMetadata(response.headers), ...timing };
    }
    const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return { kind: "blob", blob: new Blob([blobBytes], { type: contentType || "audio/wav" }), ...timing };
  }
}

async function readResponseBytes(response: Response, signal?: AbortSignal): Promise<{
  bytes: Uint8Array;
  firstByteAt: number;
  completedAt: number;
}> {
  if (!response.body) throw new Error("TTS response body is empty");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let firstByteAt: number | undefined;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const { done, value } = await reader.read();
    if (done) break;
    if (value.byteLength && firstByteAt === undefined) firstByteAt = performance.now();
    chunks.push(value);
    total += value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const completedAt = performance.now();
  return { bytes, firstByteAt: firstByteAt ?? completedAt, completedAt };
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
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
