import type { VoiceSettings } from "../audio/VoiceSettings.js";

export class VoiceControls extends EventTarget {
  constructor(
    private readonly toggleButton: HTMLButtonElement,
    private settings: VoiceSettings
  ) {
    super();
    this.render();
    this.toggleButton.addEventListener("click", () => {
      this.settings = { ...this.settings, enabled: !this.settings.enabled };
      this.render();
      this.dispatchEvent(new CustomEvent("change", { detail: this.settings }));
    });
  }

  get value(): VoiceSettings {
    return this.settings;
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
    this.render();
  }

  private render(): void {
    this.toggleButton.textContent = this.settings.enabled ? "On" : "Off";
    this.toggleButton.classList.toggle("is-active", this.settings.enabled);
    this.toggleButton.setAttribute("aria-pressed", String(this.settings.enabled));
    this.toggleButton.title = this.settings.enabled ? "Tắt giọng nói" : "Bật giọng nói";
  }
}
