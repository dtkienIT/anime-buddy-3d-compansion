import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";
import { chatRequestSchema } from "../schemas/chatSchemas.js";
import type { CompanionAiService } from "../services/mistralService.js";
import type { SupabaseService } from "../services/supabaseService.js";

export function registerChatRoute(
  app: FastifyInstance,
  env: ApiEnv,
  ai: CompanionAiService,
  supabase: SupabaseService
): void {
  app.post("/api/chat", {
    config: {
      rateLimit: {
        max: env.CHAT_RATE_LIMIT_PER_MINUTE,
        timeWindow: "1 minute"
      }
    },
    bodyLimit: 32 * 1024
  }, async (request, reply) => {
    const body = chatRequestSchema.parse(request.body);
    const session = await supabase.getOrCreateSession(body);
    const history = await supabase.loadRecentMessages(
      session.sessionId,
      body.anonymousId,
      env.CHAT_MAX_CONTEXT_MESSAGES
    );

    await supabase.saveUserMessage(session.sessionId, body.message).catch(() => undefined);
    const aiResponse = await ai.complete({
      message: body.message,
      history,
      availableAnimationIds: body.availableAnimations,
      sessionId: session.sessionId
    });
    await supabase.saveAssistantMessage(session.sessionId, aiResponse).catch(() => undefined);

    reply.send({
      sessionId: session.sessionId,
      ...aiResponse,
      warnings: session.warnings
    });
  });
}
