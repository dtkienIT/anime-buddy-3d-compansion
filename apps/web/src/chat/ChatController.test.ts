import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient, ConversationMessage, SessionSummary } from "../services/apiClient.js";
import type { AudioPlayer } from "../audio/AudioPlayer.js";
import type { AudioQueue } from "../audio/AudioQueue.js";
import type { TtsClient } from "../audio/TtsClient.js";
import type { CharacterController } from "../character/CharacterController.js";
import type { ChatControllerEvents } from "./types.js";
import { ChatController } from "./ChatController.js";

const activeSession: SessionSummary = {
  id: "session-active",
  title: "Active",
  created_at: "2026-07-13T00:00:00.000Z"
};

describe("ChatController context consistency", () => {
  beforeEach(() => {
    const values = new Map<string, string>([
      ["animeBuddy.anonymousId", "anonymous-1"],
      ["animeBuddy.sessionId", activeSession.id]
    ]);
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
      clear: vi.fn(() => values.clear())
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renames the selected session instead of implicitly renaming the active one", async () => {
    const harness = createHarness();

    await harness.controller.renameSession("session-other", "Other title");

    expect(harness.api.renameSession).toHaveBeenCalledWith(
      "session-other",
      "anonymous-1",
      "Other title"
    );
  });

  it("hydrates replay from the latest assistant reply and resets it for a new chat", async () => {
    const messages: ConversationMessage[] = [
      { id: "user-1", role: "user", content: "Question" },
      { id: "assistant-1", role: "assistant", content: "Older answer" },
      { id: "assistant-2", role: "assistant", content: "Latest answer" }
    ];
    const harness = createHarness({
      voiceEnabled: true,
      api: {
        loadConversation: vi.fn().mockResolvedValue(messages),
        createSession: vi.fn().mockResolvedValue({ ...activeSession, id: "session-new" })
      }
    });
    harness.controller.setReady();
    await harness.controller.initializeHistory();

    harness.controller.replayLastReply();
    await vi.waitFor(() => expect(harness.tts.synthesize).toHaveBeenCalled());
    expect(harness.tts.synthesize).toHaveBeenCalledWith(
      "Latest answer",
      expect.any(Object),
      expect.any(AbortSignal),
      expect.any(Number)
    );

    const replayCalls = harness.tts.synthesize.mock.calls.length;
    await harness.controller.createNewSession();
    harness.controller.replayLastReply();
    await Promise.resolve();
    expect(harness.tts.synthesize).toHaveBeenCalledTimes(replayCalls);
  });

  it("keeps a newly-created chat usable when the session-list refresh fails", async () => {
    const harness = createHarness({
      api: {
        createSession: vi.fn().mockResolvedValue({ ...activeSession, id: "session-new" }),
        getSessions: vi.fn().mockRejectedValue(new Error("offline"))
      }
    });
    harness.controller.setReady();

    await expect(harness.controller.createNewSession()).resolves.toBe(true);

    expect(harness.events.onHistoryLoaded).toHaveBeenCalledWith([], "session-new");
    expect(harness.events.onWarning).toHaveBeenCalledWith(
      "Đã tạo hội thoại mới nhưng chưa thể làm mới danh sách."
    );
    expect(harness.controller.states.state).toBe("IDLE");
  });

  it("ignores an old chat response after switching conversations", async () => {
    const pendingReply = deferred<ReturnType<typeof companionReply>>();
    const harness = createHarness({
      api: {
        sendChat: vi.fn(() => pendingReply.promise),
        loadConversation: vi.fn().mockResolvedValue([
          { id: "new-answer", role: "assistant", content: "New session answer" }
        ])
      }
    });
    harness.controller.setReady();

    const oldSend = harness.controller.send("Old question");
    await vi.waitFor(() => expect(harness.api.sendChat).toHaveBeenCalled());
    await harness.controller.loadSession("session-new");
    pendingReply.resolve(companionReply("Old answer", "angry"));
    await oldSend;

    expect(harness.events.onAssistantMessage).not.toHaveBeenCalled();
    expect(harness.events.onHistoryLoaded).toHaveBeenCalledWith(
      [expect.objectContaining({ content: "New session answer" })],
      "session-new"
    );
  });

  it("cancels the active operation before clearing and suppresses its late reply", async () => {
    const pendingReply = deferred<ReturnType<typeof companionReply>>();
    const harness = createHarness({
      api: { sendChat: vi.fn(() => pendingReply.promise) }
    });
    harness.controller.setReady();

    const oldSend = harness.controller.send("Will be cleared");
    await vi.waitFor(() => expect(harness.api.sendChat).toHaveBeenCalled());
    await harness.controller.clear();
    pendingReply.resolve(companionReply("Too late", "happy"));
    await oldSend;

    expect(harness.api.clearConversation).toHaveBeenCalledWith("session-active", "anonymous-1");
    expect(harness.audioQueue.cancel).toHaveBeenCalled();
    expect(harness.audioPlayer.stop).toHaveBeenCalled();
    expect(harness.events.onAssistantMessage).not.toHaveBeenCalled();
  });

  it("maps listening state to its dedicated animation", async () => {
    const harness = createHarness();
    harness.controller.setReady();

    await harness.controller.setListening(true);
    expect(harness.controller.states.state).toBe("LISTENING");
    expect(harness.character.playAnimation).toHaveBeenCalledWith("listening", { loop: true });

    await harness.controller.setListening(false);
    expect(harness.controller.states.state).toBe("IDLE");
    expect(harness.character.playAnimation).toHaveBeenCalledWith("relax", { loop: true });
  });

  it("uses talking while speaking and reserves the semantic animation for reaction", async () => {
    const harness = createHarness({
      voiceEnabled: true,
      api: { sendChat: vi.fn().mockResolvedValue(companionReply("Hello there", "angry")) }
    });
    harness.controller.setReady();

    await harness.controller.send("Hello");

    expect(harness.character.playAnimation).toHaveBeenCalledWith("talking", { loop: true });
    expect(harness.character.playAnimation).toHaveBeenCalledWith("angry", {
      loop: false,
      maxDurationMs: 7000
    });
    expect(harness.character.playAnimation).not.toHaveBeenCalledWith("angry", { loop: true });
  });
});

