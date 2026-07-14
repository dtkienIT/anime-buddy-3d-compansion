import { describe, expect, it, vi } from "vitest";
import { InteractionVoice } from "./InteractionVoice.js";

describe("InteractionVoice", () => {
  it("speaks a companion bubble with the selected voice and lip sync", async () => {
    const harness = createHarness();

    await harness.voice.speak("Mình hiểu rồi, cứ kể tiếp nhé.", {
      enabled: true,
      voice: "Trúc Ly",
      style: "tu_nhien"
    });

    expect(harness.tts.synthesize).toHaveBeenCalledWith(
      "Mình hiểu rồi, cứ kể tiếp nhé.",
      { enabled: true, voice: "Trúc Ly", style: "tu_nhien" },
      expect.any(AbortSignal)
    );
    expect(harness.character.attachLipSyncAnalyser).toHaveBeenCalledOnce();
    expect(harness.character.startLipSync).toHaveBeenCalledOnce();
    expect(harness.character.stopLipSync).toHaveBeenCalledOnce();
  });

  it("stays silent when voice is disabled", async () => {
    const harness = createHarness();

    await harness.voice.speak("Chào bạn!", { enabled: false, voice: "Trúc Ly", style: "tu_nhien" });

    expect(harness.audioQueue.playChunks).not.toHaveBeenCalled();
    expect(harness.tts.synthesize).not.toHaveBeenCalled();
  });

  it("cancels an active interaction voice", async () => {
    const harness = createHarness(true);
    void harness.voice.speak("Chào bạn!", { enabled: true, voice: "Trúc Ly", style: "tu_nhien" });
    await vi.waitFor(() => expect(harness.audioQueue.playChunks).toHaveBeenCalledOnce());

    harness.voice.cancel();

    expect(harness.audioQueue.cancel).toHaveBeenCalledOnce();
    expect(harness.audioPlayer.stop).toHaveBeenCalledOnce();
    expect(harness.character.stopLipSync).toHaveBeenCalledOnce();
  });
});

function createHarness(keepPending = false) {
  const tts = { synthesize: vi.fn().mockResolvedValue({}) };
  const analyser = {};
  const audioPlayer = {
    getAnalyser: vi.fn().mockReturnValue(analyser),
    stop: vi.fn()
  };
  const audioQueue = {
    cancel: vi.fn(),
    playChunks: vi.fn(async (
      chunks: string[],
      _player: unknown,
      synthesize: (text: string, signal: AbortSignal) => Promise<unknown>,
      onPlaying: () => void
    ) => {
      if (keepPending) await new Promise<void>(() => undefined);
      await synthesize(chunks[0], new AbortController().signal);
      onPlaying();
    })
  };
  const character = {
    attachLipSyncAnalyser: vi.fn(),
    startLipSync: vi.fn(),
    stopLipSync: vi.fn()
  };
  const voice = new InteractionVoice(
    tts as never,
    audioQueue as never,
    audioPlayer as never,
    character as never,
    vi.fn()
  );
  return { voice, tts, audioQueue, audioPlayer, character };
}
