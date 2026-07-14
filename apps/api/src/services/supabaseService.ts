import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ChatMessage, CompanionChatResponse } from "@anime-buddy/shared";
import type { ApiEnv } from "../config/env.js";

export interface PersistedSession {
  sessionId: string;
  warnings: string[];
}

export class SupabaseService {
  private readonly client: SupabaseClient | null;

  constructor(env: ApiEnv) {
    this.client = env.SUPABASE_URL && env.SUPABASE_SECRET_KEY
      ? createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          fetch: (url, options) => {
            const controller = new AbortController();
            const timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => controller.abort(), 10000);
            return fetch(url, { ...options, signal: controller.signal })
              .finally(() => clearTimeout(timeoutId));
          }
        }
      })
      : null;
  }

  isConfigured(): boolean {
    return Boolean(this.client);
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  async getOrCreateSession(input: {
    sessionId?: string;
    anonymousId: string;
    characterId: string;
  }): Promise<PersistedSession> {
    if (!this.client) {
      return { sessionId: input.sessionId ?? randomUUID(), warnings: ["Supabase is not configured"] };
    }

    try {
      if (input.sessionId) {
        const { data, error } = await this.client
          .from("chat_sessions")
          .select("id")
          .eq("id", input.sessionId)
          .eq("anonymous_id", input.anonymousId)
          .maybeSingle();

        if (error) {
          throw error;
        }
        if (data?.id) {
          return { sessionId: data.id, warnings: [] };
        }
      }

      const { data, error } = await this.client
        .from("chat_sessions")
        .insert({
          anonymous_id: input.anonymousId,
          character_id: input.characterId,
          title: null
        })
        .select("id")
        .single();

      if (error) {
        throw error;
      }

      return { sessionId: data.id, warnings: [] };
    } catch {
      return { sessionId: input.sessionId ?? randomUUID(), warnings: ["Supabase session persistence failed"] };
    }
  }

  async loadRecentMessages(sessionId: string, anonymousId: string, limit: number): Promise<ChatMessage[]> {
    if (!this.client) {
      return [];
    }

    try {
      const { data: session } = await this.client
        .from("chat_sessions")
        .select("id")
        .eq("id", sessionId)
        .eq("anonymous_id", anonymousId)
        .maybeSingle();

      if (!session?.id) {
        return [];
      }

      const { data, error } = await this.client
        .from("chat_messages")
        .select("role, content, emotion, animation, expression, created_at")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return (data ?? []).reverse().map((message) => ({
        role: message.role,
        content: message.content,
        emotion: message.emotion,
        animation: message.animation,
        expression: message.expression,
        createdAt: message.created_at
      }));
    } catch {
      return [];
    }
  }

  async saveUserMessage(sessionId: string, content: string): Promise<void> {
    await this.saveMessage({ sessionId, role: "user", content });
  }

  async saveAssistantMessage(sessionId: string, response: Omit<CompanionChatResponse, "sessionId" | "warnings">): Promise<void> {
    await this.saveMessage({
      sessionId,
      role: "assistant",
      content: response.reply,
      emotion: response.emotion,
      animation: response.animation,
      expression: response.expression
    });
  }

  async clearConversation(sessionId: string, anonymousId: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const { data: session } = await this.client
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("anonymous_id", anonymousId)
      .maybeSingle();

    if (!session?.id) {
      return false;
    }

    await this.client.from("chat_messages").delete().eq("session_id", sessionId);
    await this.client.from("chat_sessions").delete().eq("id", sessionId).eq("anonymous_id", anonymousId);
    return true;
  }

  async saveOwnedMessage(input: {
    sessionId: string;
    anonymousId: string;
    role: "user" | "assistant" | "system";
    content: string;
    emotion?: string;
    animation?: string;
    expression?: string;
  }): Promise<boolean> {
    if (!this.client) {
      return false;
    }

    const { data: session, error } = await this.client
      .from("chat_sessions")
      .select("id")
      .eq("id", input.sessionId)
      .eq("anonymous_id", input.anonymousId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (!session?.id) {
      return false;
    }

    await this.saveMessage({
      sessionId: input.sessionId,
      role: input.role,
      content: input.content,
      emotion: input.emotion,
      animation: input.animation,
      expression: input.expression
    });
    return true;
  }

  async saveMessage(input: {
    sessionId: string;
    role: "user" | "assistant" | "system";
    content: string;
    emotion?: string;
    animation?: string;
    expression?: string;
  }): Promise<void> {
    if (!this.client) {
      return;
    }

    const { error: messageError } = await this.client.from("chat_messages").insert({
      session_id: input.sessionId,
      role: input.role,
      content: input.content,
      emotion: input.emotion ?? null,
      animation: input.animation ?? null,
      expression: input.expression ?? null
    });
    if (messageError) {
      throw messageError;
    }

    const { error: sessionError } = await this.client
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", input.sessionId);
    if (sessionError) {
      throw sessionError;
    }
  }
}
