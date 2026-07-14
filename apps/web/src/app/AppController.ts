import {
  defaultAnimationId,
  getAnimationById,
  type AnimationCategory,
  type AnimationRegistryItem,
  type BackgroundRegistryItem,
  type CharacterRegistryItem
} from "@anime-buddy/shared";
import { AudioPlayer } from "../audio/AudioPlayer.js";
import { AudioQueue } from "../audio/AudioQueue.js";
import { TtsClient } from "../audio/TtsClient.js";
import { defaultVoiceSettings, type VoiceSettings } from "../audio/VoiceSettings.js";
import { CharacterController } from "../character/CharacterController.js";
import { ChatController } from "../chat/ChatController.js";
import type { CompanionState } from "../chat/types.js";
import { LocalPerformanceController } from "../performance/LocalPerformanceController.js";
import { isAipaiPerformanceRequest } from "../performance/performanceIntent.js";
import { ApiClient, type MemoryRecord, type SessionSummary } from "../services/apiClient.js";
import { UiPreferencesStore } from "../services/UiPreferences.js";
import { CharacterStatus } from "../ui/CharacterStatus.js";
import { ChatPanel } from "../ui/ChatPanel.js";
import { ToastManager, type ToastVariant } from "../ui/ToastManager.js";
import { VoiceControls } from "../ui/VoiceControls.js";

const blingBangBangBorn = {
  label: "Bling-Bang-Bang-Born",
  animationUrl: "/animations/Bling-Bang-Bang-Born.vrma",
  audioUrl: "/audio/music/Bling-Bang-Bang-Born.mp3",
  startSeconds: 0,
  durationSeconds: 19.167
} as const;

const aipaiDanceHall = {
  label: "Aipai Dance Hall",
  animationUrl: "/animations/Aipai-Dance-Hall.vrma",
  audioUrl: "/audio/music/Aipai-Dance-Hall.mp3",
  startSeconds: 0,
  durationSeconds: 32.7
} as const;

type ControlOption = CharacterRegistryItem | AnimationRegistryItem | BackgroundRegistryItem;
type ControlType = "model" | "animation" | "background";
type DirectInteractionId = "wave" | "nod" | "gentle-gesture" | "curious-tilt";

const directInteractions: Record<DirectInteractionId, { bubble: string; status: string }> = {
  wave: { bubble: "Chào bạn! Mình đang lắng nghe đây.", status: "Đang chào bạn" },
  nod: { bubble: "Mình hiểu rồi, cứ kể tiếp nhé.", status: "Đang phản hồi" },
  "gentle-gesture": { bubble: "Mình ở đây — bạn cứ chia sẻ tự nhiên nhé.", status: "Đang trò chuyện" },
  "curious-tilt": { bubble: "Ồ, điều đó nghe thú vị đấy. Kể thêm cho mình nhé?", status: "Đang tò mò" }
};

const directInteractionCycle = Object.keys(directInteractions) as DirectInteractionId[];

const categoryOrder: AnimationCategory[] = ["idle", "listening", "thinking", "talking", "gesture", "reaction"];
const categoryLabels: Record<AnimationCategory, string> = {
  idle: "Thư giãn",
  listening: "Lắng nghe",
  thinking: "Suy nghĩ",
  talking: "Trò chuyện",
  gesture: "Cử chỉ",
  reaction: "Phản ứng"
};

const categoryIcons: Record<AnimationCategory, string> = {
  idle: "◡",
  listening: "◎",
  thinking: "…",
  talking: "◌",
  gesture: "↝",
  reaction: "✦"
};

export class AppController {
  private readonly character: CharacterController;
  private readonly chatPanel: ChatPanel;
  private readonly chat: ChatController;
  private readonly status: CharacterStatus;
  private readonly toasts: ToastManager;
  private readonly voiceControls: VoiceControls;
  private readonly performance: LocalPerformanceController;
  private readonly aipaiPerformance: LocalPerformanceController;
  private readonly preferences = new UiPreferencesStore();
  private readonly controls = required<HTMLElement>("#controls");
  private readonly chatMenu = required<HTMLElement>("#chat-menu");
  private currentState: CompanionState = "BOOTING";
  private menuOpen = false;
  private focusMode = false;
  private interactionMenuOpen = false;
  private chatCollapsedBeforeStudio: boolean | null = null;
  private interactionBusy = false;
  private interactionGeneration = 0;
  private interactionCount = 0;
  private lastInteractionAt = 0;
  private bubbleTimer: ReturnType<typeof setTimeout> | null = null;
  private helpReturnFocus: HTMLElement | null = null;
  private readonly helpInertedElements: HTMLElement[] = [];
  private ambientTimer: number | null = null;
  private disposed = false;
  private readonly onLayoutResize = (): void => {
    const studioOpen = this.controls.classList.contains("is-open");
    if (studioOpen && window.innerWidth < 1100 && this.chatCollapsedBeforeStudio === null) {
      this.chatCollapsedBeforeStudio = this.chatPanel.isCollapsed;
      this.chatPanel.setCollapsed(true, false);
    } else if (studioOpen && window.innerWidth >= 1100 && this.chatCollapsedBeforeStudio !== null) {
      const restoreCollapsed = this.chatCollapsedBeforeStudio;
      this.chatCollapsedBeforeStudio = null;
      this.chatPanel.setCollapsed(restoreCollapsed, false);
    }
    this.syncStageComposition();
  };

