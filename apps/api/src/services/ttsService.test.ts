import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../config/env.js";
import { TtsService } from "./ttsService.js";

const env = {
  TTS_SERVICE_URL: "http://127.0.0.1:8000",
  TTS_SERVICE_TOKEN: "secret-token",
  TTS_REQUEST_TIMEOUT_MS: 120000
} as ApiEnv;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TtsService authentication", () => {
  it("forwards the configured bearer token to health requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(new TtsService(env).health()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/health",
      expect.objectContaining({
        headers: { Authorization: "Bearer secret-token" }
      })
    );
  });

  it("forwards the configured bearer token to synthesis requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/wav" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await new TtsService(env).synthesize({ text: "Xin chào", stream: true });
    expect(result.contentType).toContain("audio/wav");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/synthesize",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer secret-token" })
      })
    );
  });
});
