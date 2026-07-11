import { getAnimationById } from "@anime-buddy/shared";
import { ApiClient } from "../services/apiClient.js";
import { AudioPlayer } from "../audio/AudioPlayer.js";
import { AudioQueue } from "../audio/AudioQueue.js";
import { TtsClient } from "../audio/TtsClient.js";
import { defaultVoiceSettings } from "../audio/VoiceSettings.js";
import { CharacterController } from "../character/CharacterController.js";
import { ChatController } from "../chat/ChatController.js";
import type { CompanionState } from "../chat/types.js";
import { ChatPanel } from "../ui/ChatPanel.js";
import { CharacterStatus } from "../ui/CharacterStatus.js";
import { ToastManager } from "../ui/ToastManager.js";
import { VoiceControls } from "../ui/VoiceControls.js";

export class AppController {
  private readonly character: CharacterController;
  private readonly chatPanel: ChatPanel;
  private readonly chat: ChatController;
  private readonly status: CharacterStatus;
  private readonly toasts: ToastManager;
  private readonly voiceControls: VoiceControls;

  constructor() {
    const canvas = required<HTMLCanvasElement>("#stage");
    const loaderProgress = required<HTMLElement>("#loader-progress");
    const loaderNote = required<HTMLElement>("#loader-note");
    const controls = required<HTMLElement>("#controls");

    this.status = new CharacterStatus(required("#character-status"), required("#state-pill"));
    this.toasts = new ToastManager(required("#toast-region"));

    this.character = new CharacterController({
      canvas,
      onStatus: (message) => required("#character-status").textContent = message,
      onBusy: (busy) => controls.classList.toggle("is-busy", busy),
      onProgress: (percent, note) => {
        loaderProgress.style.width = `${percent}%`;
        if (note) {
          loaderNote.textContent = note;
        }
      }
    });

    this.voiceControls = new VoiceControls(required("#voice-toggle"), defaultVoiceSettings);
    const api = new ApiClient();
    const tts = new TtsClient();
    const audioPlayer = new AudioPlayer();
    const audioQueue = new AudioQueue();

    this.chatPanel = new ChatPanel(
      required("#chat-panel"),
      required("#chat-form"),
      required("#chat-input"),
      required("#chat-send"),
      required("#chat-log"),
      required("#chat-status"),
      required("#chat-character-name"),
      required("#collapse-chat"),
      required("#stop-speaking"),
      required("#replay-reply"),
      required("#clear-chat"),
      {
        send: (message) => void this.chat.send(message),
        stopSpeaking: () => this.chat.stopSpeaking(),
        replay: () => this.chat.replayLastReply(),
        clear: () => {
          this.chat.clear();
          this.chatPanel.clearMessages();
        }
      }
    );

    this.chat = new ChatController(
      api,
      tts,
      audioQueue,
      audioPlayer,
      this.character,
      {
        onUserMessage: (message) => this.chatPanel.addMessage(message),
        onAssistantMessage: (message) => this.chatPanel.addMessage(message),
        onStatus: (message, state) => this.setStatus(state, message),
        onWarning: (message) => this.toasts.show(message)
      },
      this.voiceControls.value
    );

    this.voiceControls.addEventListener("change", (event) => {
      const settings = (event as CustomEvent).detail;
      this.chat.setVoiceSettings(settings);
    });

    this.initMemoryAndSessionUi();
  }

  async init(): Promise<void> {
    this.renderControlButtons();
    this.setStatus("BOOTING", "Dang khoi dong...");
    await this.character.init();
    this.updateActiveButtons();
    this.chatPanel.setCharacterName(this.currentCharacterLabel());
    document.body.classList.add("is-ready");

    try {
      await this.chat.initializeHistory();
    } catch {
      // ignore
    }

    this.chat.setReady();
    this.chatPanel.setVoiceAvailable(true);

  }

  private renderControlButtons(): void {
    this.renderButtons(required("#model-buttons"), this.character.getCharacters(), "model");
    this.renderButtons(required("#animation-buttons"), this.character.getAnimations(), "animation");
    this.renderButtons(required("#background-buttons"), this.character.getBackgrounds(), "background");
  }

  private renderButtons(container: HTMLElement, options: Array<{ id: string; label: string; url: string }>, type: "model" | "animation" | "background"): void {
    container.replaceChildren();
    const fragment = document.createDocumentFragment();

    for (const option of options) {
      const button = document.createElement("button");
      button.className = "control-button";
      button.type = "button";
      button.textContent = option.label;
      button.title = option.url;
      button.dataset[`${type}Id`] = option.id;
      button.addEventListener("click", () => {
        if (type === "model") {
          void this.character.switchModel(option.id).then(() => {
            this.chatPanel.setCharacterName(this.currentCharacterLabel());
            this.updateActiveButtons();
          });
        } else if (type === "animation") {
          const animation = getAnimationById(option.id);
          void this.character.playAnimation(option.id, { loop: animation.loop }).then(() => this.updateActiveButtons());
        } else {
          this.character.switchBackground(option.id);
          this.updateActiveButtons();
        }
      });
      fragment.append(button);
    }

    container.append(fragment);
  }

