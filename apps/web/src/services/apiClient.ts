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
