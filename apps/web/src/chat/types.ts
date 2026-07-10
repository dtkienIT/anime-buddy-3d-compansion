import type { CompanionChatResponse, ChatMessage } from "@anime-buddy/shared";

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
  onSpeech: (text: string, timeoutMs: number) => void;
}

export type CompanionReply = CompanionChatResponse;
