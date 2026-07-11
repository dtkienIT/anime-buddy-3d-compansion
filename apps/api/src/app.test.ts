import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import type { ApiEnv } from "./config/env.js";
import { parseCompanionModelPayload } from "./services/mistralService.js";

const env: ApiEnv = {
  NODE_ENV: "test",
  MISTRAL_API_KEY: "test-key",
  MISTRAL_MODEL: "test-model",
  MISTRAL_BASE_URL: "https://api.mistral.ai/v1",
  SUPABASE_URL: "",
  SUPABASE_SECRET_KEY: "",
  API_HOST: "127.0.0.1",
  API_PORT: 3002,
  WEB_ORIGIN: "http://127.0.0.1:3001",
  TTS_SERVICE_URL: "http://127.0.0.1:8000",
  CHAT_MAX_CONTEXT_MESSAGES: 20,
  CHAT_RATE_LIMIT_PER_MINUTE: 2,
  TTS_RATE_LIMIT_PER_MINUTE: 2,
  MEMORY_ENABLED: true,
  MEMORY_RECENT_MESSAGE_LIMIT: 24,
  MEMORY_TOP_K: 8,
  MEMORY_SUMMARY_TRIGGER_MESSAGES: 20,
  MEMORY_SUMMARY_MAX_CHARS: 4000,
  MEMORY_MAX_CONTEXT_TOKENS: 6000,
  MEMORY_RETENTION_DAYS: 0,
  MEMORY_RETRIEVAL_TIMEOUT_MS: 700,
  MEMORY_EMBEDDINGS_ENABLED: false,
  MISTRAL_EMBEDDING_MODEL: ""
};

describe("api", () => {
  it("returns health without calling Mistral", async () => {
    const app = await createApp(env, {
      tts: { health: async () => true, synthesize: async () => { throw new Error("unused"); } } as any
    });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", mistralConfigured: true, ttsReachable: true });
  }, 15000);

  it("rejects invalid chat messages", async () => {
    const app = await createApp(env, {
      ai: { complete: async () => { throw new Error("unused"); } }
    });
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { anonymousId: "anonymous-test", characterId: "mika", message: "", availableAnimations: [] }
    });
    expect(response.statusCode).toBe(400);
  });

  it("applies chat rate limits", async () => {
    const app = await createApp(env, {
      ai: {
        complete: async () => ({
          reply: "ok",
          emotion: "neutral",
          animation: "relax",
          expression: "neutral",
          intensity: 0.2,
          voiceStyle: "friendly"
        })
      }
    });

    const payload = {
      anonymousId: "anonymous-test",
      characterId: "mika",
      message: "hello",
      availableAnimations: ["relax"]
    };
    await app.inject({ method: "POST", url: "/api/chat", payload });
    await app.inject({ method: "POST", url: "/api/chat", payload });
    const limited = await app.inject({ method: "POST", url: "/api/chat", payload });
    expect(limited.statusCode).toBe(429);
  });

  it("forwards explicit PCM stream metadata from the TTS service", async () => {
    const app = await createApp(env, {
      tts: {
        health: async () => true,
        synthesize: async () => ({
          audio: Readable.from([Buffer.alloc(8)]),
          contentType: "application/octet-stream",
          cacheStatus: "MISS",
          audioFormat: "f32le",
          sampleRate: "48000",
          channels: "1",
          bytesPerSample: "4",
          upstreamHeadersMs: 1
        })
      } as any
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/tts",
      payload: { text: "Xin chao", stream: true }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/octet-stream");
    expect(response.headers["x-audio-format"]).toBe("f32le");
    expect(response.headers["x-audio-sample-rate"]).toBe("48000");
    expect(response.headers["x-audio-channels"]).toBe("1");
    expect(response.headers["x-audio-bytes-per-sample"]).toBe("4");
  });
});

describe("mistral response parser", () => {
  it("falls back invalid animation to registry fallback", () => {
    const parsed = parseCompanionModelPayload(JSON.stringify({
      reply: "Xin chao",
      emotion: "happy",
      animation: "../bad",
      expression: "happy",
      intensity: 0.8,
      voiceStyle: "soft"
    }), ["relax", "clapping"]);
    expect(parsed.animation).toBe("relax");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseCompanionModelPayload("{nope", ["relax"])).toThrow();
  });
});
