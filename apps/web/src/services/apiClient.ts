import { z } from "zod";
import { companionEmotions, companionExpressions } from "@anime-buddy/shared";
import { env } from "../config/env.js";
import type { CompanionReply } from "../chat/types.js";

const chatResponseSchema = z.object({
  sessionId: z.string().uuid(),
  reply: z.string().trim().min(1),
  emotion: z.enum(companionEmotions),
  animation: z.string().trim().min(1),
  expression: z.enum(companionExpressions),
  intensity: z.number().min(0).max(1),
  voiceStyle: z.enum(["friendly", "calm", "energetic", "soft"]),
  warnings: z.array(z.string()).default([])
});

export interface SendChatInput {
  sessionId?: string;
  anonymousId: string;
  characterId: string;
  message: string;
  availableAnimations: string[];
  signal?: AbortSignal;
}

export class ApiClient {
  constructor(private readonly baseUrl = env.apiBaseUrl) {}

  async sendChat(input: SendChatInput): Promise<CompanionReply> {
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: input.sessionId,
        anonymousId: input.anonymousId,
        characterId: input.characterId,
        message: input.message,
        availableAnimations: input.availableAnimations
      }),
      signal: input.signal
    });

    const payload = await readJson(response);
    if (!response.ok) {
      throw new Error(payload?.error || `Chat request failed with ${response.status}`);
    }

    return chatResponseSchema.parse(payload);
  }

  async clearConversation(sessionId: string, anonymousId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/conversations/${sessionId}?anonymousId=${encodeURIComponent(anonymousId)}`, {
      method: "DELETE"
    });
  }

  async loadConversation(sessionId: string, anonymousId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations?sessionId=${sessionId}&anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to load conversation: ${response.status}`);
    }
    const payload = await response.json();
    return payload.messages || [];
  }

  // Session management
  async getSessions(anonymousId: string): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/sessions?anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to get sessions: ${response.status}`);
    }
    const payload = await response.json();
    return payload.sessions || [];
  }

  async createSession(anonymousId: string, characterId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/sessions/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId, characterId })
    });
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }
    const payload = await response.json();
    return payload.session;
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title })
    });
    if (!response.ok) {
      throw new Error(`Failed to rename session: ${response.status}`);
    }
  }

  async deleteSession(sessionId: string, anonymousId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}?anonymousId=${encodeURIComponent(anonymousId)}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw new Error(`Failed to delete session: ${response.status}`);
    }
  }

  // Memory management
  async getMemories(anonymousId: string, characterId?: string): Promise<any[]> {
    let url = `${this.baseUrl}/api/memories?anonymousId=${encodeURIComponent(anonymousId)}`;
    if (characterId) {
      url += `&characterId=${encodeURIComponent(characterId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to get memories: ${response.status}`);
    }
    const payload = await response.json();
    return payload.memories || [];
  }

  async updateMemory(memoryId: string, content: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories/${memoryId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!response.ok) {
      throw new Error(`Failed to update memory: ${response.status}`);
    }
  }

  async deleteMemory(memoryId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories/${memoryId}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw new Error(`Failed to delete memory: ${response.status}`);
    }
  }

  async deleteAllMemories(anonymousId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories?anonymousId=${encodeURIComponent(anonymousId)}`, {
      method: "DELETE"
    });
    if (!response.ok) {
      throw new Error(`Failed to delete all memories: ${response.status}`);
    }
  }

  // Memory toggle
  async setMemoryEnabled(anonymousId: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId, enabled })
    });
    if (!response.ok) {
      throw new Error(`Failed to set memory toggle: ${response.status}`);
    }
  }

  async getMemoryEnabled(anonymousId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/api/memories/toggle?anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to get memory toggle: ${response.status}`);
    }
    const payload = await response.json();
    return payload.enabled;
  }

  // Export
  async exportData(anonymousId: string): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/export?anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to export data: ${response.status}`);
    }
    return response.json();
  }

  async saveOfflineMessage(sessionId: string, message: {
    role: "user" | "assistant" | "system";
    content: string;
    emotion?: string;
    animation?: string;
    expression?: string;
  }): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/conversations/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    if (!response.ok) {
      throw new Error(`Failed to save offline message: ${response.status}`);
    }
  }
}

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Backend returned invalid JSON");
  }
}
