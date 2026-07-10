import type { CompanionExpression } from "@anime-buddy/shared";
import { defaultAnimationId } from "@anime-buddy/shared";
import type { AudioPlayer } from "../audio/AudioPlayer.js";
import type { AudioQueue } from "../audio/AudioQueue.js";
import type { TtsClient } from "../audio/TtsClient.js";
import type { VoiceSettings } from "../audio/VoiceSettings.js";
import type { CharacterController } from "../character/CharacterController.js";
import type { ApiClient } from "../services/apiClient.js";
import { sanitizeAiText, estimateSpeechBubbleMs } from "../utils/text.js";
import { toUserMessage } from "../utils/errors.js";
import { perfMetrics } from "../utils/PerformanceMetrics.js";
import { getAvailableAnimationIds } from "./promptBuilder.js";
import { ChatStateMachine } from "./chatStateMachine.js";
import { MessageStore } from "./messageStore.js";
import type { ChatControllerEvents, CompanionState } from "./types.js";

export class ChatController {
  readonly states = new ChatStateMachine();
  private readonly store = new MessageStore();
  private activeAbort: AbortController | null = null;
  private lastReply = "";
  private voiceSettings: VoiceSettings;

  constructor(
    private readonly api: ApiClient,
    private readonly tts: TtsClient,
    private readonly audioQueue: AudioQueue,
    private readonly audioPlayer: AudioPlayer,
    private readonly character: CharacterController,
    private readonly events: ChatControllerEvents,
    voiceSettings: VoiceSettings
  ) {
    this.voiceSettings = voiceSettings;
  }

  setReady(): void {
    this.setState("IDLE", "San sang");
  }

  setVoiceSettings(settings: VoiceSettings): void {
    this.voiceSettings = settings;
    this.events.onStatus(settings.enabled ? "San sang" : "Da tat giong", this.states.state);
  }

  async send(message: string): Promise<void> {
    const normalized = sanitizeAiText(message, 600);
    if (!normalized || this.isBusy()) {
      return;
    }

    perfMetrics.start();
    this.cancelActive();
    this.activeAbort = new AbortController();

    const userMessage = this.store.add({ role: "user", content: normalized });
    this.events.onUserMessage(userMessage);

    try {
      await this.audioPlayer.resume().catch(() => undefined);
      this.setState("THINKING", "Dang suy nghi...");
      this.events.onSpeech("...", 0);
      void this.character.playAnimation("thinking", { loop: true });

      perfMetrics.mark("chatRequestStartedAt");
      const reply = await this.api.sendChat({
        sessionId: this.store.getSessionId(),
        anonymousId: this.store.getAnonymousId(),
        characterId: this.character.getCurrentCharacterId(),
        message: normalized,
        availableAnimations: getAvailableAnimationIds(),
        signal: this.activeAbort.signal
      });
      perfMetrics.mark("chatResponseReceivedAt");

      this.store.setSessionId(reply.sessionId);
      reply.warnings.forEach((warning) => this.events.onWarning(warning));

      const cleanReply = sanitizeAiText(reply.reply);
      this.lastReply = cleanReply;
      const assistantMessage = this.store.add({
        role: "assistant",
        content: cleanReply,
        emotion: reply.emotion,
        animation: reply.animation,
        expression: reply.expression
      });
      this.events.onAssistantMessage(assistantMessage);
      perfMetrics.mark("replyRenderedAt");
      this.events.onSpeech(cleanReply, estimateSpeechBubbleMs(cleanReply));
      this.character.setExpression(reply.expression as CompanionExpression, reply.intensity);

      if (this.voiceSettings.enabled) {
        await this.speak(cleanReply, reply.animation);
      } else {
        this.events.onWarning("Da tat giong noi.");
      }

      this.setState("REACTING", "Dang phan ung");
      await this.character.playAnimation(reply.animation, { loop: false, autoIdle: true });
      await this.returnIdle();
    } catch (error) {
      if (this.isAbortError(error)) {
        await this.returnIdle();
        return;
      }

      this.setState("ERROR", "Khong the ket noi");
      const messageText = toUserMessage(error);
      const systemMessage = this.store.add({ role: "system", content: messageText });
      this.events.onAssistantMessage(systemMessage);
      this.events.onWarning(messageText);
      await this.character.playAnimation("sad", { loop: false }).catch(() => undefined);
      await this.returnIdle();
    } finally {
      this.activeAbort = null;
    }
  }

  cancelActive(): void {
    this.activeAbort?.abort();
    this.audioQueue.cancel();
    this.audioPlayer.stop();
    this.character.stopLipSync();
  }

  stopSpeaking(): void {
    this.audioQueue.cancel();
    this.audioPlayer.stop();
    this.character.stopLipSync();
    void this.returnIdle();
  }

  replayLastReply(): void {
    if (!this.lastReply || !this.voiceSettings.enabled) {
      return;
    }

    perfMetrics.start();
    perfMetrics.mark("replyRenderedAt");
    void this.speak(this.lastReply, defaultAnimationId).then(() => this.returnIdle());
  }

  clear(): void {
    const sessionId = this.store.getSessionId();
    const anonymousId = this.store.getAnonymousId();
    if (sessionId) {
      void this.api.clearConversation(sessionId, anonymousId);
    }
    this.store.clear();
    this.lastReply = "";
  }

  private async speak(text: string, animationId: string): Promise<void> {
    this.setState("SPEAKING", "Dang chuan bi giong...");
    void this.character.playAnimation(animationId || defaultAnimationId, { loop: true }).catch(() => undefined);

    const onStarted = () => {
      this.character.attachLipSyncAnalyser(this.audioPlayer.getAnalyser());
      this.character.startLipSync();
      this.events.onStatus("Dang noi...", "SPEAKING");
    };
    this.audioPlayer.addEventListener("started", onStarted, { once: true });

    try {
      await this.audioQueue.run(async (signal) => {
        const audio = await this.tts.synthesize(text, this.voiceSettings, signal);
        const playing = this.audioPlayer.play(audio);
        await playing;
      });
    } catch (error) {
      if (!this.isAbortError(error)) {
        this.events.onWarning("TTS khong san sang, chat text van tiep tuc.");
      }
    } finally {
      this.audioPlayer.removeEventListener("started", onStarted);
      this.character.stopLipSync();
    }
  }

  private async returnIdle(): Promise<void> {
    if (this.states.state === "DISPOSED") {
      return;
    }
    this.safeTransition("IDLE");
    this.events.onStatus(this.voiceSettings.enabled ? "San sang" : "Da tat giong", "IDLE");
    await this.character.playAnimation(defaultAnimationId, { loop: true }).catch(() => undefined);
  }

  private setState(state: CompanionState, status: string): void {
    this.safeTransition(state);
    this.events.onStatus(status, state);
  }

  private safeTransition(state: CompanionState): void {
    if (this.states.state === state) {
      return;
    }
    if (this.states.canTransition(state)) {
      this.states.transition(state);
      return;
    }
    if (this.states.state !== "DISPOSED") {
      this.states.transition("ERROR");
      if (this.states.canTransition(state)) {
        this.states.transition(state);
      }
    }
  }

  private isBusy(): boolean {
    return this.states.state === "THINKING" || this.states.state === "SPEAKING" || this.states.state === "REACTING";
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === "AbortError";
  }
}
