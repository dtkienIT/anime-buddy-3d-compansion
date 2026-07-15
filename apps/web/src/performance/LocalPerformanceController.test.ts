import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalPerformanceController } from "./LocalPerformanceController.js";

describe("LocalPerformanceController cancellation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("invalidates playback that is stopped before audio.play resolves", async () => {
    const playback = deferred<void>();
    const audio = new FakeAudio(playback.promise);
    const button = new FakeButton();
    const status = { textContent: "" };
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onStop = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(audio) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("audio/mpeg") }
    }));

    const controller = new LocalPerformanceController({
      label: "Play",
      button: button as unknown as HTMLButtonElement,
      status: status as unknown as HTMLElement,
      audioUrl: "/audio/performance.mp3",
      startSeconds: 0,
      durationSeconds: 10,
      onPrepare: vi.fn().mockResolvedValue(undefined),
      onStart,
      onStop,
      onWarning: vi.fn()
    });

    await controller.initialize();
    controller.start();
    await vi.waitFor(() => expect(audio.play).toHaveBeenCalledOnce());

    controller.stop(false);
    playback.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(button.attributes.get("aria-pressed")).toBe("false");
  });

  it("keeps a looping performance active after onStart resolves", async () => {
    const audio = new FakeAudio(Promise.resolve());
    const button = new FakeButton();
    const onStart = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(audio) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("audio/mpeg") }
    }));

    const controller = new LocalPerformanceController({
      label: "Song",
      button: button as unknown as HTMLButtonElement,
      status: { textContent: "" } as unknown as HTMLElement,
      audioUrl: "/audio/song.mp3",
      startSeconds: 0,
      durationSeconds: 180,
      onPrepare: vi.fn().mockResolvedValue(undefined),
      onStart,
      onStop: vi.fn().mockResolvedValue(undefined),
      onWarning: vi.fn()
    });

    await controller.initialize();
    expect(controller.start()).toBe(true);
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce());

    expect(button.attributes.get("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("Dừng trình diễn");
    controller.stop(false);
  });

  it("does not let a suspended AudioContext block media playback", async () => {
    const resume = deferred<void>();
    const audio = new FakeAudio(Promise.resolve());
    const button = new FakeButton();
    const onStart = vi.fn().mockResolvedValue(undefined);
    const onAudioStart = vi.fn();
    const audioContext = {
      state: "suspended",
      resume: vi.fn(() => resume.promise),
      close: vi.fn().mockResolvedValue(undefined),
      createMediaElementSource: vi.fn(),
      createAnalyser: vi.fn()
    };

    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(audio) });
    vi.stubGlobal("AudioContext", vi.fn(() => audioContext));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("audio/mpeg") }
    }));

    const controller = new LocalPerformanceController({
      label: "Song",
      button: button as unknown as HTMLButtonElement,
      status: { textContent: "" } as unknown as HTMLElement,
      audioUrl: "/audio/song.mp3",
      startSeconds: 0,
      durationSeconds: 180,
      onPrepare: vi.fn().mockResolvedValue(undefined),
      onStart,
      onStop: vi.fn().mockResolvedValue(undefined),
      onAudioStart,
      onWarning: vi.fn()
    });

    await controller.initialize();
    controller.start();
    await vi.waitFor(() => expect(onStart).toHaveBeenCalledOnce());

    expect(audio.play).toHaveBeenCalledOnce();
    expect(audioContext.resume).toHaveBeenCalledOnce();
    expect(onAudioStart).not.toHaveBeenCalled();
    resume.resolve();
    await Promise.resolve();
    controller.dispose();
    expect(audioContext.close).toHaveBeenCalledOnce();
  });

  it("announces completion exactly once after a natural ending", async () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const audio = new FakeAudio(Promise.resolve());
    const button = new FakeButton();
    const onStop = vi.fn().mockResolvedValue(undefined);
    const onComplete = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(audio) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("audio/mpeg") }
    }));

    const controller = new LocalPerformanceController({
      label: "Dance",
      button: button as unknown as HTMLButtonElement,
      status: { textContent: "" } as unknown as HTMLElement,
      audioUrl: "/audio/dance.mp3",
      startSeconds: 0,
      durationSeconds: 10,
      onPrepare: vi.fn().mockResolvedValue(undefined),
      onStart: vi.fn().mockResolvedValue(undefined),
      onStop,
      onComplete,
      onWarning: vi.fn()
    });

    await controller.initialize();
    controller.start();
    await vi.waitFor(() => expect(button.attributes.get("aria-pressed")).toBe("true"));
    now = 10_000;
    audio.dispatchEvent(new Event("ended"));
    audio.dispatchEvent(new Event("ended"));
    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledOnce());

    expect(onStop).toHaveBeenCalledOnce();
    expect(button.attributes.get("aria-pressed")).toBe("false");
  });

  it("does not announce completion when the user stops the performance", async () => {
    const audio = new FakeAudio(Promise.resolve());
    const button = new FakeButton();
    const onComplete = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("document", { createElement: vi.fn().mockReturnValue(audio) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: vi.fn().mockReturnValue("audio/mpeg") }
    }));

    const controller = new LocalPerformanceController({
      label: "Song",
      button: button as unknown as HTMLButtonElement,
      status: { textContent: "" } as unknown as HTMLElement,
      audioUrl: "/audio/song.mp3",
      startSeconds: 0,
      durationSeconds: 180,
      onPrepare: vi.fn().mockResolvedValue(undefined),
      onStart: vi.fn().mockResolvedValue(undefined),
      onStop: vi.fn().mockResolvedValue(undefined),
      onComplete,
      onWarning: vi.fn()
    });

    await controller.initialize();
    controller.start();
    await vi.waitFor(() => expect(button.attributes.get("aria-pressed")).toBe("true"));
    controller.stop();
    await Promise.resolve();

    expect(onComplete).not.toHaveBeenCalled();
  });
});

class FakeButton extends EventTarget {
  disabled = false;
  textContent = "";
  readonly attributes = new Map<string, string>();
  readonly classList = new FakeClassList();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

class FakeAudio extends EventTarget {
  preload = "";
  src = "";
  currentTime = 0;
  duration = 30;
  readyState = 1;
  readonly load = vi.fn();
  readonly pause = vi.fn();
  readonly play: ReturnType<typeof vi.fn>;

  constructor(playback: Promise<void>) {
    super();
    this.play = vi.fn(() => playback);
  }

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

class FakeClassList {
  private readonly values = new Set<string>();

  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
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
