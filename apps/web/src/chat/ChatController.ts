import type { CompanionExpression } from "@anime-buddy/shared";
import { defaultAnimationId } from "@anime-buddy/shared";
import type { AudioPlayer } from "../audio/AudioPlayer.js";
import type { AudioQueue } from "../audio/AudioQueue.js";
import type { TtsClient } from "../audio/TtsClient.js";
import type { VoiceSettings } from "../audio/VoiceSettings.js";
import type { CharacterController } from "../character/CharacterController.js";
import type { ApiClient } from "../services/apiClient.js";
import { sanitizeAiText, estimateSpeechBubbleMs, splitIntoSpeechChunks } from "../utils/text.js";
import { toUserMessage } from "../utils/errors.js";
import { perfMetrics } from "../utils/PerformanceMetrics.js";
import { getAvailableAnimationIds } from "./promptBuilder.js";
import { ChatStateMachine } from "./chatStateMachine.js";
import { MessageStore } from "./messageStore.js";
import type { ChatControllerEvents, CompanionState } from "./types.js";
import { IndexedDbOutbox } from "../services/IndexedDbOutbox.js";

export class ChatController {
  readonly states = new ChatStateMachine();
  private readonly store = new MessageStore();
  private readonly outbox = new IndexedDbOutbox();
  private activeAbort: AbortController | null = null;
  private activeRunId = 0;
  private operationSequence = 0;
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
    this.outbox.init().catch(() => undefined);
  }

  setReady(): void {
    this.setState("IDLE", "San sang");
  }

  async initializeHistory(): Promise<void> {
    const anonymousId = this.store.getAnonymousId();
    try {
      const sessions = await this.api.getSessions(anonymousId);
      this.events.onSessionsLoaded?.(sessions);

      let sessionId = this.store.getSessionId();
      if (!sessionId && sessions.length > 0) {
        const firstSessionId = sessions[0].id;
        if (firstSessionId) {
          sessionId = firstSessionId;
          this.store.setSessionId(firstSessionId);
        }
      }

      if (sessionId) {
        const messages = await this.api.loadConversation(sessionId, anonymousId);
        const localMessages = messages.map((m: any) => ({
          role: m.role,
          content: m.content,
          emotion: m.emotion || undefined,
          animation: m.animation || undefined,
          expression: m.expression || undefined,
          id: m.id || crypto.randomUUID()
        }));
        this.store.setMessages(localMessages);
        this.events.onHistoryLoaded?.(localMessages, sessionId);
      }

      // Try syncing any pending offline messages
      void this.syncOfflineMessages();
    } catch {
      this.events.onWarning("Không thể tải lịch sử từ server. Chat offline.");
    }
  }

  async loadSession(sessionId: string): Promise<void> {
    const anonymousId = this.store.getAnonymousId();
    this.cancelActive();
    this.setState("THINKING", "Tải cuộc trò chuyện...");
    try {
      this.store.setSessionId(sessionId);
      const messages = await this.api.loadConversation(sessionId, anonymousId);
      const localMessages = messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        emotion: m.emotion || undefined,
        animation: m.animation || undefined,
        expression: m.expression || undefined,
        id: m.id || crypto.randomUUID()
      }));
      this.store.setMessages(localMessages);
      this.events.onHistoryLoaded?.(localMessages, sessionId);
      this.setState("IDLE", "Sẵn sàng");
    } catch {
      this.setState("ERROR", "Lỗi tải cuộc trò chuyện");
      this.events.onWarning("Không thể tải cuộc trò chuyện này.");
      void this.returnIdle();
    }
  }

  async createNewSession(): Promise<void> {
    const anonymousId = this.store.getAnonymousId();
    const characterId = this.character.getCurrentCharacterId();
    this.cancelActive();
    try {
      const session = await this.api.createSession(anonymousId, characterId);
      this.store.setSessionId(session.id);
      this.store.clear();
      
      const sessions = await this.api.getSessions(anonymousId);
      this.events.onSessionsLoaded?.(sessions);
      this.events.onHistoryLoaded?.([], session.id);
    } catch {
      this.events.onWarning("Không thể tạo cuộc trò chuyện mới.");
    }
  }

  async renameActiveSession(title: string): Promise<void> {
    const sessionId = this.store.getSessionId();
    if (!sessionId) return;
    try {
      await this.api.renameSession(sessionId, title);
      const sessions = await this.api.getSessions(this.store.getAnonymousId());
      this.events.onSessionsLoaded?.(sessions);
    } catch {
      this.events.onWarning("Không thể đổi tên cuộc trò chuyện.");
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    const anonymousId = this.store.getAnonymousId();
    try {
      await this.api.deleteSession(sessionId, anonymousId);
      if (this.store.getSessionId() === sessionId) {
        this.store.clearSession();
        this.store.clear();
        this.events.onHistoryLoaded?.([], "");
      }
      const sessions = await this.api.getSessions(anonymousId);
      this.events.onSessionsLoaded?.(sessions);
      if (sessions.length > 0 && !this.store.getSessionId()) {
        await this.loadSession(sessions[0].id);
      }
    } catch {
      this.events.onWarning("Không thể xóa cuộc trò chuyện.");
    }
  }

  async syncOfflineMessages(): Promise<void> {
    try {
      const pending = await this.outbox.getAll();
      if (pending.length === 0) return;
      for (const msg of pending) {
        await this.api.saveOfflineMessage(msg.sessionId, {
          role: msg.role,
          content: msg.content,
          emotion: msg.emotion,
          animation: msg.animation,
          expression: msg.expression
        });
        await this.outbox.remove(msg.id);
      }
    } catch {
      // ignore network errors
    }
  }

  setVoiceSettings(settings: VoiceSettings): void {
    this.voiceSettings = settings;
    if (!settings.enabled && this.states.state === "SPEAKING") {
      this.stopSpeaking();
    }
    this.events.onStatus(settings.enabled ? "San sang" : "Da tat giong", this.states.state);
  }

  async send(message: string): Promise<void> {
    const normalized = sanitizeAiText(message, 600);
    if (!normalized) {
      return;
    }

    if (this.isBusy()) {
      this.cancelActive();
      this.safeTransition("IDLE");
    }
    const operationId = ++this.operationSequence;
    const runId = perfMetrics.start();
    this.activeRunId = runId;
    this.activeAbort = new AbortController();

    const userMessage = this.store.add({ role: "user", content: normalized });
    this.events.onUserMessage(userMessage);

    let sessionId = this.store.getSessionId();
    const tempSessionId = sessionId || crypto.randomUUID();
    if (!sessionId) {
      this.store.setSessionId(tempSessionId);
    }

    try {
      await this.audioPlayer.resume().catch(() => undefined);
      this.setState("THINKING", "Đang suy nghĩ...");
      
      const memoryStatusTimeout = setTimeout(() => {
        if (this.states.state === "THINKING") {
          this.setState("THINKING", "Đang truy xuất ký ức...");
        }
      }, 300);

      this.events.onSpeech("...", 0);
      void this.character.playAnimation("thinking", { loop: true });

      perfMetrics.mark(runId, "chatRequestStartedAt");
      const reply = await this.api.sendChat({
        sessionId: this.store.getSessionId(),
        anonymousId: this.store.getAnonymousId(),
        characterId: this.character.getCurrentCharacterId(),
        message: normalized,
        availableAnimations: getAvailableAnimationIds(),
        signal: this.activeAbort.signal
      });
      perfMetrics.mark(runId, "chatResponseReceivedAt");
      perfMetrics.mark(runId, "assistantReplyStartedAt");
      perfMetrics.mark(runId, "assistantReplyCompletedAt");
      clearTimeout(memoryStatusTimeout);

      if (operationId !== this.operationSequence) return;

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
      perfMetrics.mark(runId, "replyRenderedAt");
      perfMetrics.mark(runId, "firstVisibleTextAt");
      this.events.onSpeech(cleanReply, estimateSpeechBubbleMs(cleanReply));
      this.character.setExpression(reply.expression as CompanionExpression, reply.intensity);

      if (this.voiceSettings.enabled) {
        await this.speak(cleanReply, reply.animation, runId);
      } else {
        this.events.onWarning("Đã tắt giọng nói.");
      }

      if (operationId !== this.operationSequence) return;
      this.setState("REACTING", "Đang phản ứng");
      await this.character.playAnimation(reply.animation, { loop: false, autoIdle: true });
      if (operationId === this.operationSequence) await this.returnIdle();
      perfMetrics.finish(runId, "completed");

      // Trigger background sync for any queued messages
      void this.syncOfflineMessages();
    } catch (error) {
      if (this.isAbortError(error)) {
        if (operationId === this.operationSequence) await this.returnIdle();
        return;
      }

      // Offline outbox queue fallback
      try {
        await this.outbox.add({
          id: userMessage.id,
          sessionId: this.store.getSessionId() || tempSessionId,
          role: "user",
          content: normalized,
          createdAt: new Date().toISOString()
        });
      } catch (dbErr) {
        console.error("Failed to add to IndexedDB outbox:", dbErr);
      }

      this.setState("ERROR", "Khong the ket noi");
      const messageText = toUserMessage(error);
      const systemMessage = this.store.add({ role: "system", content: `${messageText} (Chưa đồng bộ)` });
      this.events.onAssistantMessage(systemMessage);
      this.events.onWarning("Chưa đồng bộ. Đang hoạt động ở chế độ ngoại tuyến.");
      await this.character.playAnimation("sad", { loop: false }).catch(() => undefined);
      await this.returnIdle();
    } finally {
      if (operationId === this.operationSequence) this.activeAbort = null;
    }
  }

  cancelActive(): void {
    this.activeAbort?.abort();
    this.audioQueue.cancel();
    this.audioPlayer.stop();
    this.character.stopLipSync();
    if (this.activeRunId) {
      perfMetrics.mark(this.activeRunId, "cancelledAt");
      perfMetrics.finish(this.activeRunId, "cancelled");
    }
  }

  stopSpeaking(): void {
    ++this.operationSequence;
    this.cancelActive();
    void this.returnIdle();
  }

  replayLastReply(): void {
    if (!this.lastReply || !this.voiceSettings.enabled) {
      return;
    }

    const runId = perfMetrics.start();
    this.activeRunId = runId;
    perfMetrics.mark(runId, "replyRenderedAt");
    perfMetrics.mark(runId, "firstVisibleTextAt");
    void this.speak(this.lastReply, defaultAnimationId, runId).then(() => this.returnIdle());
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

  private async speak(text: string, animationId: string, runId: number): Promise<void> {
    this.setState("SPEAKING", "Đang chuẩn bị giọng...");
    this.character.setRenderRate(1);
    void this.character.playAnimation(animationId || defaultAnimationId, { loop: true }).catch(() => undefined);

    perfMetrics.mark(runId, "chunkSplitStartedAt");
    const chunks = splitIntoSpeechChunks(text);
    perfMetrics.mark(runId, "chunkSplitCompletedAt");

    try {
      await this.audioQueue.playChunks(
        chunks,
        this.audioPlayer,
        async (chunkText, signal) => {
          return await this.tts.synthesize(chunkText, this.voiceSettings, signal, runId);
        },
        () => {
          this.character.setRenderRate(15);
          const activeAnalyser = this.audioPlayer.getAnalyser();
          if (activeAnalyser) {
            this.character.attachLipSyncAnalyser(activeAnalyser);
            this.character.startLipSync();
            perfMetrics.addMetrics(runId, { lipSyncAnalyserConnected: 1, lipSyncActive: 1 });
          }
          this.setState("SPEAKING", "Đang nói...");
        },
        true,
        runId
      );
    } catch (error) {
      if (!this.isAbortError(error)) {
        this.events.onWarning("TTS không sẵn sàng, chat text vẫn tiếp tục.");
      }
    } finally {
      this.character.stopLipSync();
      this.character.setRenderRate(30);
      perfMetrics.addMetrics(runId, { lipSyncActive: 0, lipSyncNeutralAfterPlayback: 1 });
    }
  }

  private async returnIdle(): Promise<void> {
    if (this.states.state === "DISPOSED") {
      return;
    }
    this.safeTransition("IDLE");
    this.character.setRenderRate(30);
    this.events.onStatus(this.voiceSettings.enabled ? "Sẵn sàng." : "Đã tắt giọng.", "IDLE");
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
