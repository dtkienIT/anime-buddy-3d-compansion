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
import { SpeechBubble } from "../ui/SpeechBubble.js";
import { ToastManager } from "../ui/ToastManager.js";
import { VoiceControls } from "../ui/VoiceControls.js";

export class AppController {
  private readonly character: CharacterController;
  private readonly chatPanel: ChatPanel;
  private readonly chat: ChatController;
  private readonly status: CharacterStatus;
  private readonly speech: SpeechBubble;
  private readonly toasts: ToastManager;
  private readonly voiceControls: VoiceControls;

  constructor() {
    const canvas = required<HTMLCanvasElement>("#stage");
    const loaderProgress = required<HTMLElement>("#loader-progress");
    const loaderNote = required<HTMLElement>("#loader-note");
    const controls = required<HTMLElement>("#controls");

    this.status = new CharacterStatus(required("#character-status"), required("#state-pill"));
    this.speech = new SpeechBubble(required("#speech-bubble"));
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
          this.speech.hide();
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
        onWarning: (message) => this.toasts.show(message),
        onSpeech: (text, timeoutMs) => this.speech.show(text, timeoutMs)
      },
      this.voiceControls.value
    );

    this.voiceControls.addEventListener("change", (event) => {
      const settings = (event as CustomEvent).detail;
      this.chat.setVoiceSettings(settings);
    });
  }

  async init(): Promise<void> {
    this.renderControlButtons();
    this.setStatus("BOOTING", "Dang khoi dong...");
    await this.character.init();
    this.updateActiveButtons();
    this.chatPanel.setCharacterName(this.currentCharacterLabel());
    document.body.classList.add("is-ready");
    this.chat.setReady();
    this.chatPanel.setVoiceAvailable(true);
    this.speech.show("Xin chao, minh san sang noi chuyen roi.", 3800);
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
