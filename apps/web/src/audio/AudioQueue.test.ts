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
      const now = performance.now();
      return {
        kind: "blob" as const,
        blob: new Blob(),
        requestId: text,
        requestStartedAt: now,
        responseHeadersAt: now,
        firstByteAt: now,
        responseCompletedAt: now,
        cache: "MISS",
        serverTiming: null
      };
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

  it("starts playback after the first chunk and synthesizes the rest in order", async () => {
    const queue = new AudioQueue();
    let completedSynthesis = 0;
    let completedWhenPlaybackStarted = 0;
    let playbackStarted = false;
    let secondSynthesisStarted = false;
    let synthesisOverlappedPlayback = false;
    let releaseFirstPlayback: (() => void) | undefined;
    const firstPlaybackFinished = new Promise<void>((resolve) => {
      releaseFirstPlayback = resolve;
    });
    let playbackCalls = 0;
    const mockContext = { currentTime: 0.1, state: "running" };
    const mockAudioPlayer = {
      getContext: () => mockContext,
      resume: async () => {},
      stop: () => {},
      prepareForPlayback: () => {},
      decodeWav: async () => ({ duration: 1 } as any),
      trimAudioBuffer: (buffer: any) => buffer,
      playBufferDirect: async () => {
        playbackCalls += 1;
        if (completedWhenPlaybackStarted === 0) {
          completedWhenPlaybackStarted = completedSynthesis;
        }
        if (playbackCalls === 1) {
          playbackStarted = true;
          if (secondSynthesisStarted) releaseFirstPlayback?.();
          await firstPlaybackFinished;
        }
      }
    } as any;

    const synthesize = async (text: string) => {
      if (text === "two") {
        secondSynthesisStarted = true;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
      if (text === "two") {
        synthesisOverlappedPlayback = playbackStarted;
        if (playbackStarted) releaseFirstPlayback?.();
      }
      completedSynthesis += 1;
      const now = performance.now();
      return {
        kind: "blob" as const,
        blob: new Blob(),
        requestId: text,
        requestStartedAt: now,
        responseHeadersAt: now,
        firstByteAt: now,
        responseCompletedAt: now,
        cache: "MISS",
        serverTiming: null
      };
    };

    await queue.playChunks(["one", "two", "three", "four"], mockAudioPlayer, synthesize, () => {});

    expect(completedWhenPlaybackStarted).toBe(1);
    expect(synthesisOverlappedPlayback).toBe(true);
    expect(completedSynthesis).toBe(4);
  });
});