function createHarness(options: {
  voiceEnabled?: boolean;
  api?: Record<string, unknown>;
} = {}) {
  const api = {
    getSessions: vi.fn().mockResolvedValue([activeSession]),
    loadConversation: vi.fn().mockResolvedValue([]),
    createSession: vi.fn().mockResolvedValue(activeSession),
    renameSession: vi.fn().mockResolvedValue(undefined),
    deleteSession: vi.fn().mockResolvedValue(undefined),
    clearConversation: vi.fn().mockResolvedValue(undefined),
    sendChat: vi.fn().mockResolvedValue(companionReply("Answer", "happy")),
    ...options.api
  } as unknown as ApiClient & Record<string, ReturnType<typeof vi.fn>>;

  const tts = {
    synthesize: vi.fn().mockResolvedValue({ kind: "blob", blob: new Blob() })
  } as unknown as TtsClient & { synthesize: ReturnType<typeof vi.fn> };

  const audioQueue = {
    cancel: vi.fn(),
    playChunks: vi.fn(async (
      chunks: string[],
      _player: AudioPlayer,
      synthesize: (text: string, signal: AbortSignal) => Promise<unknown>,
      onPlaybackStart: () => void
    ) => {
      if (chunks[0]) await synthesize(chunks[0], new AbortController().signal);
      onPlaybackStart();
    })
  } as unknown as AudioQueue & {
    cancel: ReturnType<typeof vi.fn>;
    playChunks: ReturnType<typeof vi.fn>;
  };

  const audioPlayer = {
    resume: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    getAnalyser: vi.fn().mockReturnValue(null)
  } as unknown as AudioPlayer & {
    stop: ReturnType<typeof vi.fn>;
  };

  const character = {
    getCurrentCharacterId: vi.fn().mockReturnValue("mika"),
    playAnimation: vi.fn().mockResolvedValue(undefined),
    setExpression: vi.fn(),
    setRenderRate: vi.fn(),
    attachLipSyncAnalyser: vi.fn(),
    startLipSync: vi.fn(),
    stopLipSync: vi.fn()
  } as unknown as CharacterController & {
    playAnimation: ReturnType<typeof vi.fn>;
  };

  const events = {
    onUserMessage: vi.fn(),
    onAssistantMessage: vi.fn(),
    onStatus: vi.fn(),
    onWarning: vi.fn(),
    onSessionsLoaded: vi.fn(),
    onHistoryLoaded: vi.fn()
  } satisfies ChatControllerEvents;

  const controller = new ChatController(
    api,
    tts,
    audioQueue,
    audioPlayer,
    character,
    events,
    { enabled: options.voiceEnabled ?? false, voice: "Trúc Ly", style: "tu_nhien" }
  );

  return { controller, api, tts, audioQueue, audioPlayer, character, events };
}

function companionReply(reply: string, animation: string) {
  return {
    sessionId: "00000000-0000-4000-8000-000000000001",
    reply,
    emotion: "happy" as const,
    animation,
    expression: "happy" as const,
    intensity: 0.7,
    voiceStyle: "friendly" as const,
    warnings: []
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
