import { describe, expect, it } from "vitest";
import { AudioQueue } from "./AudioQueue.js";

describe("AudioQueue", () => {
  it("cancels the previous task when replaced", async () => {
    const queue = new AudioQueue();
    let aborted = false;
    let prepared = 0;

    const mockContext = {
      currentTime: 0.1,
      state: "running"
    };
    const mockAudioPlayer = {
      getContext: () => mockContext,
      resume: async () => {},
      stop: () => {},
      prepareForPlayback: () => {
        prepared += 1;
      },
      decodeWav: async () => ({ duration: 0.1 } as any),
      trimAudioBuffer: (buf: any) => buf,
      playBufferDirect: async () => {}
    } as any;

    const synthesize = async (text: string, signal: AbortSignal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { kind: "blob" as const, blob: new Blob() };
    };

    const first = queue.playChunks(["chunk1"], mockAudioPlayer, synthesize, () => {});
    await queue.playChunks([], mockAudioPlayer, synthesize, () => {});

    try {
      await first;
    } catch {
      // ignore abort error
    }

    expect(aborted).toBe(true);
    expect(prepared).toBe(2);
  });
});
