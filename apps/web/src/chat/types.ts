import type { CompanionChatResponse, ChatMessage } from "@anime-buddy/shared";
import type { SessionSummary } from "../services/apiClient.js";

export type CompanionState =
  | "BOOTING"
  | "IDLE"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "REACTING"
  | "ERROR"
  | "DISPOSED";

export interface LocalChatMessage extends ChatMessage {
  id: string;
}

export interface ChatControllerEvents {
  onUserMessage: (message: LocalChatMessage) => void;
  onAssistantMessage: (message: LocalChatMessage) => void;
  onStatus: (status: string, state: CompanionState) => void;
  onWarning: (message: string) => void;
  onSessionsLoaded?: (sessions: SessionSummary[]) => void;
  onHistoryLoaded?: (messages: LocalChatMessage[], sessionId: string) => void;
}

export type CompanionReply = CompanionChatResponse;
