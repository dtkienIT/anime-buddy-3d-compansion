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

const conversationMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  emotion: z.enum(companionEmotions).nullable().optional(),
  animation: z.string().nullable().optional(),
  expression: z.enum(companionExpressions).nullable().optional()
});

const sessionSummarySchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  character_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string().nullable().optional()
});

const memoryRecordSchema = z.object({
  id: z.string(),
  content: z.string(),
  kind: z.string(),
  confidence: z.number().min(0).max(1).catch(0),
  character_id: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().nullable().optional()
});

export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type MemoryRecord = z.infer<typeof memoryRecordSchema>;

export interface ExportData {
  anonymousId: string;
  exportedAt: string;
  sessions: unknown[];
  memories: unknown[];
}

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
      throw new Error(readErrorMessage(payload) || `Chat request failed with ${response.status}`);
    }

    return chatResponseSchema.parse(payload);
  }

  async clearConversation(sessionId: string, anonymousId: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/conversations/${sessionId}?anonymousId=${encodeURIComponent(anonymousId)}`, {
      method: "DELETE"
    });
  }

  async loadConversation(sessionId: string, anonymousId: string): Promise<ConversationMessage[]> {
    const response = await fetch(`${this.baseUrl}/api/conversations?sessionId=${sessionId}&anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to load conversation: ${response.status}`);
    }
    const payload = z.object({ messages: z.array(conversationMessageSchema).default([]) }).parse(await response.json());
    return payload.messages;
  }

  // Session management
  async getSessions(anonymousId: string): Promise<SessionSummary[]> {
    const response = await fetch(`${this.baseUrl}/api/sessions?anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to get sessions: ${response.status}`);
    }
    const payload = z.object({ sessions: z.array(sessionSummarySchema).default([]) }).parse(await response.json());
    return payload.sessions;
  }

  async createSession(anonymousId: string, characterId: string): Promise<SessionSummary> {
    const response = await fetch(`${this.baseUrl}/api/sessions/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ anonymousId, characterId })
    });
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status}`);
    }
    const payload = z.object({ session: sessionSummarySchema }).parse(await response.json());
    return payload.session;
  }

  async renameSession(sessionId: string, anonymousId: string, title: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/sessions/${sessionId}?anonymousId=${encodeURIComponent(anonymousId)}`, {
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
  async getMemories(anonymousId: string, characterId?: string): Promise<MemoryRecord[]> {
    let url = `${this.baseUrl}/api/memories?anonymousId=${encodeURIComponent(anonymousId)}`;
    if (characterId) {
      url += `&characterId=${encodeURIComponent(characterId)}`;
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to get memories: ${response.status}`);
    }
    const payload = z.object({ memories: z.array(memoryRecordSchema).default([]) }).parse(await response.json());
    return payload.memories;
  }

  async updateMemory(memoryId: string, anonymousId: string, content: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories/${memoryId}?anonymousId=${encodeURIComponent(anonymousId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    if (!response.ok) {
      throw new Error(`Failed to update memory: ${response.status}`);
    }
  }

  async deleteMemory(memoryId: string, anonymousId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/memories/${memoryId}?anonymousId=${encodeURIComponent(anonymousId)}`, {
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
    const payload = z.object({ enabled: z.boolean() }).parse(await response.json());
    return payload.enabled;
  }

  // Export
  async exportData(anonymousId: string): Promise<ExportData> {
    const response = await fetch(`${this.baseUrl}/api/export?anonymousId=${encodeURIComponent(anonymousId)}`);
    if (!response.ok) {
      throw new Error(`Failed to export data: ${response.status}`);
    }
    return z.object({
      anonymousId: z.string(),
      exportedAt: z.string(),
      sessions: z.array(z.unknown()).default([]),
      memories: z.array(z.unknown()).default([])
    }).parse(await response.json());
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

async function readJson(response: Response): Promise<unknown> {
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

function readErrorMessage(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return undefined;
  const error = (payload as { error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}
