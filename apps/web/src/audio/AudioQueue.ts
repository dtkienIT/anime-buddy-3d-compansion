export class AudioQueue {
  private activeAbort: AbortController | null = null;
  private activeTask: Promise<void> | null = null;

  get isBusy(): boolean {
    return Boolean(this.activeTask);
  }

  async run(factory: (signal: AbortSignal) => Promise<void>, replace = true): Promise<void> {
    if (replace) {
      this.cancel();
    }

    const abort = new AbortController();
    this.activeAbort = abort;
    const task = factory(abort.signal);
    this.activeTask = task;

    try {
      await task;
    } finally {
      if (this.activeTask === task) {
        this.activeTask = null;
        this.activeAbort = null;
      }
    }
  }

  cancel(): void {
    this.activeAbort?.abort();
    this.activeAbort = null;
  }
}
