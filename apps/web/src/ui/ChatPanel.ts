import type { CompanionState, LocalChatMessage } from "../chat/types.js";
import { sanitizeAiText } from "../utils/text.js";
import { safeGetLocalStorage, safeSetLocalStorage } from "../services/storageService.js";

const draftKeyPrefix = "animeBuddy.chatDraft";

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

type SpeechInputErrorEvent = Event & { error: string };
type SpeechInputResultEvent = Event & { readonly resultIndex: number; readonly results: SpeechInputResultList };
type SpeechInputResultList = { readonly length: number; [index: number]: SpeechInputResult };
type SpeechInputResult = { readonly isFinal: boolean; [index: number]: SpeechInputAlternative | undefined };
type SpeechInputAlternative = { readonly transcript: string };

export interface ChatPanelHandlers {
  send: (message: string) => void;
  stopSpeaking: () => void;
  replay: () => void;
  clear: () => void | Promise<void>;
  warn: (message: string) => void;
  listeningChange?: (active: boolean) => void;
  collapsedChange?: (collapsed: boolean) => void;
}

export class ChatPanel {
  private collapsed = false;
  private voiceAvailable = false;
  private hasReplay = false;
  private state: CompanionState = "BOOTING";
  private isRecording = false;
  private recognition: SpeechInputRecognition | null = null;
  private speechBaseValue = "";
  private readonly emptyState: HTMLElement | null;
  private readonly content: HTMLElement | null;
  private readonly messageCount: HTMLElement | null;
  private readonly typingIndicator: HTMLElement;
  private readonly handlers: ChatPanelHandlers;
  private draftKey = `${draftKeyPrefix}.default`;

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
    this.handlers = handlers;
    this.emptyState = this.root.querySelector("#chat-empty-state");
    this.content = this.root.querySelector("#chat-content");
    this.messageCount = this.root.querySelector("#message-count");
    this.typingIndicator = this.createTypingIndicator();

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.submit();
    });

    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.submit();
      }
    });

    this.input.addEventListener("input", () => {
      this.updateComposer();
      safeSetLocalStorage(this.draftKey, this.input.value);
    });
    this.input.value = safeGetLocalStorage(this.draftKey) ?? "";

    this.collapseButton.addEventListener("click", () => this.toggleCollapsed());
    this.stopButton.addEventListener("click", () => this.cancelCurrentActivity());
    this.replayButton.addEventListener("click", handlers.replay);
    this.clearButton.addEventListener("click", () => void handlers.clear());
    this.recordButton.addEventListener("click", () => this.toggleRecording());

    this.root.querySelectorAll<HTMLButtonElement>("[data-prompt]").forEach((button) => {
      button.addEventListener("click", () => {
        const prompt = button.dataset.prompt?.trim();
        if (prompt) this.submitPrompt(prompt);
      });
    });

    this.root.addEventListener("scroll", () => {
      if (this.root.scrollTop !== 0) this.root.scrollTop = 0;
    }, { passive: true });
    window.addEventListener("resize", () => {
      this.root.scrollTop = 0;
      this.resizeInput();
    });

    this.configureSpeechRecognition();
    this.updateComposer();
    this.updatePlaybackButtons();
    this.updateEmptyState();
  }

  setCharacterName(name: string): void {
    this.characterName.textContent = name;
    const avatar = this.root.querySelector<HTMLElement>("#chat-avatar");
    if (avatar) avatar.textContent = name.trim().charAt(0).toUpperCase() || "M";
    const typingAvatar = this.typingIndicator.querySelector<HTMLElement>(".message-avatar");
    if (typingAvatar) typingAvatar.textContent = name.trim().charAt(0).toUpperCase() || "M";
    this.typingIndicator.setAttribute("aria-label", `${name} đang soạn câu trả lời`);
  }

  setStatus(text: string): void {
    this.status.textContent = text;
  }

  setState(state: CompanionState, text: string): void {
    this.state = state;
    this.root.dataset.state = state;
    this.setStatus(text);
    this.setBusy(state === "THINKING" || state === "SPEAKING" || state === "REACTING");
    this.setTyping(state === "THINKING");
    this.updatePlaybackButtons();
  }

  setBusy(isBusy: boolean): void {
    this.root.classList.toggle("is-busy", isBusy);
    this.root.setAttribute("aria-busy", String(isBusy));
    this.input.disabled = false;
    const label = this.sendButton.querySelector("span");
    if (label) label.textContent = isBusy ? "Gửi mới" : "Gửi";
    this.updateSendState();
  }

  setVoiceAvailable(available: boolean): void {
    this.voiceAvailable = available;
    this.updatePlaybackButtons();
  }

  setReplayAvailable(available: boolean): void {
    this.hasReplay = available;
    this.updatePlaybackButtons();
  }

  setDraftScope(sessionId: string): void {
    const normalized = sessionId.trim() || "default";
    const nextKey = `${draftKeyPrefix}.${normalized}`;
    if (nextKey === this.draftKey) return;
    safeSetLocalStorage(this.draftKey, this.input.value);
    this.draftKey = nextKey;
    this.input.value = safeGetLocalStorage(this.draftKey) ?? "";
    this.updateComposer();
  }

  addMessage(message: LocalChatMessage): void {
    const row = document.createElement("article");
    row.className = `message-row is-${message.role}`;
    row.dataset.messageId = message.id;

    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = message.role === "assistant"
      ? this.characterName.textContent?.trim().charAt(0).toUpperCase() || "M"
      : message.role === "user" ? "B" : "!";

    const body = document.createElement("div");
    body.className = "message-body";

    const meta = document.createElement("span");
    meta.className = "message-meta";
    meta.textContent = message.role === "assistant"
      ? this.characterName.textContent || "Companion"
      : message.role === "user" ? "Bạn" : "Hệ thống";

    const bubble = document.createElement("div");
    bubble.className = `chat-message is-${message.role}`;
    bubble.textContent = sanitizeAiText(message.content);

    body.append(meta, bubble);

    if (message.role !== "system") {
      const actions = document.createElement("div");
      actions.className = "message-actions";
      const copy = document.createElement("button");
      copy.className = "message-action";
      copy.type = "button";
      copy.textContent = "Sao chép";
      copy.setAttribute("aria-label", `Sao chép tin nhắn của ${meta.textContent}`);
      copy.addEventListener("click", () => void this.copyMessage(message.content, copy));
      actions.append(copy);
      body.append(actions);
    }

    row.append(avatar, body);
    this.log.append(row);

    if (message.role === "assistant") {
      this.hasReplay = true;
      this.updatePlaybackButtons();
    }
    this.updateEmptyState();
    this.log.scrollTop = this.log.scrollHeight;
  }

  replaceMessages(messages: LocalChatMessage[]): void {
    const liveMode = this.log.getAttribute("aria-live") ?? "polite";
    this.log.setAttribute("aria-live", "off");
    this.log.replaceChildren();
    this.hasReplay = false;
    for (const message of messages) this.addMessage(message);
    this.updateEmptyState();
    this.updatePlaybackButtons();
    window.requestAnimationFrame(() => this.log.setAttribute("aria-live", liveMode));
  }

  clearMessages(): void {
    this.log.replaceChildren();
    this.hasReplay = false;
    this.setTyping(false);
    this.updateEmptyState();
    this.updatePlaybackButtons();
  }

  focusComposer(): void {
    if (this.collapsed) this.toggleCollapsed();
    this.input.focus();
  }

  setCollapsed(collapsed: boolean, notify = true): void {
    if (this.collapsed === collapsed) return;
    this.toggleCollapsed(notify);
  }

  get isCollapsed(): boolean {
    return this.collapsed;
  }

  private submit(): void {
    const value = this.input.value.trim();
    if (!value) return;

    if (this.isRecording) {
      this.recognition?.stop();
      this.setRecording(false);
    }
    this.input.value = "";
    safeSetLocalStorage(this.draftKey, "");
    this.updateComposer();
    this.handlers.send(value);
  }

  private submitPrompt(prompt: string): void {
    this.input.value = prompt;
    this.updateComposer();
    this.submit();
  }

  private configureSpeechRecognition(): void {
    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.recordButton.disabled = true;
      this.recordButton.title = "Trình duyệt này chưa hỗ trợ nhập bằng giọng nói.";
      return;
    }

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.lang = "vi-VN";
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onresult = (event) => {
      if (!this.isRecording) return;
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalTranscript += transcript;
        else interimTranscript += transcript;
      }
      this.applySpeechTranscript(finalTranscript, interimTranscript);
    };

    this.recognition.onerror = (event) => {
      this.setRecording(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.handlers.warn("Chrome đang chặn quyền micro. Bạn có thể bật lại ở biểu tượng bên cạnh thanh địa chỉ.");
      } else if (event.error !== "aborted") {
        this.handlers.warn("Mình chưa nghe rõ. Bạn thử nói lại chậm hơn nhé.");
      }
    };

    this.recognition.onend = () => this.setRecording(false);
  }

  private toggleRecording(): void {
    if (!this.recognition) {
      this.handlers.warn("Trình duyệt này chưa hỗ trợ nhập bằng giọng nói.");
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
      this.handlers.warn("Chưa thể bật micro lúc này. Bạn thử lại sau một chút nhé.");
      this.setRecording(false);
    }
  }

  private cancelCurrentActivity(): void {
    if (this.isRecording) {
      try {
        this.recognition?.stop();
      } catch {
        // Recognition may already be stopping; the local state still needs resetting.
      }
      this.setRecording(false);
      return;
    }
    this.handlers.stopSpeaking();
  }

  private applySpeechTranscript(finalTranscript: string, interimTranscript: string): void {
    const spokenText = `${finalTranscript}${interimTranscript}`.trim();
    if (!spokenText) return;

    const separator = this.speechBaseValue ? " " : "";
    this.input.value = `${this.speechBaseValue}${separator}${spokenText}`.slice(0, this.input.maxLength);
    this.input.dispatchEvent(new Event("input", { bubbles: true }));
    if (finalTranscript.trim()) this.speechBaseValue = this.input.value.trimEnd();
  }

  private setRecording(isRecording: boolean): void {
    if (this.isRecording === isRecording) return;
    this.isRecording = isRecording;
    this.recordButton.classList.toggle("is-recording", isRecording);
    this.recordButton.setAttribute("aria-pressed", String(isRecording));
    this.recordButton.setAttribute("aria-label", isRecording ? "Dừng nhập bằng giọng nói" : "Nói để nhập tin nhắn");
    this.recordButton.title = isRecording ? "Dừng lắng nghe" : "Nói để nhập tin nhắn";
    this.handlers.listeningChange?.(isRecording);
  }

  private updateComposer(): void {
    if (this.messageCount) this.messageCount.textContent = `${this.input.value.length} / ${this.input.maxLength}`;
    this.resizeInput();
    this.updateSendState();
  }

  private resizeInput(): void {
    this.input.style.height = "auto";
    this.input.style.height = `${Math.min(Math.max(this.input.scrollHeight, 42), 126)}px`;
  }

  private updateSendState(): void {
    this.sendButton.disabled = !this.input.value.trim() || this.input.disabled;
  }

  private toggleCollapsed(notify = true): void {
    this.collapsed = !this.collapsed;
    this.root.classList.toggle("is-collapsed", this.collapsed);
    this.collapseButton.setAttribute("aria-expanded", String(!this.collapsed));
    this.collapseButton.setAttribute("aria-label", this.collapsed ? "Mở rộng trò chuyện" : "Thu gọn trò chuyện");
    this.collapseButton.title = this.collapsed ? "Mở rộng trò chuyện" : "Thu gọn trò chuyện";
    const icon = this.collapseButton.querySelector("span");
    if (icon) icon.textContent = this.collapsed ? "⌃" : "⌄";
    this.root.scrollTop = 0;
    if (notify) this.handlers.collapsedChange?.(this.collapsed);
    if (!this.collapsed) this.input.focus();
  }

  private updatePlaybackButtons(): void {
    const cancellable = this.state === "THINKING" || this.state === "LISTENING" || this.state === "SPEAKING" || this.state === "REACTING";
    this.stopButton.disabled = !cancellable;
    const stopLabel = this.stopButton.querySelector("span:last-child");
    if (stopLabel) stopLabel.textContent = this.state === "SPEAKING" ? "Dừng" : "Hủy";
    this.replayButton.disabled = !this.voiceAvailable || !this.hasReplay || this.state !== "IDLE";
  }

  private updateEmptyState(): void {
    const hasMessages = this.log.childElementCount > 0;
    this.content?.classList.toggle("has-messages", hasMessages);
    if (this.emptyState) this.emptyState.hidden = hasMessages;
  }

  private setTyping(visible: boolean): void {
    if (visible && !this.typingIndicator.isConnected) {
      this.log.append(this.typingIndicator);
      this.log.scrollTop = this.log.scrollHeight;
    } else if (!visible) {
      this.typingIndicator.remove();
    }
  }

  private createTypingIndicator(): HTMLElement {
    const row = document.createElement("div");
    row.className = "message-row is-assistant typing-row";
    row.setAttribute("aria-label", "Mika đang soạn câu trả lời");
    const avatar = document.createElement("span");
    avatar.className = "message-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = "M";
    const dots = document.createElement("div");
    dots.className = "chat-message is-assistant typing-indicator";
    dots.setAttribute("aria-hidden", "true");
    dots.append(document.createElement("span"), document.createElement("span"), document.createElement("span"));
    row.append(avatar, dots);
    return row;
  }

  private async copyMessage(text: string, button: HTMLButtonElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      const previous = button.textContent;
      button.textContent = "Đã chép";
      window.setTimeout(() => button.textContent = previous, 1200);
    } catch {
      this.handlers.warn("Không thể sao chép tin nhắn trên trình duyệt này.");
    }
  }
}