  constructor() {
    const canvas = required<HTMLCanvasElement>("#stage");
    const loaderProgress = required<HTMLElement>("#loader-progress");
    const loaderTrack = loaderProgress.parentElement;
    const loaderNote = required<HTMLElement>("#loader-note");
    const stageBusy = required<HTMLElement>("#stage-busy");

    this.status = new CharacterStatus(required("#character-status"), required("#state-pill"));
    this.toasts = new ToastManager(required("#toast-region"));

    this.character = new CharacterController({
      canvas,
      onStatus: (message) => {
        required("#character-status").textContent = message;
        required("#stage-busy-label").textContent = message;
      },
      onBusy: (busy) => {
        this.controls.classList.toggle("is-busy", busy);
        this.controls.setAttribute("aria-busy", String(busy));
        stageBusy.hidden = !busy;
      },
      onProgress: (percent, note) => {
        const safePercent = Math.round(Math.max(0, Math.min(100, percent)));
        loaderProgress.style.width = `${safePercent}%`;
        loaderTrack?.setAttribute("aria-valuenow", String(safePercent));
        if (note) loaderNote.textContent = note;
      },
      onAnimationChange: () => this.updateActiveButtons(),
      onInteract: () => void this.handleCharacterInteraction()
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
      required("#record-message"),
      required("#chat-send"),
      required("#chat-log"),
      required("#chat-status"),
      required("#chat-character-name"),
      required("#collapse-chat"),
      required("#stop-speaking"),
      required("#replay-reply"),
      required("#clear-chat"),
      {
        send: (message) => void this.handleChatMessage(message),
        stopSpeaking: () => void this.chat.stopSpeaking(),
        replay: () => this.chat.replayLastReply(),
        clear: () => this.clearConversation(),
        warn: (message) => this.notify(message, "warning"),
        listeningChange: (active) => void this.chat.setListening(active),
        collapsedChange: (collapsed) => {
          this.preferences.update({ chatCollapsed: collapsed });
          this.syncStageComposition();
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
        onUserMessage: (message) => {
          this.invalidateDirectInteraction();
          this.stopPerformances(false);
          this.chatPanel.addMessage(message);
        },
        onAssistantMessage: (message) => this.chatPanel.addMessage(message),
        onStatus: (message, state) => this.setStatus(state, message),
        onWarning: (message) => this.notify(message, "warning")
      },
      this.voiceControls.value
    );

    this.performance = new LocalPerformanceController({
      label: blingBangBangBorn.label,
      button: required("#bling-performance"),
      status: required("#performance-status"),
      audioUrl: blingBangBangBorn.audioUrl,
      startSeconds: blingBangBangBorn.startSeconds,
      durationSeconds: blingBangBangBorn.durationSeconds,
      onPrepare: () => this.character.preloadAnimationAsset(blingBangBangBorn.animationUrl),
      onStart: async () => {
        this.aipaiPerformance.stop(false);
        this.invalidateDirectInteraction();
        document.body.classList.add("is-performing");
        this.showPerformanceLive(blingBangBangBorn.label);
        if (this.currentState !== "IDLE") await this.chat.stopSpeaking();
        this.setStatus("REACTING", "Đang trình diễn Bling-Bang-Bang-Born");
        await this.character.playAnimationAsset(blingBangBangBorn.animationUrl, { loop: false, fadeDuration: 0.08 });
      },
      onStop: () => this.restoreAfterPerformance(),
      onWarning: (message) => this.notify(message, "warning")
    });

    this.aipaiPerformance = new LocalPerformanceController({
      label: aipaiDanceHall.label,
      button: required("#aipai-performance"),
      status: required("#aipai-performance-status"),
      audioUrl: aipaiDanceHall.audioUrl,
      startSeconds: aipaiDanceHall.startSeconds,
      durationSeconds: aipaiDanceHall.durationSeconds,
      onPrepare: () => this.character.preloadAnimationAsset(aipaiDanceHall.animationUrl),
      onStart: async () => {
        this.performance.stop(false);
        this.invalidateDirectInteraction();
        document.body.classList.add("is-performing");
        this.showPerformanceLive(aipaiDanceHall.label);
        if (this.currentState !== "IDLE") await this.chat.stopSpeaking();
        this.setStatus("REACTING", "Đang trình diễn Aipai Dance Hall");
        await this.character.playAnimationAsset(aipaiDanceHall.animationUrl, { loop: false, fadeDuration: 0.08 });
      },
      onStop: () => this.restoreAfterPerformance(),
      onWarning: (message) => this.notify(message, "warning")
    });

    this.voiceControls.addEventListener("change", (event) => {
      const settings = (event as CustomEvent<VoiceSettings>).detail;
      this.chat.setVoiceSettings(settings);
    });

    this.initControlTabs();
    this.initAnimationSearch();
    this.initMemoryAndSessionUi();
    this.initAppShell();
    this.applyReducedMotion(this.preferences.current.reducedMotion, false);
  }

  async init(): Promise<void> {
    const preference = this.preferences.current;
    this.renderControlButtons();
    this.chatPanel.setCollapsed(preference.chatCollapsed, false);
    this.setControlsOpen(preference.controlsOpen, false);
    this.setStatus("BOOTING", "Đang chuẩn bị không gian 3D…");

    await this.character.init({
      characterId: preference.characterId,
      backgroundId: preference.backgroundId,
      animationId: defaultAnimationId
    });

    this.updateCharacterIdentity();
    this.updateActiveButtons();

    this.chat.setReady();
    this.chatPanel.setVoiceAvailable(true);

    document.body.classList.add("is-ready");
    required("#loader").setAttribute("aria-hidden", "true");
    this.syncNetworkStatus();
    void this.chat.initializeHistory();

    if (!preference.welcomeSeen) {
      this.setControlsOpen(false);
      if (window.innerWidth < 760) this.chatPanel.setCollapsed(true, false);
      required<HTMLElement>("#welcome-card").hidden = false;
    }

    void this.performance.initialize().catch(() => {
      this.notify("Không chuẩn bị được Bling-Bang-Bang-Born.", "warning");
    });
    void this.aipaiPerformance.initialize().catch(() => {
      this.notify("Không chuẩn bị được Aipai Dance Hall.", "warning");
    });

    this.startAmbientMoments();
    this.syncStageComposition();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.ambientTimer) window.clearTimeout(this.ambientTimer);
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    window.removeEventListener("resize", this.onLayoutResize);
    this.stopPerformances(false);
    this.character.dispose();
  }

  private renderControlButtons(): void {
    const models = this.character.getCharacters();
    const animations = this.character.getAnimations();
    const backgrounds = this.character.getBackgrounds();
    this.renderButtons(required("#model-buttons"), models, "model");
    this.renderButtons(required("#animation-buttons"), animations, "animation");
    this.renderButtons(required("#background-buttons"), backgrounds, "background");
    required("#model-count").textContent = String(models.length);
    required("#animation-count").textContent = String(animations.length);
    required("#background-count").textContent = String(backgrounds.length);
  }

  private renderButtons(container: HTMLElement, options: ControlOption[], type: ControlType): void {
    container.replaceChildren();
    const fragment = document.createDocumentFragment();
    const renderedOptions = type === "animation"
      ? [...options].sort((left, right) => categoryOrder.indexOf(getAnimationById(left.id).category) - categoryOrder.indexOf(getAnimationById(right.id).category))
      : options;
    let currentCategory = "";

    for (const option of renderedOptions) {
      const animation = type === "animation" ? getAnimationById(option.id) : null;
      if (animation && animation.category !== currentCategory) {
        const heading = document.createElement("div");
        heading.className = "button-grid-heading";
        heading.textContent = categoryLabels[animation.category];
        heading.dataset.category = animation.category;
        fragment.append(heading);
        currentCategory = animation.category;
      }

      const button = document.createElement("button");
      button.className = "control-button";
      button.type = "button";
      button.title = option.description || option.label;
      button.setAttribute("aria-label", `${option.label}${option.description ? ` — ${option.description}` : ""}`);
      button.setAttribute("aria-pressed", "false");
      button.dataset[`${type}Id`] = option.id;
      button.dataset.filter = normalizeSearch(`${option.label} ${option.description ?? ""} ${animation ? categoryLabels[animation.category] : ""}`);
      if (animation) button.dataset.category = animation.category;

      if (type === "background") {
        button.style.setProperty("--option-image", `url("${option.url}")`);
      } else {
        const icon = document.createElement("span");
        icon.className = "option-icon";
        icon.setAttribute("aria-hidden", "true");
        icon.textContent = animation ? categoryIcons[animation.category] : option.label.trim().charAt(0).toUpperCase();
        button.append(icon);
      }

      const copy = document.createElement("span");
      copy.className = "option-copy";
      const label = document.createElement("span");
      label.className = "option-label";
      label.textContent = option.label;
      const meta = document.createElement("span");
      meta.className = "option-meta";
      meta.textContent = option.description || (animation ? categoryLabels[animation.category] : type === "model" ? "Nhân vật 3D" : "Không gian");
      copy.append(label, meta);
      button.append(copy);

      button.addEventListener("click", () => {
        if (type === "model") void this.selectModel(option.id);
        else if (type === "animation") void this.playManualAnimation(option.id);
        else this.selectBackground(option.id);
      });
      fragment.append(button);
    }

    container.append(fragment);
  }

  private async selectModel(characterId: string): Promise<void> {
    this.invalidateDirectInteraction();
    this.stopPerformances(false);
    if (this.currentState !== "IDLE") await this.chat.stopSpeaking();
    try {
      await this.character.switchModel(characterId);
      this.preferences.update({ characterId: this.character.getCurrentCharacterId() });
      this.updateCharacterIdentity();
      this.updateActiveButtons();
      this.setStatus("IDLE", `${this.currentCharacterLabel()} đã sẵn sàng`);
      this.showBubble(`Xin chào, mình là ${this.currentCharacterLabel()} ✦`);
    } catch {
      this.notify("Không thể mở nhân vật này. Nhân vật trước đó vẫn được giữ nguyên.", "error");
      this.setStatus("IDLE", "Sẵn sàng");
    }
  }

  private async playManualAnimation(animationId: string): Promise<void> {
    if (this.interactionBusy) return;
    const animation = getAnimationById(animationId);
    this.stopPerformances(false);
    if (this.currentState !== "IDLE") await this.chat.stopSpeaking();
    const generation = this.beginDirectInteraction();
    this.setStatus(animation.loop ? "IDLE" : "REACTING", animation.label);

    try {
      await this.character.playAnimation(animation.id, {
        loop: animation.loop,
        maxDurationMs: animation.loop ? undefined : 8_000
      });
      if (!this.ownsDirectInteraction(generation)) return;
      if (!animation.loop) {
        await this.character.playAnimation(defaultAnimationId, { loop: true });
        if (!this.ownsDirectInteraction(generation)) return;
        this.setStatus("IDLE", "Sẵn sàng");
      }
    } catch {
      if (!this.ownsDirectInteraction(generation)) return;
      this.notify(`Chưa thể phát động tác “${animation.label}”.`, "warning");
      await this.character.playAnimation(defaultAnimationId, { loop: true }).catch(() => undefined);
      if (!this.ownsDirectInteraction(generation)) return;
      this.setStatus("IDLE", "Sẵn sàng");
    } finally {
      if (this.ownsDirectInteraction(generation)) {
        this.interactionBusy = false;
        this.updateActiveButtons();
      }
    }
  }

  private selectBackground(backgroundId: string): void {
    this.character.switchBackground(backgroundId);
    this.preferences.update({ backgroundId: this.character.getCurrentBackgroundId() });
    this.updateActiveButtons();
    const label = this.character.getBackgrounds().find((item) => item.id === this.character.getCurrentBackgroundId())?.label;
    this.notify(`Đã chuyển đến ${label ?? "bối cảnh mới"}.`, "success");
  }

  private updateActiveButtons(): void {
    toggleButtons("[data-model-id]", this.character.getCurrentCharacterId(), "modelId");
    toggleButtons("[data-animation-id]", this.character.getCurrentAnimationId(), "animationId");
    toggleButtons("[data-background-id]", this.character.getCurrentBackgroundId(), "backgroundId");
  }

  private updateCharacterIdentity(): void {
    const name = this.currentCharacterLabel();
    this.chatPanel.setCharacterName(name);
    document.title = `${name} · 3D AI Companion`;
    setText("#brand-name", `${name} space`);
    const brandMark = document.querySelector<HTMLElement>(".brand-mark");
    if (brandMark) brandMark.textContent = name.trim().charAt(0).toUpperCase() || "M";
    setText("#chat-empty-title", `${name} đang ở đây`);
    setText("#performance-heading", `Sân khấu riêng của ${name}`);
    setText("#memory-toggle-label", `Cho phép ${name} ghi nhớ`);
    setText("#memory-privacy-note", `Bạn luôn có thể xem, sửa hoặc xóa từng điều ${name} ghi nhớ.`);
    setText("#welcome-title", `Đây là không gian của bạn và ${name}`);
    setText("#welcome-copy", `Kéo để đổi góc nhìn, chạm ${name} để nhận phản hồi hoặc bắt đầu một cuộc trò chuyện thật tự nhiên.`);
    setText("#help-touch-copy", `Chạm trực tiếp vào ${name} khi bạn muốn tương tác nhanh.`);
    setText("#stage-hint", `Kéo để xoay · cuộn để zoom · chạm vào ${name} để tương tác`);
    const input = required<HTMLTextAreaElement>("#chat-input");
    input.placeholder = `Nhắn điều gì đó cho ${name}…`;
    const wave = required<HTMLButtonElement>("#stage-wave");
    wave.title = `Chào ${name}`;
  }

  private currentCharacterLabel(): string {
    return this.character.getCharacters().find((character) => character.id === this.character.getCurrentCharacterId())?.label ?? "Companion";
  }

  private setStatus(state: CompanionState, detail?: string): void {
    if (state === "LISTENING" || state === "THINKING" || state === "SPEAKING" || state === "ERROR") {
      this.invalidateDirectInteraction();
    }
    this.currentState = state;
    this.status.set(state, detail);
    this.chatPanel.setState(state, detail || state);
  }

  private async handleChatMessage(message: string): Promise<void> {
    this.setMenuOpen(false);
    if (!isAipaiPerformanceRequest(message)) {
      await this.chat.send(message);
      return;
    }

    const ready = await this.chat.respondLocally(message, "Dạ, để mình biểu diễn cho bạn nhé!");
    if (ready) this.aipaiPerformance.start();
  }

  private initControlTabs(): void {
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".control-tab"));
    const panes = Array.from(document.querySelectorAll<HTMLElement>(".control-section[role='tabpanel']"));

