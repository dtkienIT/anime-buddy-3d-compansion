export class SpeechBubble {
  private timer = 0;

  constructor(private readonly root: HTMLElement) {}

  show(text: string, timeoutMs: number): void {
    window.clearTimeout(this.timer);
    this.root.textContent = text;
    this.root.classList.add("is-visible");

    if (timeoutMs > 0) {
      this.timer = window.setTimeout(() => this.hide(), timeoutMs);
    }
  }

  hide(): void {
    this.root.classList.remove("is-visible");
  }
}
