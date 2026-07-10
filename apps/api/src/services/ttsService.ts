import { Readable } from "node:stream";
import type { ApiEnv } from "../config/env.js";
import type { TtsRequestBody } from "../schemas/chatSchemas.js";

export interface TtsProxyResult {
  audio: Readable;
  contentType: string;
  cacheStatus: string;
  contentLength?: string;
  synthesisMs?: string;
  queueMs?: string;
  engineWarm?: string;
  audioFormat?: string;
  sampleRate?: string;
  channels?: string;
  bytesPerSample?: string;
  upstreamHeadersMs: number;
}

export class TtsService {
  constructor(private readonly env: ApiEnv) {}

  async health(): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1200);
    try {
      const response = await fetch(`${this.env.TTS_SERVICE_URL}/health`, { signal: controller.signal });
      return response.ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  async synthesize(body: TtsRequestBody): Promise<TtsProxyResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    const startedAt = performance.now();
    try {
      const response = await fetch(`${this.env.TTS_SERVICE_URL}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(detail || `TTS service failed with ${response.status}`);
      }

      if (!response.body) {
        throw new Error("TTS service returned an empty body");
      }

      return {
        audio: Readable.fromWeb(response.body as any),
        contentType: response.headers.get("content-type") ?? "audio/wav",
        cacheStatus: response.headers.get("x-tts-cache") ?? "MISS",
        contentLength: response.headers.get("content-length") ?? undefined,
        synthesisMs: response.headers.get("x-tts-synthesis-ms") ?? undefined,
        queueMs: response.headers.get("x-tts-queue-ms") ?? undefined,
        engineWarm: response.headers.get("x-tts-engine-warm") ?? undefined,
        audioFormat: response.headers.get("x-audio-format") ?? undefined,
        sampleRate: response.headers.get("x-audio-sample-rate") ?? undefined,
        channels: response.headers.get("x-audio-channels") ?? undefined,
        bytesPerSample: response.headers.get("x-audio-bytes-per-sample") ?? undefined,
        upstreamHeadersMs: performance.now() - startedAt
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