    const activate = (tab: HTMLButtonElement, focus = false): void => {
      const paneId = tab.getAttribute("aria-controls");
      for (const candidate of tabs) {
        const active = candidate === tab;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
        candidate.tabIndex = active ? 0 : -1;
      }
      for (const pane of panes) {
        const active = pane.id === paneId;
        pane.classList.toggle("is-active", active);
        pane.hidden = !active;
        if (active) pane.scrollTop = 0;
      }
      if (focus) tab.focus();
    };

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex: number | null = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = tabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activate(tabs[nextIndex], true);
      });
    });
  }

  private initAnimationSearch(): void {
    const search = required<HTMLInputElement>("#animation-search");
    search.addEventListener("input", () => this.filterAnimations(search.value));
    search.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && search.value) {
        event.stopPropagation();
        search.value = "";
        this.filterAnimations("");
      }
    });
  }

  private filterAnimations(query: string): void {
    const normalized = normalizeSearch(query);
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("#animation-buttons [data-animation-id]"));
    let visible = 0;
    for (const button of buttons) {
      const matches = !normalized || (button.dataset.filter ?? "").includes(normalized);
      button.hidden = !matches;
      if (matches) visible += 1;
    }
    document.querySelectorAll<HTMLElement>("#animation-buttons .button-grid-heading").forEach((heading) => {
      heading.hidden = !buttons.some((button) => button.dataset.category === heading.dataset.category && !button.hidden);
    });
    required<HTMLElement>("#animation-empty").hidden = visible > 0;
  }

  private initMemoryAndSessionUi(): void {
    const toggleMenu = required<HTMLButtonElement>("#toggle-menu");
    const menuTabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".menu-tab-btn"));
    const menuPanes = Array.from(document.querySelectorAll<HTMLElement>(".menu-pane[role='tabpanel']"));
    const newSessionBtn = required<HTMLButtonElement>("#new-session-btn");
    const quickSessionBtn = required<HTMLButtonElement>("#new-chat-quick");
    const exportBtn = required<HTMLButtonElement>("#export-btn");
    const sessionSearch = required<HTMLInputElement>("#session-search");
    const memoryToggle = required<HTMLInputElement>("#toggle-memory-checkbox");
    const clearMemoriesBtn = required<HTMLButtonElement>("#clear-memories-btn");

    toggleMenu.addEventListener("click", () => this.setMenuOpen(!this.menuOpen));

    const activateMenuTab = (tab: HTMLButtonElement, focus = false): void => {
      const paneId = tab.getAttribute("aria-controls");
      menuTabs.forEach((candidate) => {
        const active = candidate === tab;
        candidate.classList.toggle("is-active", active);
        candidate.setAttribute("aria-selected", String(active));
        candidate.tabIndex = active ? 0 : -1;
      });
      menuPanes.forEach((pane) => pane.hidden = pane.id !== paneId);
      if (paneId === "pane-memory") void this.refreshMemoriesList();
      if (focus) tab.focus();
    };

    menuTabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activateMenuTab(tab));
      tab.addEventListener("keydown", (event) => {
        let nextIndex: number | null = null;
        if (event.key === "ArrowRight") nextIndex = (index + 1) % menuTabs.length;
        if (event.key === "ArrowLeft") nextIndex = (index - 1 + menuTabs.length) % menuTabs.length;
        if (event.key === "Home") nextIndex = 0;
        if (event.key === "End") nextIndex = menuTabs.length - 1;
        if (nextIndex === null) return;
        event.preventDefault();
        activateMenuTab(menuTabs[nextIndex], true);
      });
    });

    const createSession = async (): Promise<void> => {
      const created = await this.chat.createNewSession();
      if (!created) return;
      this.setMenuOpen(false);
      this.chatPanel.setCollapsed(false);
      this.chatPanel.focusComposer();
      this.notify("Đã mở một cuộc trò chuyện mới.", "success");
    };
    newSessionBtn.addEventListener("click", () => void createSession());
    quickSessionBtn.addEventListener("click", () => void createSession());

    exportBtn.addEventListener("click", () => void this.exportUserData());

    memoryToggle.addEventListener("change", () => void this.updateMemorySetting(memoryToggle));
    clearMemoriesBtn.addEventListener("click", () => void this.clearAllMemories());
    sessionSearch.addEventListener("input", () => this.filterSessions(sessionSearch.value));

    this.chat.setDataHandlers(
      (sessions) => this.renderSessionsList(sessions),
      (messages, sessionId) => {
        this.chatPanel.setDraftScope(sessionId);
        this.chatPanel.replaceMessages(messages);
        this.updateActiveSessionItem(sessionId);
      }
    );

    void this.loadMemorySetting(memoryToggle);
  }

  private setMenuOpen(open: boolean): void {
    this.menuOpen = open;
    const panel = required<HTMLElement>("#chat-panel");
    const toggle = required<HTMLButtonElement>("#toggle-menu");
    panel.classList.toggle("show-menu", open);
    this.chatMenu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Quay lại trò chuyện" : "Mở dữ liệu và cài đặt");
    toggle.title = open ? "Quay lại trò chuyện" : "Hội thoại, trí nhớ và cài đặt";
    panel.scrollTop = 0;
    if (open) {
      this.chatPanel.setCollapsed(false);
      void this.refreshSessionsList();
    }
  }

  private async loadMemorySetting(toggle: HTMLInputElement): Promise<void> {
    const status = required<HTMLElement>("#memory-setting-status");
    toggle.disabled = true;
    status.textContent = "Đang kiểm tra thiết lập…";
    try {
      toggle.checked = await this.chat.getMemoryEnabled();
      toggle.disabled = false;
      status.textContent = toggle.checked ? "Đang bật — bạn có toàn quyền kiểm soát" : "Đang tắt trên tài khoản này";
    } catch {
      toggle.checked = false;
      status.textContent = "Chưa kết nối được dịch vụ trí nhớ";
    }
  }

  private async updateMemorySetting(toggle: HTMLInputElement): Promise<void> {
    const status = required<HTMLElement>("#memory-setting-status");
    const enabled = toggle.checked;
    toggle.disabled = true;
    status.textContent = "Đang lưu thiết lập…";
    try {
      await this.chat.setMemoryEnabled(enabled);
      status.textContent = enabled ? "Đang bật — bạn có toàn quyền kiểm soát" : "Đang tắt trên tài khoản này";
      const name = this.currentCharacterLabel();
      this.notify(enabled ? `${name} có thể ghi nhớ từ bây giờ.` : `${name} đã dừng ghi nhớ.`, "success");
    } catch {
      toggle.checked = !enabled;
      status.textContent = "Không thể cập nhật lúc này";
      this.notify("Không thể cập nhật thiết lập trí nhớ.", "error");
    } finally {
      toggle.disabled = false;
    }
  }

  private async refreshSessionsList(): Promise<void> {
    const list = required<HTMLElement>("#sessions-list");
    renderListState(list, "Đang tải hội thoại…");
    try {
      this.renderSessionsList(await this.chat.getSessions());
    } catch {
      renderListState(list, "Chưa thể tải hội thoại. Bạn vẫn có thể tiếp tục chat.", true);
    }
  }

  private async refreshMemoriesList(): Promise<void> {
    const list = required<HTMLElement>("#memories-list");
    renderListState(list, "Đang tải trí nhớ…");
    try {
      this.renderMemoriesList(await this.chat.getMemories());
    } catch {
      renderListState(list, "Chưa thể kết nối dịch vụ trí nhớ.", true);
    }
  }

  private renderSessionsList(sessions: SessionSummary[]): void {
    const list = required<HTMLElement>("#sessions-list");
    list.replaceChildren();
    if (sessions.length === 0) {
      renderListState(list, "Chưa có hội thoại nào. Hãy bắt đầu một câu chuyện mới.");
      return;
    }

    const activeSessionId = this.chat.getSessionId();
    for (const session of sessions) {
      const item = document.createElement("article");
      item.className = `session-item${session.id === activeSessionId ? " is-active" : ""}`;
      item.dataset.sessionId = session.id;

      const main = document.createElement("button");
      main.className = "session-main";
      main.type = "button";
      main.setAttribute("aria-current", session.id === activeSessionId ? "true" : "false");
      main.addEventListener("click", () => void this.openSession(session.id));

      const icon = document.createElement("span");
      icon.className = "session-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "◌";
      const copy = document.createElement("span");
      copy.className = "session-copy";
      const title = document.createElement("span");
      title.className = "session-title";
      title.textContent = session.title?.trim() || "Cuộc trò chuyện";
      const date = document.createElement("span");
      date.className = "session-date";
      date.textContent = formatSessionDate(session.updated_at || session.created_at);
      copy.append(title, date);
      main.append(icon, copy);

      const actions = document.createElement("div");
      actions.className = "item-actions";
      const rename = miniButton("Sửa", `Đổi tên ${title.textContent}`);
      rename.addEventListener("click", () => void this.renameSession(session));
      const remove = miniButton("Xóa", `Xóa ${title.textContent}`, true);
      remove.addEventListener("click", () => void this.removeSession(session));
      actions.append(rename, remove);
      item.append(main, actions);
      list.append(item);
    }
  }

  private async openSession(sessionId: string): Promise<void> {
    const loaded = await this.chat.loadSession(sessionId);
    if (!loaded) return;
    this.setMenuOpen(false);
    this.chatPanel.focusComposer();
  }

  private async renameSession(session: SessionSummary): Promise<void> {
    const title = window.prompt("Đặt tên dễ nhớ cho cuộc trò chuyện:", session.title || "");
    if (!title?.trim()) return;
    const renamed = await this.chat.renameSession(session.id, title.trim().slice(0, 100));
    if (!renamed) return;
    await this.refreshSessionsList();
    this.notify("Đã đổi tên cuộc trò chuyện.", "success");
  }

  private async removeSession(session: SessionSummary): Promise<void> {
    if (!window.confirm(`Xóa “${session.title?.trim() || "Cuộc trò chuyện"}”? Thao tác này không thể hoàn tác.`)) return;
    const deleted = await this.chat.deleteSession(session.id);
    if (!deleted) return;
    this.notify("Đã xóa cuộc trò chuyện.", "success");
  }

  private renderMemoriesList(memories: MemoryRecord[]): void {
    const list = required<HTMLElement>("#memories-list");
    list.replaceChildren();
    if (memories.length === 0) {
      renderListState(list, "Chưa có điều gì được ghi nhớ. Bạn có thể bật trí nhớ ở phía trên.");
      return;
    }

    for (const memory of memories) {
      const item = document.createElement("article");
      item.className = "memory-item";
      const content = document.createElement("div");
      content.className = "memory-content";
      const text = document.createElement("span");
      text.className = "memory-text";
      text.textContent = memory.content;
      const meta = document.createElement("div");
      meta.className = "memory-meta";
      const tag = document.createElement("span");
      tag.className = "memory-tag";
      tag.textContent = memoryKindLabel(memory.kind);
      const confidence = document.createElement("span");
      confidence.textContent = `Độ tin cậy ${Math.round(memory.confidence * 100)}%`;
      meta.append(tag, confidence);
      content.append(text, meta);

      const actions = document.createElement("div");
      actions.className = "item-actions";
      const edit = miniButton("Sửa", "Chỉnh sửa trí nhớ");
      edit.addEventListener("click", () => void this.editMemory(memory));
      const remove = miniButton("Xóa", "Xóa trí nhớ", true);
      remove.addEventListener("click", () => void this.removeMemory(memory));
      actions.append(edit, remove);
      item.append(content, actions);
      list.append(item);
    }
  }

  private async editMemory(memory: MemoryRecord): Promise<void> {
    const content = window.prompt(`Chỉnh sửa điều ${this.currentCharacterLabel()} ghi nhớ:`, memory.content);
    if (!content?.trim()) return;
    try {
      await this.chat.updateMemory(memory.id, content.trim().slice(0, 600));
      await this.refreshMemoriesList();
      this.notify("Đã cập nhật trí nhớ.", "success");
    } catch {
      this.notify("Không thể cập nhật trí nhớ.", "error");
    }
  }

  private async removeMemory(memory: MemoryRecord): Promise<void> {
    if (!window.confirm(`Xóa điều này khỏi trí nhớ của ${this.currentCharacterLabel()}?`)) return;
    try {
      await this.chat.deleteMemory(memory.id);
      await this.refreshMemoriesList();
      this.notify("Đã xóa trí nhớ.", "success");
    } catch {
      this.notify("Không thể xóa trí nhớ.", "error");
    }
  }

  private async clearAllMemories(): Promise<void> {
    if (!window.confirm("Xóa toàn bộ trí nhớ dài hạn? Thao tác này không thể hoàn tác.")) return;
    try {
      await this.chat.deleteAllMemories();
      await this.refreshMemoriesList();
      this.notify("Đã xóa toàn bộ trí nhớ.", "success");
    } catch {
      this.notify("Không thể xóa trí nhớ lúc này.", "error");
    }
  }

  private async exportUserData(): Promise<void> {
    try {
      const data = await this.chat.exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${this.character.getCurrentCharacterId()}-space-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      this.notify("Đã chuẩn bị tệp dữ liệu của bạn.", "success");
    } catch {
      this.notify("Không thể xuất dữ liệu lúc này.", "error");
    }
  }

  private filterSessions(query: string): void {
    const normalized = normalizeSearch(query);
    document.querySelectorAll<HTMLElement>("#sessions-list .session-item").forEach((item) => {
      const title = normalizeSearch(item.querySelector(".session-title")?.textContent ?? "");
      item.hidden = !title.includes(normalized);
    });
  }

  private updateActiveSessionItem(sessionId: string): void {
    document.querySelectorAll<HTMLElement>("#sessions-list .session-item").forEach((item) => {
      const active = item.dataset.sessionId === sessionId;
      item.classList.toggle("is-active", active);
      item.querySelector(".session-main")?.setAttribute("aria-current", String(active));
    });
  }

  private initAppShell(): void {
    required<HTMLButtonElement>("#studio-toggle").addEventListener("click", () => {
      this.setControlsOpen(!this.controls.classList.contains("is-open"));
    });
    required<HTMLButtonElement>("#close-controls").addEventListener("click", () => {
      this.setControlsOpen(false);
      required<HTMLButtonElement>("#studio-toggle").focus();
    });
    required<HTMLButtonElement>("#focus-toggle").addEventListener("click", () => this.setFocusMode(!this.focusMode));
    required<HTMLButtonElement>("#help-toggle").addEventListener("click", () => this.openHelp());
    required<HTMLButtonElement>("#show-help-btn").addEventListener("click", () => this.openHelp());
    required<HTMLButtonElement>("#help-close").addEventListener("click", () => this.closeHelp());
    required<HTMLElement>("#help-dialog").addEventListener("click", (event) => {
      if (event.target === event.currentTarget) this.closeHelp();
    });
    required<HTMLElement>("#help-dialog").addEventListener("keydown", (event) => this.trapHelpFocus(event));

    required<HTMLButtonElement>("#camera-reset").addEventListener("click", () => this.resetCamera());
    required<HTMLButtonElement>("#camera-zoom-in").addEventListener("click", () => this.character.zoomBy(0.12));
    required<HTMLButtonElement>("#camera-zoom-out").addEventListener("click", () => this.character.zoomBy(-0.12));
    required<HTMLButtonElement>("#stage-wave").addEventListener("click", () => void this.handleCharacterInteraction("wave"));
    required<HTMLButtonElement>("#interaction-menu-toggle").addEventListener("click", () => {
      this.setInteractionMenuOpen(!this.interactionMenuOpen);
    });
    document.querySelectorAll<HTMLButtonElement>("#interaction-menu [data-interaction-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const interactionId = button.dataset.interactionId as DirectInteractionId | undefined;
        this.setInteractionMenuOpen(false);
        if (interactionId && interactionId in directInteractions) void this.handleCharacterInteraction(interactionId);
      });
    });
    required<HTMLElement>("#interaction-menu").addEventListener("keydown", (event) => {
      const items = [...document.querySelectorAll<HTMLButtonElement>("#interaction-menu [role='menuitem']")];
      const currentIndex = Math.max(0, items.indexOf(document.activeElement as HTMLButtonElement));
      let nextIndex: number | null = null;
      if (event.key === "ArrowDown" || event.key === "ArrowRight") nextIndex = (currentIndex + 1) % items.length;
      else if (event.key === "ArrowUp" || event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + items.length) % items.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = items.length - 1;
      else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.setInteractionMenuOpen(false, true);
        return;
      }
      if (nextIndex !== null) {
        event.preventDefault();
        items[nextIndex]?.focus();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (!this.interactionMenuOpen) return;
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const menu = required<HTMLElement>("#interaction-menu");
      const toggle = required<HTMLButtonElement>("#interaction-menu-toggle");
      if (!menu.contains(target) && !toggle.contains(target)) this.setInteractionMenuOpen(false);
    });
    required<HTMLButtonElement>("#fullscreen-toggle").addEventListener("click", () => void this.toggleFullscreen());
    required<HTMLButtonElement>("#stop-performance-live").addEventListener("click", () => this.stopPerformances(true));
    document.addEventListener("fullscreenchange", () => this.updateFullscreenButton());

    required<HTMLButtonElement>("#welcome-dismiss").addEventListener("click", () => this.dismissWelcome());
    required<HTMLButtonElement>("#welcome-start").addEventListener("click", () => {
      this.dismissWelcome();
      this.chatPanel.setCollapsed(false);
      this.chatPanel.focusComposer();
    });
    required<HTMLButtonElement>("#welcome-explore").addEventListener("click", () => {
      this.dismissWelcome();
      void this.handleCharacterInteraction("wave");
    });
    required<HTMLButtonElement>("#welcome-privacy-settings").addEventListener("click", () => {
      this.dismissWelcome();
      this.chatPanel.setCollapsed(false);
      this.setMenuOpen(true);
      required<HTMLButtonElement>("#tab-memory-btn").click();
    });

    const reducedMotion = required<HTMLInputElement>("#reduced-motion-checkbox");
    reducedMotion.checked = this.preferences.current.reducedMotion;
    reducedMotion.addEventListener("change", () => this.applyReducedMotion(reducedMotion.checked));
    required<HTMLButtonElement>("#reset-experience-btn").addEventListener("click", () => this.resetExperience());
    required<HTMLButtonElement>("#loader-retry").addEventListener("click", () => window.location.reload());

    window.addEventListener("online", () => {
      this.syncNetworkStatus();
      this.notify("Đã kết nối lại.", "success");
    });
    window.addEventListener("offline", () => {
      this.syncNetworkStatus();
      this.notify("Bạn đang ngoại tuyến. Tin nhắn sẽ được giữ trên thiết bị.", "warning");
    });
    window.addEventListener("resize", this.onLayoutResize);
    window.addEventListener("keydown", (event) => this.handleShortcut(event));
  }

  private setControlsOpen(open: boolean, persist = true): void {
    const shouldTemporarilyCollapseChat = window.innerWidth < 1100;
    if (open && shouldTemporarilyCollapseChat) {
      if (this.chatCollapsedBeforeStudio === null) this.chatCollapsedBeforeStudio = this.chatPanel.isCollapsed;
      this.setMenuOpen(false);
      this.chatPanel.setCollapsed(true, false);
    } else if (!open && this.chatCollapsedBeforeStudio !== null) {
      const restoreCollapsed = this.chatCollapsedBeforeStudio;
      this.chatCollapsedBeforeStudio = null;
      this.chatPanel.setCollapsed(restoreCollapsed, false);
    }

    this.controls.classList.toggle("is-open", open);
    this.controls.setAttribute("aria-hidden", String(!open));
    this.controls.inert = !open || this.focusMode || document.body.classList.contains("is-performing");
    const toggle = required<HTMLButtonElement>("#studio-toggle");
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("is-active", open);
    if (persist) this.preferences.update({ controlsOpen: open });
    this.setInteractionMenuOpen(false);
    this.syncStageComposition();
  }

  private setFocusMode(active: boolean): void {
    this.focusMode = active;
    document.body.classList.toggle("is-focus-mode", active);
    required<HTMLElement>("#chat-panel").inert = active || document.body.classList.contains("is-performing");
    required<HTMLElement>("#welcome-card").inert = active;
    this.controls.inert = active || !this.controls.classList.contains("is-open") || document.body.classList.contains("is-performing");
    const toggle = required<HTMLButtonElement>("#focus-toggle");
    toggle.setAttribute("aria-pressed", String(active));
    toggle.title = active ? "Thoát chế độ tập trung (F)" : "Chế độ tập trung (F)";
    if (active) {
      this.setInteractionMenuOpen(false);
      this.setControlsOpen(false, false);
      this.setMenuOpen(false);
      this.dismissWelcome(false);
    }
  }

  private resetCamera(): void {
    this.character.resetCamera();
    this.notify("Đã căn lại góc nhìn.", "success");
  }

  private resetExperience(): void {
    const reset = this.preferences.reset();
    this.preferences.update({
      characterId: this.character.getCurrentCharacterId(),
      backgroundId: this.character.getCurrentBackgroundId()
    });
    this.applyReducedMotion(reset.reducedMotion, false);
    required<HTMLInputElement>("#reduced-motion-checkbox").checked = reset.reducedMotion;
    this.setFocusMode(false);
    this.setMenuOpen(false);
    this.chatPanel.setCollapsed(reset.chatCollapsed, false);
    this.setControlsOpen(reset.controlsOpen, false);
    this.character.resetCamera();
    this.syncStageComposition();
    this.notify("Đã đặt lại góc nhìn và giao diện.", "success");
  }

  private applyReducedMotion(reduced: boolean, persist = true): void {
    document.body.classList.toggle("is-reduced-motion", reduced);
    this.character.setReducedMotion(reduced);
    if (persist) this.preferences.update({ reducedMotion: reduced });
  }

  private openHelp(): void {
    if (document.body.classList.contains("is-performing")) {
      this.notify("Hãy dừng màn trình diễn trước khi mở trợ giúp.", "info");
      return;
    }
    const dialog = required<HTMLElement>("#help-dialog");
    if (!dialog.hidden) return;
    this.helpReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement) || child === dialog || child.inert) continue;
      child.inert = true;
      this.helpInertedElements.push(child);
    }
    dialog.hidden = false;
    required<HTMLButtonElement>("#help-toggle").setAttribute("aria-expanded", "true");
    required<HTMLButtonElement>("#help-close").focus();
  }

  private closeHelp(): void {
    const dialog = required<HTMLElement>("#help-dialog");
    if (dialog.hidden) return;
    dialog.hidden = true;
    for (const element of this.helpInertedElements.splice(0)) element.inert = false;
    required<HTMLButtonElement>("#help-toggle").setAttribute("aria-expanded", "false");
    this.helpReturnFocus?.focus();
    this.helpReturnFocus = null;
  }

  private trapHelpFocus(event: globalThis.KeyboardEvent): void {
    if (event.key !== "Tab") return;
    const dialog = required<HTMLElement>("#help-dialog");
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.hidden && !element.inert);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private dismissWelcome(persist = true): void {
    const welcome = required<HTMLElement>("#welcome-card");
    welcome.hidden = true;
    if (persist) this.preferences.update({ welcomeSeen: true });
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      this.notify("Trình duyệt chưa cho phép mở toàn màn hình.", "warning");
    }
  }

  private updateFullscreenButton(): void {
    const button = required<HTMLButtonElement>("#fullscreen-toggle");
    const active = Boolean(document.fullscreenElement);
    button.setAttribute("aria-label", active ? "Thoát toàn màn hình" : "Toàn màn hình");
    button.title = active ? "Thoát toàn màn hình" : "Toàn màn hình";
    const icon = button.querySelector("span");
    if (icon) icon.textContent = active ? "⤢" : "⛶";
  }

  private setInteractionMenuOpen(open: boolean, restoreFocus = false): void {
    if (open && (this.focusMode || document.body.classList.contains("is-performing"))) return;
    this.interactionMenuOpen = open;
    const menu = required<HTMLElement>("#interaction-menu");
    const toggle = required<HTMLButtonElement>("#interaction-menu-toggle");
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.classList.toggle("is-active", open);
    if (open) {
      requestAnimationFrame(() => menu.querySelector<HTMLButtonElement>("button")?.focus());
    } else if (restoreFocus) {
      toggle.focus();
    }
  }

  private syncStageComposition(): void {
    let composition: "center" | "left" | "right" = "center";
    if (window.innerWidth >= 760 && window.innerWidth < 1100) {
      if (this.controls.classList.contains("is-open")) composition = "right";
      else if (!this.chatPanel.isCollapsed) composition = "left";
    }
    this.character.setStageComposition(composition);
  }

  private syncNetworkStatus(): void {
    const status = required<HTMLElement>("#network-status");
    status.dataset.online = String(navigator.onLine);
    required("#network-status-label").textContent = navigator.onLine ? "Trực tuyến" : "Ngoại tuyến";
  }

  private handleShortcut(event: globalThis.KeyboardEvent): void {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
    const help = required<HTMLElement>("#help-dialog");

    if (event.key === "Escape") {
      if (document.body.classList.contains("is-performing")) this.stopPerformances(true);
      else if (!help.hidden) this.closeHelp();
      else if (this.interactionMenuOpen) this.setInteractionMenuOpen(false, true);
      else if (this.controls.classList.contains("is-open")) this.setControlsOpen(false);
      else if (this.menuOpen) this.setMenuOpen(false);
      else if (this.focusMode) this.setFocusMode(false);
      return;
    }
    // The modal owns keyboard interaction until it closes. This keeps the
    // background inert state consistent with focus and performance modes.
    if (!help.hidden) return;
    if (editing || event.ctrlKey || event.metaKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (key === "/") {
      event.preventDefault();
      this.setFocusMode(false);
      this.chatPanel.focusComposer();
    } else if (key === "c") {
      this.setControlsOpen(!this.controls.classList.contains("is-open"));
    } else if (key === "r") {
      this.resetCamera();
    } else if (key === "f") {
      this.setFocusMode(!this.focusMode);
    } else if (key === "?") {
      this.openHelp();
    }
  }

  private async handleCharacterInteraction(forcedAnimation?: DirectInteractionId): Promise<void> {
    const now = performance.now();
    if (this.currentState !== "IDLE" || this.interactionBusy || now - this.lastInteractionAt < 900 || document.body.classList.contains("is-performing")) return;
    this.lastInteractionAt = now;
    this.setInteractionMenuOpen(false);
    const generation = this.beginDirectInteraction();
    const animationId = forcedAnimation ?? directInteractionCycle[this.interactionCount++ % directInteractionCycle.length];
    const interaction = directInteractions[animationId];
    const bubble = animationId === "wave"
      ? `Chào bạn! ${this.currentCharacterLabel()} đang lắng nghe đây.`
      : interaction.bubble;
    this.showBubble(bubble);
    this.setStatus("REACTING", interaction.status);
    await this.character.playAnimation(animationId, { loop: false, maxDurationMs: 4_000 }).catch(() => undefined);
    if (!this.ownsDirectInteraction(generation)) return;
    await this.character.playAnimation(defaultAnimationId, { loop: true }).catch(() => undefined);
    if (!this.ownsDirectInteraction(generation)) return;
    this.setStatus("IDLE", "Sẵn sàng");
    this.interactionBusy = false;
  }

  private showBubble(message: string): void {
    const bubble = required<HTMLElement>("#stage-dialogue");
    if (this.bubbleTimer) clearTimeout(this.bubbleTimer);
    bubble.textContent = message;
    bubble.hidden = false;
    this.bubbleTimer = setTimeout(() => {
      bubble.hidden = true;
      this.bubbleTimer = null;
    }, 3_600);
  }

  private startAmbientMoments(): void {
    const schedule = (): void => {
      if (this.disposed) return;
      const delay = 24_000 + Math.round(Math.random() * 12_000);
      this.ambientTimer = window.setTimeout(async () => {
        this.ambientTimer = null;
        if (this.disposed) return;
        if (
          this.currentState === "IDLE"
          && !this.interactionBusy
          && !this.preferences.current.reducedMotion
          && document.visibilityState === "visible"
          && !document.body.classList.contains("is-performing")
          && this.character.getCurrentAnimationId() === defaultAnimationId
        ) {
          const generation = this.beginDirectInteraction();
          await this.character.playAnimation("look-around", { loop: false, maxDurationMs: 6_000 }).catch(() => undefined);
          if (this.ownsDirectInteraction(generation) && this.currentState === "IDLE") {
            await this.character.playAnimation(defaultAnimationId, { loop: true }).catch(() => undefined);
          }
          if (this.ownsDirectInteraction(generation)) this.interactionBusy = false;
        }
        schedule();
      }, delay);
    };
    schedule();
  }

  private async clearConversation(): Promise<void> {
    if (!window.confirm("Xóa nội dung cuộc trò chuyện hiện tại trên thiết bị và máy chủ?")) return;
    const synced = await this.chat.clear();
    this.chatPanel.clearMessages();
    this.setMenuOpen(false);
    if (synced) this.notify("Đã xóa nội dung cuộc trò chuyện.", "success");
  }

  private stopPerformances(restoreIdle: boolean): void {
    this.performance.stop(restoreIdle);
    this.aipaiPerformance.stop(restoreIdle);
    if (!restoreIdle) {
      document.body.classList.remove("is-performing");
      required<HTMLElement>("#performance-live").hidden = true;
      this.setPerformanceUiLocked(false);
    }
  }

  private async restoreAfterPerformance(): Promise<void> {
    document.body.classList.remove("is-performing");
    required<HTMLElement>("#performance-live").hidden = true;
    this.setPerformanceUiLocked(false);
    const generation = this.beginDirectInteraction();
    await this.character.playAnimation(defaultAnimationId, { loop: true });
    if (!this.ownsDirectInteraction(generation)) return;
    this.setStatus("IDLE", "Sẵn sàng");
    this.interactionBusy = false;
    this.updateActiveButtons();
  }

  private showPerformanceLive(label: string): void {
    required("#performance-live-label").textContent = `Đang trình diễn · ${label}`;
    required<HTMLElement>("#performance-live").hidden = false;
    this.setPerformanceUiLocked(true);
  }

  private setPerformanceUiLocked(locked: boolean): void {
    if (locked) this.setInteractionMenuOpen(false);
    this.controls.inert = locked || !this.controls.classList.contains("is-open") || this.focusMode;
    required<HTMLElement>("#chat-panel").inert = locked || this.focusMode;
    required<HTMLElement>(".stage-toolbar").inert = locked;
    required<HTMLButtonElement>("#studio-toggle").disabled = locked;
    required<HTMLButtonElement>("#help-toggle").disabled = locked;
  }

  private beginDirectInteraction(): number {
    this.interactionBusy = true;
    return ++this.interactionGeneration;
  }

  private ownsDirectInteraction(generation: number): boolean {
    return generation === this.interactionGeneration;
  }

  private invalidateDirectInteraction(): void {
    this.interactionGeneration += 1;
    this.interactionBusy = false;
    const bubble = document.querySelector<HTMLElement>("#stage-dialogue");
    if (bubble) bubble.hidden = true;
  }

  private notify(message: string, variant: ToastVariant = "info"): void {
    this.toasts.show(message, 4_200, variant);
  }
}

function toggleButtons(selector: string, activeId: string, dataKey: string): void {
  document.querySelectorAll<HTMLButtonElement>(selector).forEach((button) => {
    const active = button.dataset[dataKey] === activeId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function renderListState(list: HTMLElement, message: string, isError = false): void {
  list.replaceChildren();
  const state = document.createElement("p");
  state.className = `list-state${isError ? " is-error" : ""}`;
  state.textContent = message;
  list.append(state);
}

function miniButton(label: string, ariaLabel: string, danger = false): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = `btn-mini${danger ? " is-danger" : ""}`;
  button.type = "button";
  button.textContent = label;
  button.setAttribute("aria-label", ariaLabel);
  return button;
}

function formatSessionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Gần đây";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return `Hôm nay · ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(date)}`;
  }
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" }).format(date);
}

function memoryKindLabel(kind: string): string {
  const labels: Record<string, string> = {
    preference: "Sở thích",
    fact: "Thông tin",
    relationship: "Mối quan hệ",
    goal: "Mục tiêu",
    event: "Sự kiện"
  };
  return labels[kind.toLowerCase()] ?? kind;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function required<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element ${selector}`);
  return node;
}
