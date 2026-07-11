import type { CompanionState, LocalChatMessage } from "../chat/types.js";
import { sanitizeAiText } from "../utils/text.js";

export interface ChatPanelHandlers {
  send: (message: string) => void;
  stopSpeaking: () => void;
  replay: () => void;
  clear: () => void;
}

export class ChatPanel {
  private collapsed = false;
  private voiceAvailable = false;
  private hasReplay = false;
  private state: CompanionState = "BOOTING";

  constructor(
    private readonly root: HTMLElement,
    private readonly form: HTMLFormElement,
    private readonly input: HTMLTextAreaElement,
    private readonly sendButton: HTMLButtonElement,
    private readonly log: HTMLElement,
    private readonly status: HTMLElement,
    private readonly characterName: HTMLElement,
    private readonly collapseButton: HTMLButtonElement,
    private readonly stopButton: HTMLButtonElement,
    private readonly replayButton: HTMLButtonElement,
    private readonly clearButton: HTMLButtonElement,
    handlers: ChatPanelHandlers
  ) {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submit(handlers.send);
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.submit(handlers.send);
      }
    });

    this.input.addEventListener("input", () => this.updateSendState());
    this.collapseButton.addEventListener("click", () => this.toggleCollapsed());
    this.stopButton.addEventListener("click", handlers.stopSpeaking);
    this.replayButton.addEventListener("click", handlers.replay);
    this.clearButton.addEventListener("click", handlers.clear);
    this.root.addEventListener("scroll", () => {
      if (this.root.scrollTop !== 0) this.root.scrollTop = 0;
    }, { passive: true });
    window.addEventListener("resize", () => {
      this.root.scrollTop = 0;
    });
    this.updateSendState();
    this.updatePlaybackButtons();
  }

  setCharacterName(name: string): void {
    this.characterName.textContent = name;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setState(state: CompanionState, text: string): void {
    this.state = state;
    this.root.dataset.state = state;
    this.setStatus(text);
    this.setBusy(state === "THINKING" || state === "SPEAKING" || state === "REACTING");
    this.updatePlaybackButtons();
  }

  setBusy(isBusy: boolean): void {
    this.root.classList.toggle("is-busy", isBusy);
    this.input.disabled = false;
    this.sendButton.disabled = !this.input.value.trim();
  }

  setVoiceAvailable(available: boolean): void {
    this.voiceAvailable = available;
    this.updatePlaybackButtons();
  }

  addMessage(message: LocalChatMessage): void {
    const node = document.createElement("div");
    node.className = `chat-message is-${message.role}`;
    node.textContent = sanitizeAiText(message.content);
    this.log.append(node);
    if (message.role === "assistant") {
      this.hasReplay = true;
      this.updatePlaybackButtons();
    }
    this.log.scrollTop = this.log.scrollHeight;
  }

  clearMessages(): void {
    this.log.replaceChildren();
    this.hasReplay = false;
    this.updatePlaybackButtons();
  }

  private submit(send: (message: string) => void): void {
    const value = this.input.value.trim();
    if (!value) {
      return;
    }

    this.input.value = "";
    this.updateSendState();
    send(value);
  }

  private updateSendState(): void {
    this.sendButton.disabled = !this.input.value.trim() || this.input.disabled;
  }

  private toggleCollapsed(): void {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle("is-collapsed", this.collapsed);
    this.collapseButton.textContent = this.collapsed ? "Max" : "Min";
    this.collapseButton.setAttribute("aria-expanded", String(!this.collapsed));
    this.collapseButton.title = this.collapsed ? "Mở rộng trò chuyện" : "Thu gọn trò chuyện";
    this.root.scrollTop = 0;
  }

  private updatePlaybackButtons(): void {
    this.stopButton.disabled = !this.voiceAvailable || this.state !== "SPEAKING";
    this.replayButton.disabled = !this.voiceAvailable || !this.hasReplay || this.state !== "IDLE";
  }
}
