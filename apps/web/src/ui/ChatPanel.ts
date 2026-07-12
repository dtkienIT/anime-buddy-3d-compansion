import type { CompanionState, LocalChatMessage } from "../chat/types.js";
import { sanitizeAiText } from "../utils/text.js";

type SpeechInputRecognition = EventTarget & {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: ((event: Event) => void) | null;
  onerror: ((event: SpeechInputErrorEvent) => void) | null;
  onresult: ((event: SpeechInputResultEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechInputErrorEvent = Event & {
  error: string;
};

type SpeechInputResultEvent = Event & {
  readonly resultIndex: number;
  readonly results: SpeechInputResultList;
};

type SpeechInputResultList = {
  readonly length: number;
  [index: number]: SpeechInputResult;
};

type SpeechInputResult = {
  readonly isFinal: boolean;
  [index: number]: SpeechInputAlternative | undefined;
};

type SpeechInputAlternative = {
  readonly transcript: string;
};

export interface ChatPanelHandlers {
  send: (message: string) => void;
  stopSpeaking: () => void;
  replay: () => void;
  clear: () => void;
  warn: (message: string) => void;
}

export class ChatPanel {
  private collapsed = false;
  private voiceAvailable = false;
  private hasReplay = false;
  private state: CompanionState = "BOOTING";
  private isRecording = false;
  private recognition: SpeechInputRecognition | null = null;
  private speechBaseValue = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly form: HTMLFormElement,
    private readonly input: HTMLTextAreaElement,
    private readonly recordButton: HTMLButtonElement,
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
    this.recordButton.addEventListener("click", () => this.toggleRecording(handlers.warn));
    this.root.addEventListener("scroll", () => {
      if (this.root.scrollTop !== 0) this.root.scrollTop = 0;
    }, { passive: true });
    window.addEventListener("resize", () => {
      this.root.scrollTop = 0;
    });
    this.configureSpeechRecognition(handlers.warn);
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

  private configureSpeechRecognition(warn: (message: string) => void): void {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.recordButton.disabled = true;
      this.recordButton.title = "Trình duyệt này chưa hỗ trợ ghi âm thành chữ.";
      return;
    }

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.lang = "vi-VN";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      this.applySpeechTranscript(finalTranscript, interimTranscript);
    };

    this.recognition.onerror = (event) => {
      this.setRecording(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        warn("Trình duyệt đang chặn quyền micro.");
      } else {
        warn("Không nghe rõ, thử ghi âm lại nhé.");
      }
    };

    this.recognition.onend = () => {
      this.setRecording(false);
    };
  }

  private toggleRecording(warn: (message: string) => void): void {
    if (!this.recognition) {
      warn("Trình duyệt này chưa hỗ trợ ghi âm thành chữ.");
      return;
    }

    if (this.isRecording) {
      this.recognition.stop();
      this.setRecording(false);
      return;
    }

    this.speechBaseValue = this.input.value.trimEnd();
    try {
      this.recognition.start();
      this.setRecording(true);
    } catch {
      warn("Không thể bắt đầu ghi âm lúc này.");
      this.setRecording(false);
    }
  }

  private applySpeechTranscript(finalTranscript: string, interimTranscript: string): void {
    const spokenText = `${finalTranscript}${interimTranscript}`.trim();
    if (!spokenText) {
      return;
    }

    const separator = this.speechBaseValue ? " " : "";
    this.input.value = `${this.speechBaseValue}${separator}${spokenText}`;
    this.input.dispatchEvent(new Event("input", { bubbles: true }));

    if (finalTranscript.trim()) {
      this.speechBaseValue = this.input.value.trimEnd();
    }
  }

  private setRecording(isRecording: boolean): void {
    this.isRecording = isRecording;
    this.recordButton.classList.toggle("is-recording", isRecording);
    this.recordButton.textContent = isRecording ? "Dừng" : "Mic";
    this.recordButton.setAttribute("aria-pressed", String(isRecording));
    this.recordButton.title = isRecording ? "Dừng ghi âm" : "Ghi âm lời nhắn";
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
