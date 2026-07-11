import type { LocalChatMessage } from "../chat/types.js";
import { sanitizeAiText } from "../utils/text.js";

export interface ChatPanelHandlers {
  send: (message: string) => void;
  stopSpeaking: () => void;
  replay: () => void;
  clear: () => void;
}

export class ChatPanel {
  private collapsed = false;

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
    this.updateSendState();
  }

  setCharacterName(name: string): void {
    this.characterName.textContent = name;
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setBusy(isBusy: boolean): void {
    this.root.classList.toggle("is-busy", isBusy);
    this.input.disabled = false;
    this.sendButton.disabled = !this.input.value.trim();
  }

  setVoiceAvailable(available: boolean): void {
    this.stopButton.disabled = !available;
    this.replayButton.disabled = !available;
  }

  addMessage(message: LocalChatMessage): void {
    const node = document.createElement("div");
    node.className = `chat-message is-${message.role}`;
    node.textContent = sanitizeAiText(message.content);
    this.log.append(node);
    this.log.scrollTop = this.log.scrollHeight;
  }

  clearMessages(): void {
    this.log.replaceChildren();
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
  }
}
