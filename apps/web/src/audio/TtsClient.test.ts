import { afterEach, describe, expect, it, vi } from "vitest";
import { TtsClient } from "./TtsClient.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("TtsClient", () => {
  it("returns a validated PCM stream when audio metadata is explicit", async () => {
    globalThis.fetch = vi.fn(async () => new Response(streamOf(new Uint8Array(8)), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "x-audio-format": "f32le",
        "x-audio-sample-rate": "48000",
        "x-audio-channels": "1",
        "x-audio-bytes-per-sample": "4"
      }
    })) as typeof fetch;

    const audio = await new TtsClient("http://api.test").synthesize("Xin chao", {
      enabled: true,
      voice: "Truc Ly",
      style: "tu_nhien"
    });

    expect(audio).toMatchObject({
      kind: "pcm-stream",
      format: "f32le",
      sampleRate: 48000,
      channels: 1,
      bytesPerSample: 4
    });
  });

  it("rejects raw PCM streams without format metadata", async () => {
    globalThis.fetch = vi.fn(async () => new Response(streamOf(new Uint8Array(8)), {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "x-audio-sample-rate": "48000",
        "x-audio-channels": "1",
        "x-audio-bytes-per-sample": "4"
      }
    })) as typeof fetch;

    await expect(new TtsClient("http://api.test").synthesize("Xin chao", {
      enabled: true,
      voice: "Truc Ly",
      style: "tu_nhien"
    })).rejects.toThrow(/X-Audio-Format/);
  });
});

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}
