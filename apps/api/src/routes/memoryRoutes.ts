import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MemoryService } from "../services/memoryService.js";

const memoriesQuerySchema = z.object({
  anonymousId: z.string().min(8).max(120),
  characterId: z.string().max(80).optional()
});

const updateMemorySchema = z.object({
  content: z.string().trim().min(1).max(500)
});

const toggleMemorySchema = z.object({
  anonymousId: z.string().min(8).max(120),
  enabled: z.boolean()
});

const createSessionSchema = z.object({
  anonymousId: z.string().min(8).max(120),
  characterId: z.string().min(1).max(80)
});

const renameSessionSchema = z.object({
  title: z.string().trim().min(1).max(100)
});

const sessionQuerySchema = z.object({
  anonymousId: z.string().min(8).max(120)
});

export function registerMemoryRoutes(
  app: FastifyInstance,
  supabase: SupabaseClient | null
): void {
  if (!supabase) {
    // Register stub routes or do nothing.
    return;
  }

  // GET /api/memories - Get user memories
  app.get("/api/memories", async (request, reply) => {
    const query = memoriesQuerySchema.parse(request.query);
    let dbQuery = supabase
      .from("conversation_memories")
      .select("*")
      .eq("anonymous_id", query.anonymousId)
      .eq("status", "active");

    if (query.characterId) {
      dbQuery = dbQuery.or(`character_id.is.null,character_id.eq.${query.characterId}`);
    }

    const { data, error } = await dbQuery.order("created_at", { ascending: false });
    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    return { memories: data || [] };
  });

  // PUT /api/memories/:id - Update memory content
  app.put("/api/memories/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = updateMemorySchema.parse(request.body);

    // Get previous content for audit log
    const { data: existing } = await supabase
      .from("conversation_memories")
      .select("content, anonymous_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      reply.status(404);
      return { error: "Memory not found" };
    }

    const { error } = await supabase
      .from("conversation_memories")
      .update({
        content: body.content,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    MemoryService.bumpMemoryVersion(existing.anonymous_id);

    // Write audit log
    await supabase.from("memory_audit_log").insert({
      memory_id: id,
      event_type: "updated",
      previous_content: existing.content,
      new_content: body.content
    });

    return { success: true };
  });

  // DELETE /api/memories/:id - Delete specific memory
  app.delete("/api/memories/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const { data: existing } = await supabase
      .from("conversation_memories")
      .select("content, anonymous_id")
      .eq("id", id)
      .maybeSingle();

    if (!existing) {
      reply.status(404);
      return { error: "Memory not found" };
    }

    const { error } = await supabase
      .from("conversation_memories")
      .update({
        status: "deleted",
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    MemoryService.bumpMemoryVersion(existing.anonymous_id);

    // Write audit log
    await supabase.from("memory_audit_log").insert({
      memory_id: id,
      event_type: "deleted",
      previous_content: existing.content
    });

    return { success: true };
  });

  // DELETE /api/memories - Delete all user memories
  app.delete("/api/memories", async (request, reply) => {
    const query = sessionQuerySchema.parse(request.query);

    const { error } = await supabase
      .from("conversation_memories")
      .update({
        status: "deleted",
        updated_at: new Date().toISOString()
      })
      .eq("anonymous_id", query.anonymousId)
      .eq("status", "active");

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    MemoryService.bumpMemoryVersion(query.anonymousId);
    return { success: true };
  });

  // GET /api/sessions - Get user chat sessions
  app.get("/api/sessions", async (request, reply) => {
    const query = sessionQuerySchema.parse(request.query);

    const { data, error } = await supabase
      .from("chat_sessions")
      .select("id, title, character_id, created_at, updated_at")
      .eq("anonymous_id", query.anonymousId)
      .order("updated_at", { ascending: false });

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    return { sessions: data || [] };
  });

  // POST /api/sessions/new - Create a new session
  app.post("/api/sessions/new", async (request, reply) => {
    const body = createSessionSchema.parse(request.body);

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        anonymous_id: body.anonymousId,
        character_id: body.characterId,
        title: "Cuộc trò chuyện mới"
      })
      .select("id, title, character_id, created_at, updated_at")
      .single();

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    return { session: data };
  });

  // PUT /api/sessions/:id - Rename a session
  app.put("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = renameSessionSchema.parse(request.body);

    const { error } = await supabase
      .from("chat_sessions")
      .update({
        title: body.title,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    return { success: true };
  });

  // DELETE /api/sessions/:id - Delete session and messages
  app.delete("/api/sessions/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = sessionQuerySchema.parse(request.query);

    // Verify session ownership
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", id)
      .eq("anonymous_id", query.anonymousId)
      .maybeSingle();

    if (!session) {
      reply.status(403);
      return { error: "Forbidden or session does not exist" };
    }

    // Cascade delete on messages should delete automatically due database foreign key `on delete cascade`.
    // But we delete explicitly just in case or to be safe.
    await supabase.from("chat_messages").delete().eq("session_id", id);

    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", id);

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    return { success: true };
  });

  // GET /api/export - Export messages and memories
  app.get("/api/export", async (request, reply) => {
    const query = sessionQuerySchema.parse(request.query);

    // Get all sessions
    const { data: sessions, error: sessionErr } = await supabase
      .from("chat_sessions")
      .select("id, title, character_id, created_at")
      .eq("anonymous_id", query.anonymousId);

    if (sessionErr) {
      reply.status(500);
      return { error: sessionErr.message };
    }

    const exportData: any = {
      anonymousId: query.anonymousId,
      exportedAt: new Date().toISOString(),
      sessions: []
    };

    for (const session of sessions || []) {
      const { data: messages } = await supabase
        .from("chat_messages")
        .select("role, content, emotion, animation, expression, created_at")
        .eq("session_id", session.id)
        .order("created_at", { ascending: true });

      exportData.sessions.push({
        id: session.id,
        title: session.title,
        characterId: session.character_id,
        createdAt: session.created_at,
        messages: messages || []
      });
    }

    // Get memories
    const { data: memories } = await supabase
      .from("conversation_memories")
      .select("kind, content, normalized_key, importance, confidence, created_at")
      .eq("anonymous_id", query.anonymousId)
      .eq("status", "active");

    exportData.memories = memories || [];

    return exportData;
  });

  // POST /api/memories/toggle - Toggle long term memory
  app.post("/api/memories/toggle", async (request, reply) => {
    const body = toggleMemorySchema.parse(request.body);

    const { data: pref } = await supabase
      .from("user_preferences")
      .select("id")
      .eq("anonymous_id", body.anonymousId)
      .maybeSingle();

    if (pref) {
      const { error } = await supabase
        .from("user_preferences")
        .update({
          memory_enabled: body.enabled,
          updated_at: new Date().toISOString()
        })
        .eq("anonymous_id", body.anonymousId);

      if (error) {
        reply.status(500);
        return { error: error.message };
      }
    } else {
      const { error } = await supabase
        .from("user_preferences")
        .insert({
          anonymous_id: body.anonymousId,
          memory_enabled: body.enabled
        });

      if (error) {
        reply.status(500);
        return { error: error.message };
      }
    }

    MemoryService.bumpMemoryVersion(body.anonymousId);
    return { success: true };
  });

  // GET /api/memories/toggle - Check memory enabled status
  app.get("/api/memories/toggle", async (request, reply) => {
    const query = sessionQuerySchema.parse(request.query);

    const { data: pref, error } = await supabase
      .from("user_preferences")
      .select("memory_enabled")
      .eq("anonymous_id", query.anonymousId)
      .maybeSingle();

    if (error) {
      reply.status(500);
      return { error: error.message };
    }

    return { enabled: pref ? pref.memory_enabled : true };
  });
}
