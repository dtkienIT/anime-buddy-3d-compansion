import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";
import { ttsRequestSchema } from "../schemas/chatSchemas.js";
import type { TtsService } from "../services/ttsService.js";
import { readableToBuffer, type ResponseCacheService } from "../services/responseCacheService.js";
import { Readable } from "node:stream";

export function registerTtsRoute(app: FastifyInstance, env: ApiEnv, tts: TtsService, cache?: ResponseCacheService): void {
  app.post("/api/tts", {
    config: {
      rateLimit: {
        max: env.TTS_RATE_LIMIT_PER_MINUTE,
        timeWindow: "1 minute"
      }
    },
    bodyLimit: 8 * 1024
  }, async (request, reply) => {
    const body = ttsRequestSchema.parse(request.body);
    const requestId = typeof request.headers["x-buddy-tts-request-id"] === "string"
      ? request.headers["x-buddy-tts-request-id"]
      : request.id;
    let result = await cache?.findAudio(body) ?? await tts.synthesize(body, requestId);
    if (cache?.isConfigured() && result.cacheStatus !== "SUPABASE_HIT") {
      const bytes = await readableToBuffer(result.audio);
      result = { ...result, audio: Readable.from(bytes), contentLength: String(bytes.byteLength) };
      void cache.saveAudio(body, result, bytes).catch((error: unknown) => {
        request.log.warn({ err: error }, "Failed to persist response audio cache");
      });
    }
    const upstreamTiming = result.upstreamServerTiming ? `, ${result.upstreamServerTiming}` : "";
    const response = reply
      .header("Content-Type", result.contentType)
      .header("X-TTS-Cache", result.cacheStatus)
      .header("Server-Timing", `api-to-tts-headers;dur=${result.upstreamHeadersMs.toFixed(2)}${upstreamTiming}`)
      .header("X-TTS-Request-Id", result.requestId ?? requestId);
    if (result.contentLength) response.header("Content-Length", result.contentLength);
    if (result.synthesisMs) response.header("X-TTS-Synthesis-Ms", result.synthesisMs);
    if (result.queueMs) response.header("X-TTS-Queue-Ms", result.queueMs);
    if (result.engineWarm) response.header("X-TTS-Engine-Warm", result.engineWarm);
    if (result.audioFormat) response.header("X-Audio-Format", result.audioFormat);
    if (result.sampleRate) response.header("X-Audio-Sample-Rate", result.sampleRate);
    if (result.channels) response.header("X-Audio-Channels", result.channels);
    if (result.bytesPerSample) response.header("X-Audio-Bytes-Per-Sample", result.bytesPerSample);
    return response.send(result.audio);
  });
}
