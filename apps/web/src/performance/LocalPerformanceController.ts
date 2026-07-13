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
  onWarning: (message: string) => void;
}

export class LocalPerformanceController {
  private readonly audio = document.createElement("audio");
  private active = false;
  private starting = false;
  private available = false;
  private serial = 0;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: LocalPerformanceOptions) {
    this.audio.preload = "auto";
    options.button.disabled = true;
    options.button.addEventListener("click", () => {
      if (this.active || this.starting) {
        this.stop();
      } else {
        this.start();
      }
    });
    this.audio.addEventListener("ended", () => this.finish());
  }

  async initialize(): Promise<void> {
    await this.options.onPrepare();
    this.available = await this.loadAudio();
    this.options.button.disabled = false;
    this.updateUi();
  }

  start(): void {
    if (this.active || this.starting) {
      return;
    }
    if (!this.available) {
      this.options.onWarning(`Thiếu file nhạc: ${this.options.audioUrl}`);
      return;
    }
    void this.play();
  }

  stop(restoreIdle = true): void {
    const wasRunning = this.active || this.starting;
    if (!wasRunning) {
      return;
    }
    this.serial += 1;
    this.starting = false;
    this.active = false;
    this.clearStopTimer();
    this.audio.pause();
    this.updateUi();
    if (restoreIdle) {
      void this.options.onStop().catch(() => this.options.onWarning("Không thể khôi phục tư thế sau trình diễn."));
    }
  }

  private async loadAudio(): Promise<boolean> {
    try {
      const response = await fetch(this.options.audioUrl, { method: "HEAD", cache: "no-store" });
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || (!contentType.startsWith("audio/") && !contentType.includes("mpeg"))) {
        return false;
      }
      this.audio.src = this.options.audioUrl;
      this.audio.load();
      await waitForMedia(this.audio);
      return true;
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
      this.starting = false;
      this.active = true;
      this.updateUi();
      this.stopTimer = setTimeout(() => this.finish(), this.options.durationSeconds * 1000);
      await this.options.onStart();
      if (requestId === this.serial) {
        this.finish();
      }
    } catch {
      if (requestId !== this.serial) {
        return;
      }
      this.starting = false;
      this.options.onWarning("Không thể phát file nhạc trình diễn.");
      this.active = false;
      this.clearStopTimer();
      this.audio.pause();
      this.updateUi();
      await this.options.onStop().catch(() => undefined);
    }
  }

  private finish(): void {
    if (this.active || this.starting) {
      this.stop(true);
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
