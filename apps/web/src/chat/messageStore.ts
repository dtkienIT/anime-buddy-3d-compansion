import type { LocalChatMessage } from "./types.js";
import { chatLimits } from "../config/constants.js";

const anonymousKey = "animeBuddy.anonymousId";
const sessionKey = "animeBuddy.sessionId";

export class MessageStore {
  private messages: LocalChatMessage[] = [];

  getAnonymousId(): string {
    const existing = localStorage.getItem(anonymousKey);
    if (existing) {
      return existing;
    }

    const next = crypto.randomUUID();
    localStorage.setItem(anonymousKey, next);
    return next;
  }

  getSessionId(): string | undefined {
    return localStorage.getItem(sessionKey) || undefined;
  }

  setSessionId(sessionId: string): void {
    localStorage.setItem(sessionKey, sessionId);
  }

  all(): LocalChatMessage[] {
    return [...this.messages];
  }

  setMessages(messages: LocalChatMessage[]): void {
    this.messages = [...messages];
    if (this.messages.length > chatLimits.maxLocalMessages) {
      this.messages.splice(0, this.messages.length - chatLimits.maxLocalMessages);
    }
  }

  add(message: Omit<LocalChatMessage, "id"> & { id?: string }): LocalChatMessage {
    const next = { ...message, id: message.id || crypto.randomUUID() };
    this.messages.push(next);
    if (this.messages.length > chatLimits.maxLocalMessages) {
      this.messages.splice(0, this.messages.length - chatLimits.maxLocalMessages);
    }
    return next;
  }

  clear(): void {
    this.messages = [];
  }

  clearSession(): void {
    localStorage.removeItem(sessionKey);
  }
}
