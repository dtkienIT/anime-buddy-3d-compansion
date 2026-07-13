import type { VoiceSettings } from "../audio/VoiceSettings.js";
import { safeGetLocalStorage, safeSetLocalStorage } from "../services/storageService.js";

const voiceEnabledKey = "animeBuddy.voiceEnabled";

export class VoiceControls extends EventTarget {
  constructor(
    private readonly toggleButton: HTMLButtonElement,
    private settings: VoiceSettings
  ) {
    super();
    const stored = safeGetLocalStorage(voiceEnabledKey);
    if (stored === "true" || stored === "false") {
      this.settings = { ...this.settings, enabled: stored === "true" };
    }
    this.render();
    this.toggleButton.addEventListener("click", () => {
      this.settings = { ...this.settings, enabled: !this.settings.enabled };
      safeSetLocalStorage(voiceEnabledKey, String(this.settings.enabled));
      this.render();
      this.dispatchEvent(new CustomEvent("change", { detail: this.settings }));
    });
  }

  get value(): VoiceSettings {
    return this.settings;
  }

  setEnabled(enabled: boolean): void {
    this.settings = { ...this.settings, enabled };
    safeSetLocalStorage(voiceEnabledKey, String(enabled));
    this.render();
  }

  private render(): void {
    let icon = this.toggleButton.querySelector<HTMLElement>("span:first-child");
    let label = this.toggleButton.querySelector<HTMLElement>(".button-label");
    if (!icon || !label) {
      this.toggleButton.replaceChildren();
      icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      label = document.createElement("span");
      label.className = "button-label";
      this.toggleButton.append(icon, label);
    }
    icon.textContent = this.settings.enabled ? "◖" : "◯";
    label.textContent = this.settings.enabled ? "Giọng" : "Tắt";
    this.toggleButton.classList.toggle("is-active", this.settings.enabled);
    this.toggleButton.setAttribute("aria-pressed", String(this.settings.enabled));
    this.toggleButton.setAttribute("aria-label", this.settings.enabled ? "Tắt giọng nói" : "Bật giọng nói");
    this.toggleButton.title = this.settings.enabled ? "Tắt giọng nói" : "Bật giọng nói";
  }
}
