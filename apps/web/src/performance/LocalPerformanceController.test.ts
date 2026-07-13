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
    expect(audio.play).toHaveBeenCalledOnce();

    controller.stop(false);
    playback.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(audio.pause).toHaveBeenCalledOnce();
    expect(onStart).not.toHaveBeenCalled();
    expect(onStop).not.toHaveBeenCalled();
    expect(button.attributes.get("aria-pressed")).toBe("false");
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
