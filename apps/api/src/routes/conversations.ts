import type { FastifyInstance } from "fastify";
import { conversationParamsSchema, conversationQuerySchema } from "../schemas/apiSchemas.js";
import type { SupabaseService } from "../services/supabaseService.js";

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
}
