import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";
import { ttsRequestSchema } from "../schemas/chatSchemas.js";
import type { TtsService } from "../services/ttsService.js";

export function registerTtsRoute(app: FastifyInstance, env: ApiEnv, tts: TtsService): void {
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
    const result = await tts.synthesize(body);
    const response = reply
      .header("Content-Type", result.contentType)
      .header("X-TTS-Cache", result.cacheStatus)
      .header("Server-Timing", `tts-upstream-headers;dur=${result.upstreamHeadersMs.toFixed(2)}`);
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
