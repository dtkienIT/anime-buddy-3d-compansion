export interface LocalPerformanceOptions {
  label: string;
  button: HTMLButtonElement;
  status: HTMLElement;
  audioUrl: string;
  startSeconds: number;
  durationSeconds: number;
  onPrepare: () => Promise<void>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
  onComplete?: () => Promise<void>;
  onCleanup?: () => void;
  onAudioStart?: (analyser: AnalyserNode) => void;
  onAudioStop?: () => void;
  onWarning: (message: string) => void;
}

export class LocalPerformanceController {
  private readonly audio = document.createElement("audio");
  private active = false;
  private starting = false;
  private available = false;
  private disposed = false;
  private serial = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private audioSource: ReturnType<AudioContext["createMediaElementSource"]> | null = null;
  private analyser: AnalyserNode | null = null;
  private playbackStartedAt = 0;
  private readonly onButtonClick = (): void => {
    if (this.active || this.starting) {
      this.stop();
    } else {
      this.start();
    }
  };
  private readonly onAudioEnded = (): void => {
    const elapsedSeconds = (performance.now() - this.playbackStartedAt) / 1000;
    if (elapsedSeconds >= this.options.durationSeconds - 0.25) this.finish();
  };

  constructor(private readonly options: LocalPerformanceOptions) {
    this.audio.preload = "auto";
    options.button.disabled = true;
    options.button.addEventListener("click", this.onButtonClick);
    this.audio.addEventListener("ended", this.onAudioEnded);
  }

  async initialize(): Promise<void> {
    await this.options.onPrepare();
    if (this.disposed) return;
    this.available = await this.loadAudio();
    if (this.disposed) return;
    this.options.button.disabled = false;
    this.updateUi();
  }

  start(): boolean {
    if (this.disposed || this.active || this.starting) {
      return false;
    }
    if (!this.available) {
      this.options.onWarning(`Thiếu file nhạc: ${this.options.audioUrl}`);
      return false;
    }
    void this.play();
    return true;
  }

  stop(restoreIdle = true): void {
    const wasRunning = this.active || this.starting;
    this.serial += 1;
    if (!wasRunning) {
      return;
    }
    this.starting = false;
    this.active = false;
    this.clearStopTimer();
    this.audio.pause();
    this.options.onAudioStop?.();
    this.options.onCleanup?.();
    this.updateUi();
    if (restoreIdle) void this.restore(false, this.serial);
  }

  dispose(): void {
    if (this.disposed) return;
    this.stop(false);
    this.disposed = true;
    this.serial += 1;
    this.options.button.removeEventListener("click", this.onButtonClick);
    this.audio.removeEventListener("ended", this.onAudioEnded);
    this.audioSource?.disconnect();
    this.analyser?.disconnect();
    this.audioSource = null;
    this.analyser = null;
    const audioContext = this.audioContext;
    this.audioContext = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
    this.audio.removeAttribute("src");
    this.audio.load();
    this.available = false;
    this.options.button.disabled = true;
  }

  private async loadAudio(): Promise<boolean> {
    try {
      const response = await fetch(this.options.audioUrl, { method: "HEAD", cache: "no-store" });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || (!contentType.startsWith("audio/") && !contentType.includes("mpeg"))) {
        return false;
      }
      if (this.disposed) return false;
      this.audio.src = this.options.audioUrl;
      this.audio.load();
      await waitForMedia(this.audio);
      return !this.disposed;
    } catch {
      return false;
    }
  }

  private async play(): Promise<void> {
    const requestId = ++this.serial;
    this.starting = true;
    this.options.button.disabled = true;
    const desiredEnd = this.options.startSeconds + this.options.durationSeconds;
    const startAt = Number.isFinite(this.audio.duration) && this.audio.duration >= desiredEnd
      ? this.options.startSeconds
      : 0;
    this.audio.currentTime = startAt;

    try {
      await this.audio.play();
      if (requestId !== this.serial) {
        return;
      }
      this.playbackStartedAt = performance.now();
      this.starting = false;
      this.active = true;
      this.updateUi();
      void this.startAudioAnalysis(requestId);
      this.stopTimer = setTimeout(() => this.finish(), this.options.durationSeconds * 1000);
      await this.options.onStart();
    } catch {
      if (requestId !== this.serial) {
        return;
      }
      this.starting = false;
      this.options.onWarning("Không thể phát file nhạc trình diễn.");
      this.active = false;
      this.clearStopTimer();
      this.audio.pause();
      this.options.onAudioStop?.();
      this.options.onCleanup?.();
      this.updateUi();
      await this.options.onStop().catch(() => undefined);
    }
  }

  private finish(): void {
    if (this.active || this.starting) {
      this.serial += 1;
      this.starting = false;
      this.active = false;
      this.clearStopTimer();
      this.audio.pause();
      this.options.onAudioStop?.();
      this.options.onCleanup?.();
      this.updateUi();
      void this.restore(true, this.serial);
    }
  }

  private async restore(completed: boolean, completionSerial: number): Promise<void> {
    try {
      await this.options.onStop();
      if (completed && completionSerial === this.serial) await this.options.onComplete?.();
    } catch {
      this.options.onWarning(completed
        ? "Không thể hoàn tất lời chào sau trình diễn."
        : "Không thể khôi phục tư thế sau trình diễn.");
    }
  }

  private updateUi(): void {
    this.options.button.disabled = false;
    this.options.button.textContent = this.active
      ? "Dừng trình diễn"
      : this.available
        ? this.options.label
        : "Thiếu file nhạc";
    this.options.button.classList.toggle("is-active", this.active);
    this.options.button.setAttribute("aria-pressed", String(this.active));
    this.options.status.textContent = this.available
      ? `Nhạc local đã sẵn sàng · motion ${this.options.durationSeconds.toFixed(2)} giây`
      : `Thiếu ${this.options.audioUrl.split("/").pop()} trong public/audio/music.`;
  }

  private clearStopTimer(): void {
    if (this.stopTimer) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
  }

  private async startAudioAnalysis(requestId: number): Promise<void> {
    try {
      const analyser = await this.prepareAudioAnalysis(requestId);
      if (analyser && requestId === this.serial && this.active) {
        this.options.onAudioStart?.(analyser);
      }
    } catch {
      // Lip sync is an enhancement. The media element must keep playing when
      // AudioContext is unavailable, suspended, or blocked by autoplay policy.
    }
  }

  private async prepareAudioAnalysis(requestId: number): Promise<AnalyserNode | null> {
    if (!this.options.onAudioStart) return null;
    this.audioContext ??= new AudioContext();
    if (this.audioContext.state === "suspended") {
      await resumeWithTimeout(this.audioContext, 500);
    }
    if (
      this.disposed
      || requestId !== this.serial
      || !this.active
      || this.audioContext.state !== "running"
    ) {
      return null;
    }
    this.audioSource ??= this.audioContext.createMediaElementSource(this.audio);
    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 1024;
      this.audioSource.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    }
    return this.analyser;
  }
}

function resumeWithTimeout(audioContext: AudioContext, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    void audioContext.resume().then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      () => {
        clearTimeout(timer);
        resolve();
      }
    );
  });
}

function waitForMedia(audio: HTMLAudioElement): Promise<void> {
  if (audio.readyState >= 1) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", onReady);
      audio.removeEventListener("error", onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Could not load local performance audio."));
    };
    audio.addEventListener("loadedmetadata", onReady, { once: true });
    audio.addEventListener("error", onError, { once: true });
  });
}
