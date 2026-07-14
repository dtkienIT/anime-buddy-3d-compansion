import type { FastifyInstance } from "fastify";
import { conversationParamsSchema, conversationQuerySchema } from "../schemas/apiSchemas.js";
import type { SupabaseService } from "../services/supabaseService.js";
import { z } from "zod";

export function registerConversationRoutes(app: FastifyInstance, supabase: SupabaseService): void {
  app.get("/api/conversations", async (request) => {
    const query = conversationQuerySchema.parse(request.query);
    if (!query.sessionId) {
      return { messages: [] };
    }

    return {
      messages: await supabase.loadRecentMessages(query.sessionId, query.anonymousId, 50)
    };
  });

  app.delete("/api/conversations/:sessionId", async (request) => {
    const params = conversationParamsSchema.parse(request.params);
    const query = conversationQuerySchema.parse(request.query);
    const deleted = await supabase.clearConversation(params.sessionId, query.anonymousId);
    return { deleted };
  });

  app.post("/api/conversations/:sessionId/messages", async (request, reply) => {
    const params = conversationParamsSchema.parse(request.params);
    const body = z.object({
      anonymousId: z.string().min(8).max(120),
      role: z.enum(["user", "assistant", "system"]),
      content: z.string().trim().min(1).max(1200),
      emotion: z.string().optional(),
      animation: z.string().optional(),
      expression: z.string().optional()
    }).parse(request.body);

    if (!supabase.isConfigured()) {
      reply.status(503);
      return { error: "Conversation persistence unavailable" };
    }

    const saved = await supabase.saveOwnedMessage({
      sessionId: params.sessionId,
      anonymousId: body.anonymousId,
      role: body.role,
      content: body.content,
      emotion: body.emotion,
      animation: body.animation,
      expression: body.expression
    });

    if (!saved) {
      reply.status(404);
      return { error: "Conversation not found" };
    }

    return { success: true };
  });
}