  private updateActiveButtons(): void {
    toggleButtons("[data-model-id]", this.character.getCurrentCharacterId(), "modelId");
    toggleButtons("[data-animation-id]", this.character.getCurrentAnimationId(), "animationId");
    toggleButtons("[data-background-id]", this.character.getCurrentBackgroundId(), "backgroundId");
  }

  private currentCharacterLabel(): string {
    return this.character.getCharacters().find((character) => character.id === this.character.getCurrentCharacterId())?.label ?? "Companion";
  }

  private setStatus(state: CompanionState, detail?: string): void {
    this.status.set(state, detail);
    this.chatPanel.setStatus(detail || state);
    this.chatPanel.setBusy(state === "THINKING" || state === "SPEAKING" || state === "REACTING");
  }

  private initMemoryAndSessionUi(): void {
    const chatPanel = required<HTMLElement>("#chat-panel");
    const toggleMenu = required<HTMLButtonElement>("#toggle-menu");
    const chatMenu = required<HTMLElement>("#chat-menu");
    const tabSessionsBtn = required<HTMLButtonElement>("#tab-sessions-btn");
    const tabMemoryBtn = required<HTMLButtonElement>("#tab-memory-btn");
    const paneSessions = required<HTMLElement>("#pane-sessions");
    const paneMemory = required<HTMLElement>("#pane-memory");
    const newSessionBtn = required<HTMLButtonElement>("#new-session-btn");
    const exportBtn = required<HTMLButtonElement>("#export-btn");
    const sessionSearch = required<HTMLInputElement>("#session-search");
    const toggleMemoryCheckbox = required<HTMLInputElement>("#toggle-memory-checkbox");
    const clearMemoriesBtn = required<HTMLButtonElement>("#clear-memories-btn");

    let isMenuOpen = false;

    toggleMenu.addEventListener("click", () => {
      isMenuOpen = !isMenuOpen;
      chatPanel.classList.toggle("show-menu", isMenuOpen);
      chatMenu.style.display = isMenuOpen ? "flex" : "none";
      toggleMenu.textContent = isMenuOpen ? "Chat" : "Menu";
      toggleMenu.title = isMenuOpen ? "Quay lại trò chuyện" : "Cài đặt & Trí nhớ";

      if (isMenuOpen) {
        void this.refreshSessionsList();
        void this.refreshMemoriesList();
      }
    });

    tabSessionsBtn.addEventListener("click", () => {
      tabSessionsBtn.classList.add("is-active");
      tabMemoryBtn.classList.remove("is-active");
      paneSessions.style.display = "flex";
      paneMemory.style.display = "none";
    });

    tabMemoryBtn.addEventListener("click", () => {
      tabMemoryBtn.classList.add("is-active");
      tabSessionsBtn.classList.remove("is-active");
      paneMemory.style.display = "flex";
      paneSessions.style.display = "none";
      void this.refreshMemoriesList();
    });

    newSessionBtn.addEventListener("click", () => {
      void this.chat.createNewSession();
    });

    exportBtn.addEventListener("click", async () => {
      try {
        const data = await this.chat["api"].exportData(this.chat["store"].getAnonymousId());
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `companion-memory-${data.anonymousId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch {
        this.toasts.show("Không thể xuất dữ liệu.");
      }
    });

    toggleMemoryCheckbox.addEventListener("change", async () => {
      const enabled = toggleMemoryCheckbox.checked;
      try {
        await this.chat["api"].setMemoryEnabled(this.chat["store"].getAnonymousId(), enabled);
      } catch {
        this.toasts.show("Không thể cập nhật cấu hình.");
        toggleMemoryCheckbox.checked = !enabled;
      }
    });

    clearMemoriesBtn.addEventListener("click", async () => {
      if (confirm("Bạn có chắc muốn xóa toàn bộ trí nhớ dài hạn?")) {
        try {
          await this.chat["api"].deleteAllMemories(this.chat["store"].getAnonymousId());
          this.toasts.show("Đã xóa sạch bộ nhớ!");
          void this.refreshMemoriesList();
        } catch {
          this.toasts.show("Không thể xóa bộ nhớ.");
        }
      }
    });

    sessionSearch.addEventListener("input", () => {
      this.filterSessions(sessionSearch.value);
    });

    this.chat["events"].onSessionsLoaded = (sessions) => {
      this.renderSessionsList(sessions);
    };

    this.chat["events"].onHistoryLoaded = (messages, sessionId) => {
      this.chatPanel.clearMessages();
      messages.forEach(m => this.chatPanel.addMessage(m));
      this.updateActiveSessionItem(sessionId);
    };

    void this.chat["api"].getMemoryEnabled(this.chat["store"].getAnonymousId())
      .then(enabled => {
        toggleMemoryCheckbox.checked = enabled;
      })
      .catch(() => undefined);
  }

  private async refreshSessionsList(): Promise<void> {
    try {
      const sessions = await this.chat["api"].getSessions(this.chat["store"].getAnonymousId());
      this.renderSessionsList(sessions);
    } catch {
      // ignore
    }
  }

  private async refreshMemoriesList(): Promise<void> {
    try {
      const memories = await this.chat["api"].getMemories(this.chat["store"].getAnonymousId());
      this.renderMemoriesList(memories);
    } catch {
      // ignore
    }
  }

  private renderSessionsList(sessions: any[]): void {
    const list = required<HTMLElement>("#sessions-list");
    list.replaceChildren();

    const activeSessionId = this.chat["store"].getSessionId();

    sessions.forEach(session => {
      const item = document.createElement("div");
      item.className = `session-item${session.id === activeSessionId ? " is-active" : ""}`;
      item.dataset.sessionId = session.id;

      const title = document.createElement("span");
      title.className = "session-title";
      title.textContent = session.title || "Cuộc trò chuyện";
      title.addEventListener("click", () => {
        void this.chat.loadSession(session.id);
      });

      const date = document.createElement("span");
      date.className = "session-date";
      const dt = new Date(session.updated_at || session.created_at);
      date.textContent = `${dt.getDate()}/${dt.getMonth() + 1}`;

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const renameBtn = document.createElement("button");
      renameBtn.className = "btn-mini";
      renameBtn.textContent = "Sửa";
      renameBtn.addEventListener("click", () => {
        const newTitle = prompt("Nhập tên mới cho cuộc trò chuyện này:", session.title || "");
        if (newTitle && newTitle.trim()) {
          void this.chat.renameActiveSession(newTitle.trim()).then(() => {
            void this.refreshSessionsList();
          });
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-mini is-danger";
      deleteBtn.textContent = "Xóa";
      deleteBtn.addEventListener("click", () => {
        if (confirm("Xóa cuộc trò chuyện này?")) {
          void this.chat.deleteSession(session.id);
        }
      });

      actions.append(renameBtn, deleteBtn);
      item.append(title, date, actions);
      list.append(item);
    });
  }

  private renderMemoriesList(memories: any[]): void {
    const list = required<HTMLElement>("#memories-list");
    list.replaceChildren();

    if (memories.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-message is-system";
      empty.style.textAlign = "center";
      empty.textContent = "Chưa có ký ức nào được ghi lại.";
      list.append(empty);
      return;
    }

    memories.forEach(mem => {
      const item = document.createElement("div");
      item.className = "memory-item";

      const content = document.createElement("div");
      content.className = "memory-content";

      const text = document.createElement("span");
      text.className = "memory-text";
      text.textContent = mem.content;

      const meta = document.createElement("div");
      meta.className = "memory-meta";

      const tag = document.createElement("span");
      tag.className = "memory-tag";
      tag.textContent = mem.kind;

      const importance = document.createElement("span");
      importance.textContent = `độ tin cậy: ${Math.round(mem.confidence * 100)}%`;

      meta.append(tag, importance);
      content.append(text, meta);

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn-mini";
      editBtn.textContent = "Sửa";
      editBtn.addEventListener("click", async () => {
        const newContent = prompt("Chỉnh sửa ký ức:", mem.content);
        if (newContent && newContent.trim()) {
          try {
            await this.chat["api"].updateMemory(mem.id, newContent.trim());
            void this.refreshMemoriesList();
          } catch {
            this.toasts.show("Không thể cập nhật ký ức.");
          }
        }
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn-mini is-danger";
      deleteBtn.textContent = "Xóa";
      deleteBtn.addEventListener("click", async () => {
        if (confirm("Xóa ký ức này?")) {
          try {
            await this.chat["api"].deleteMemory(mem.id);
            void this.refreshMemoriesList();
          } catch {
            this.toasts.show("Không thể xóa ký ức.");
          }
        }
      });

      actions.append(editBtn, deleteBtn);
      item.append(content, actions);
      list.append(item);
    });
  }

  private filterSessions(query: string): void {
    const normalized = query.toLowerCase().trim();
    document.querySelectorAll<HTMLElement>("#sessions-list .session-item").forEach(item => {
      const title = item.querySelector(".session-title")?.textContent?.toLowerCase() || "";
      const matches = title.includes(normalized);
      item.style.display = matches ? "flex" : "none";
    });
  }

  private updateActiveSessionItem(sessionId: string): void {
    document.querySelectorAll<HTMLElement>("#sessions-list .session-item").forEach(item => {
      const active = item.dataset.sessionId === sessionId;
      item.classList.toggle("is-active", active);
    });
  }
}

function toggleButtons(selector: string, activeId: string, dataKey: string): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    button.classList.toggle("is-active", button.dataset[dataKey] === activeId);
  });
}

function required<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Missing required element ${selector}`);
  }
  return node;
}
