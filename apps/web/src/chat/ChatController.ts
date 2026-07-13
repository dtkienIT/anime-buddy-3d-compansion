import type { CompanionExpression } from "@anime-buddy/shared";
import { defaultAnimationId } from "@anime-buddy/shared";
import type { AudioPlayer } from "../audio/AudioPlayer.js";
import type { AudioQueue } from "../audio/AudioQueue.js";
import type { TtsClient } from "../audio/TtsClient.js";
import type { VoiceSettings } from "../audio/VoiceSettings.js";
import type { CharacterController } from "../character/CharacterController.js";
import type { ApiClient, ConversationMessage, ExportData, MemoryRecord, SessionSummary } from "../services/apiClient.js";
import { sanitizeAiText, splitIntoSpeechChunks } from "../utils/text.js";
import { toUserMessage } from "../utils/errors.js";
import { perfMetrics } from "../utils/PerformanceMetrics.js";
import { getAvailableAnimationIds } from "./promptBuilder.js";
import { ChatStateMachine } from "./chatStateMachine.js";
import { MessageStore } from "./messageStore.js";
import type { ChatControllerEvents, CompanionState, LocalChatMessage } from "./types.js";
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
    this.setState("IDLE", "Sẵn sàng");
  }

  setDataHandlers(
    onSessionsLoaded: (sessions: SessionSummary[]) => void,
    onHistoryLoaded: (messages: LocalChatMessage[], sessionId: string) => void
  ): void {
    this.events.onSessionsLoaded = onSessionsLoaded;
    this.events.onHistoryLoaded = onHistoryLoaded;
  }

  getAnonymousId(): string {
    return this.store.getAnonymousId();
  }

  getSessionId(): string | undefined {
    return this.store.getSessionId();
  }

  getSessions(): Promise<SessionSummary[]> {
    return this.api.getSessions(this.store.getAnonymousId());
  }

  getMemories(): Promise<MemoryRecord[]> {
    return this.api.getMemories(this.store.getAnonymousId());
  }

  exportData(): Promise<ExportData> {
    return this.api.exportData(this.store.getAnonymousId());
  }

  setMemoryEnabled(enabled: boolean): Promise<void> {
    return this.api.setMemoryEnabled(this.store.getAnonymousId(), enabled);
  }

  getMemoryEnabled(): Promise<boolean> {
    return this.api.getMemoryEnabled(this.store.getAnonymousId());
  }

  deleteAllMemories(): Promise<void> {
    return this.api.deleteAllMemories(this.store.getAnonymousId());
  }

  updateMemory(memoryId: string, content: string): Promise<void> {
    return this.api.updateMemory(memoryId, this.store.getAnonymousId(), content);
  }

  deleteMemory(memoryId: string): Promise<void> {
    return this.api.deleteMemory(memoryId, this.store.getAnonymousId());
  }

  async initializeHistory(): Promise<void> {
    const anonymousId = this.store.getAnonymousId();
    const operationId = ++this.operationSequence;
    this.lastReply = "";
    try {
      const sessions = await this.api.getSessions(anonymousId);
      if (operationId !== this.operationSequence) return;

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
        if (operationId !== this.operationSequence) return;

        const localMessages = messages.map(toLocalMessage);
        this.store.setMessages(localMessages);
        this.syncLastReply(localMessages);
        this.events.onHistoryLoaded?.(localMessages, sessionId);
      }

      // Try syncing any pending offline messages
      void this.syncOfflineMessages();
    } catch {
      if (operationId !== this.operationSequence) return;
      this.events.onWarning("Không thể tải lịch sử từ server. Chat offline.");
    }
  }

  async loadSession(sessionId: string): Promise<boolean> {
    const anonymousId = this.store.getAnonymousId();
    const operationId = this.beginContextSwitch();
    this.lastReply = "";
    this.setState("THINKING", "Tải cuộc trò chuyện...");
    try {
      const messages = await this.api.loadConversation(sessionId, anonymousId);
      if (operationId !== this.operationSequence) return false;

      const localMessages = messages.map(toLocalMessage);
      this.store.setSessionId(sessionId);
      this.store.setMessages(localMessages);
      this.syncLastReply(localMessages);
      this.events.onHistoryLoaded?.(localMessages, sessionId);
      this.setState("IDLE", "Sẵn sàng");
      return true;
    } catch {
      if (operationId !== this.operationSequence) return false;
      this.syncLastReply(this.store.all());
      this.setState("ERROR", "Lỗi tải cuộc trò chuyện");
      this.events.onWarning("Không thể tải cuộc trò chuyện này.");
      await this.returnIdle();
      return false;
    }
  }

  async createNewSession(): Promise<boolean> {
    const anonymousId = this.store.getAnonymousId();
    const characterId = this.character.getCurrentCharacterId();
    const operationId = this.beginContextSwitch();
    this.lastReply = "";
    this.setState("THINKING", "Đang tạo hội thoại mới...");
    try {
      const session = await this.api.createSession(anonymousId, characterId);
      if (operationId !== this.operationSequence) return false;

      this.store.setSessionId(session.id);
      this.store.clear();
      this.events.onHistoryLoaded?.([], session.id);

      try {
        const sessions = await this.api.getSessions(anonymousId);
        if (operationId !== this.operationSequence) return false;
        this.events.onSessionsLoaded?.(sessions);
      } catch {
        if (operationId !== this.operationSequence) return false;
        this.events.onWarning("Đã tạo hội thoại mới nhưng chưa thể làm mới danh sách.");
      }
      await this.returnIdle();
      return true;
    } catch {
      if (operationId !== this.operationSequence) return false;
      this.syncLastReply(this.store.all());
      this.events.onWarning("Không thể tạo cuộc trò chuyện mới.");
      await this.returnIdle();
      return false;
    }
  }

  async renameSession(sessionId: string, title: string): Promise<boolean> {
    try {
      await this.api.renameSession(sessionId, this.store.getAnonymousId(), title);
      const sessions = await this.api.getSessions(this.store.getAnonymousId());
      this.events.onSessionsLoaded?.(sessions);
      return true;
    } catch {
      this.events.onWarning("Không thể đổi tên cuộc trò chuyện.");
      return false;
    }
  }

  /** @deprecated Pass the selected session ID to renameSession instead. */
  async renameActiveSession(title: string): Promise<boolean> {
    const sessionId = this.store.getSessionId();
    if (!sessionId) return false;
    return await this.renameSession(sessionId, title);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const anonymousId = this.store.getAnonymousId();
    const deletingActiveSession = this.store.getSessionId() === sessionId;
    const operationId = deletingActiveSession
      ? this.beginContextSwitch()
      : this.operationSequence;

    if (deletingActiveSession) {
      this.lastReply = "";
      this.setState("THINKING", "Đang xóa hội thoại...");
    }

    try {
      await this.api.deleteSession(sessionId, anonymousId);
      if (deletingActiveSession && operationId !== this.operationSequence) return false;

      if (deletingActiveSession) {
        this.store.clearSession();
        this.store.clear();
        this.events.onHistoryLoaded?.([], "");
      }
      const sessions = await this.api.getSessions(anonymousId);
      if (deletingActiveSession && operationId !== this.operationSequence) return false;

      this.events.onSessionsLoaded?.(sessions);
      if (sessions.length > 0 && !this.store.getSessionId()) {
        await this.loadSession(sessions[0].id);
      } else if (deletingActiveSession) {
        await this.returnIdle();
      }
      return true;
    } catch {
      if (deletingActiveSession && operationId !== this.operationSequence) return false;
      if (deletingActiveSession) this.syncLastReply(this.store.all());
      this.events.onWarning("Không thể xóa cuộc trò chuyện.");
      if (deletingActiveSession) await this.returnIdle();
      return false;
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
    this.events.onStatus(settings.enabled ? "Sẵn sàng" : "Đã tắt giọng", this.states.state);
  }

  async setListening(active: boolean): Promise<void> {
    if (this.states.state === "DISPOSED") return;

    if (active) {
      if (this.states.state === "LISTENING") return;
      if (this.isBusy()) {
        this.beginContextSwitch();
      } else if (this.states.state !== "IDLE") {
        this.safeTransition("IDLE");
      }
      this.setState("LISTENING", "Đang nghe...");
      await this.character.playAnimation("listening", { loop: true }).catch(() => undefined);
      return;
    }

    if (this.states.state === "LISTENING") {
      await this.returnIdle();
    }
  }

  async send(message: string): Promise<void> {
    const normalized = sanitizeAiText(message, 600);
    if (!normalized) {
      return;
    }

    if (this.states.state === "BOOTING") {
      this.safeTransition("IDLE");
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

    const sessionId = this.store.getSessionId();
    const tempSessionId = sessionId || crypto.randomUUID();
    if (!sessionId) {
      this.store.setSessionId(tempSessionId);
    }

    let memoryStatusTimeout: ReturnType<typeof setTimeout> | null = null;
    try {
      await this.audioPlayer.resume().catch(() => undefined);
      if (operationId !== this.operationSequence) return;

      this.setState("THINKING", "Đang suy nghĩ...");

      memoryStatusTimeout = setTimeout(() => {
        if (operationId === this.operationSequence && this.states.state === "THINKING") {
          this.setState("THINKING", "Đang truy xuất ký ức...");
        }
      }, 300);

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
      this.character.setExpression(reply.expression as CompanionExpression, reply.intensity);

      if (this.voiceSettings.enabled) {
        await this.speak(cleanReply, runId, operationId);
      } else {
        this.events.onWarning("Đã tắt giọng nói.");
      }

      if (operationId !== this.operationSequence) return;
      this.setState("REACTING", "Đang phản ứng");
      await this.character.playAnimation(reply.animation, { loop: false, maxDurationMs: 7_000 });
      if (operationId === this.operationSequence) await this.returnIdle();
      perfMetrics.finish(runId, "completed");

      // Trigger background sync for any queued messages
      void this.syncOfflineMessages();
    } catch (error) {
      if (operationId !== this.operationSequence) return;

      if (this.isAbortError(error)) {
        await this.returnIdle();
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

      this.setState("ERROR", "Không thể kết nối");
      const messageText = toUserMessage(error);
      const systemMessage = this.store.add({ role: "system", content: `${messageText} (Chưa đồng bộ)` });
      this.events.onAssistantMessage(systemMessage);
      this.events.onWarning("Chưa đồng bộ. Đang hoạt động ở chế độ ngoại tuyến.");
      await this.character.playAnimation("sad", { loop: false }).catch(() => undefined);
      await this.returnIdle();
    } finally {
      if (memoryStatusTimeout) clearTimeout(memoryStatusTimeout);
      if (operationId === this.operationSequence) {
        this.activeAbort = null;
        this.activeRunId = 0;
      }
    }
  }

  async respondLocally(message: string, reply: string): Promise<boolean> {
    const normalized = sanitizeAiText(message, 600);
    const cleanReply = sanitizeAiText(reply, 600);
    if (!normalized || !cleanReply) {
      return false;
    }

    if (this.states.state === "BOOTING" || this.states.state === "LISTENING") {
      this.safeTransition("IDLE");
    }
    if (this.isBusy()) {
      this.cancelActive();
      this.safeTransition("IDLE");
    }

    const operationId = ++this.operationSequence;
    const runId = perfMetrics.start();
    this.activeRunId = runId;

    const userMessage = this.store.add({ role: "user", content: normalized });
    this.events.onUserMessage(userMessage);
    this.lastReply = cleanReply;
    const assistantMessage = this.store.add({
      role: "assistant",
      content: cleanReply,
      emotion: "happy",
      animation: "greeting"
    });
    this.events.onAssistantMessage(assistantMessage);
    perfMetrics.mark(runId, "replyRenderedAt");
    perfMetrics.mark(runId, "firstVisibleTextAt");

    await this.audioPlayer.resume().catch(() => undefined);
    if (operationId !== this.operationSequence) {
      perfMetrics.finish(runId, "cancelled");
      return false;
    }

    if (this.voiceSettings.enabled) {
      await this.speak(cleanReply, runId, operationId);
    }

    if (operationId !== this.operationSequence) {
      perfMetrics.finish(runId, "cancelled");
      return false;
    }

    this.safeTransition("IDLE");
    this.events.onStatus("Sẵn sàng trình diễn", "IDLE");
    perfMetrics.finish(runId, "completed");
    this.activeRunId = 0;
    return true;
  }

  cancelActive(): void {
    this.activeAbort?.abort();
    this.audioQueue.cancel();
    this.audioPlayer.stop();
    this.character.stopLipSync();
    const runId = this.activeRunId;
    this.activeRunId = 0;
    if (runId) {
      perfMetrics.mark(runId, "cancelledAt");
      perfMetrics.finish(runId, "cancelled");
    }
  }

  async stopSpeaking(): Promise<void> {
    ++this.operationSequence;
    this.cancelActive();
    await this.returnIdle();
  }

  replayLastReply(): void {
    if (!this.lastReply || !this.voiceSettings.enabled) {
      return;
    }

    const operationId = ++this.operationSequence;
    this.cancelActive();
    const runId = perfMetrics.start();
    this.activeRunId = runId;
    perfMetrics.mark(runId, "replyRenderedAt");
    perfMetrics.mark(runId, "firstVisibleTextAt");
    void this.speak(this.lastReply, runId, operationId).then(async () => {
      if (operationId !== this.operationSequence) return;
      await this.returnIdle();
      if (operationId === this.operationSequence) this.activeRunId = 0;
    });
  }

  async clear(): Promise<boolean> {
    const operationId = this.beginContextSwitch();
    const sessionId = this.store.getSessionId();
    const anonymousId = this.store.getAnonymousId();
    this.store.clear();
    this.lastReply = "";
    this.events.onStatus(this.voiceSettings.enabled ? "Sẵn sàng." : "Đã tắt giọng.", "IDLE");

    if (!sessionId) return true;

    try {
      await this.api.clearConversation(sessionId, anonymousId);
      return true;
    } catch {
      if (operationId === this.operationSequence) {
        this.events.onWarning("Đã xóa hội thoại trên thiết bị nhưng chưa thể đồng bộ với server.");
      }
      return false;
    }
  }

  private async speak(text: string, runId: number, operationId: number): Promise<void> {
    if (operationId !== this.operationSequence) return;

    this.setState("SPEAKING", "Đang chuẩn bị giọng...");
    this.character.setRenderRate(30);
    void this.character.playAnimation("talking", { loop: true }).catch(() => undefined);

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
          if (operationId !== this.operationSequence) return;

          this.character.setRenderRate(30);
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
      if (operationId === this.operationSequence && !this.isAbortError(error)) {
        this.events.onWarning("TTS không sẵn sàng, chat text vẫn tiếp tục.");
      }
    } finally {
      if (operationId === this.operationSequence) {
        this.character.stopLipSync();
        this.character.setRenderRate(30);
        perfMetrics.addMetrics(runId, { lipSyncActive: 0, lipSyncNeutralAfterPlayback: 1 });
      }
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

  private beginContextSwitch(): number {
    const operationId = ++this.operationSequence;
    this.cancelActive();
    this.safeTransition("IDLE");
    void this.character.playAnimation(defaultAnimationId, { loop: true }).catch(() => undefined);
    return operationId;
  }

  private syncLastReply(messages: LocalChatMessage[]): void {
    this.lastReply = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.content.trim())
      ?.content.trim() ?? "";
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

function toLocalMessage(message: ConversationMessage): LocalChatMessage {
  return {
    role: message.role,
    content: message.content,
    emotion: message.emotion || undefined,
    animation: message.animation || undefined,
    expression: message.expression || undefined,
    id: message.id || crypto.randomUUID()
  };
}
