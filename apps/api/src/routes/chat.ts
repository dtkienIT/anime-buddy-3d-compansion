import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";
import { chatRequestSchema } from "../schemas/chatSchemas.js";
import type { CompanionAiService } from "../services/mistralService.js";
import type { SupabaseService } from "../services/supabaseService.js";
import { MemoryService } from "../services/memoryService.js";

export function registerChatRoute(
  app: FastifyInstance,
  env: ApiEnv,
  ai: CompanionAiService,
  supabase: SupabaseService
): void {
  const memoryService = new MemoryService(env, supabase.getClient());

  app.post("/api/chat", {
    config: {
      rateLimit: {
        max: env.CHAT_RATE_LIMIT_PER_MINUTE,
        timeWindow: "1 minute"
      }
    },
    bodyLimit: 32 * 1024
  }, async (request, reply) => {
    const requestStartedAt = performance.now();
    const body = chatRequestSchema.parse(request.body);

    // 1. Get/create session AND check if memory is enabled concurrently
    const sessionPromise = supabase.getOrCreateSession(body);
    const prefPromise = memoryService.isConfigured() && env.MEMORY_ENABLED
      ? supabase.getClient()!
          .from("user_preferences")
          .select("memory_enabled")
          .eq("anonymous_id", body.anonymousId)
          .maybeSingle()
          .catch((err) => {
            console.error("Failed to load user preferences:", err);
            return { data: null };
          })
      : Promise.resolve({ data: null });

    const [session, prefResult] = await Promise.all([sessionPromise, prefPromise]);
    const isMemoryEnabled = prefResult?.data ? prefResult.data.memory_enabled : true;

    // 2. Fetch history AND retrieve memory context concurrently
    const recentMessagesStartedAt = performance.now();
    const historyPromise = supabase.loadRecentMessages(
      session.sessionId,
      body.anonymousId,
      env.CHAT_MAX_CONTEXT_MESSAGES
    ).catch((err) => {
      console.error("Failed to load recent messages:", err);
      return [];
    });

    const memoriesStartedAt = performance.now();
    const memoryContextPromise = (isMemoryEnabled && memoryService.isConfigured() && env.MEMORY_ENABLED)
      ? memoryService.retrieveContext(
          body.anonymousId,
          body.characterId,
          session.sessionId,
          body.message
        )
      : Promise.resolve("");

    const [history, memoryContext] = await Promise.all([historyPromise, memoryContextPromise]);
    const recentMessagesCompletedAt = performance.now();
    const memoriesCompletedAt = performance.now();

    // 3. Save user message to database in the background (non-blocking)
    supabase.saveUserMessage(session.sessionId, body.message).catch((err) => {
      console.error("Failed to save user message in background:", err);
    });

    // 4. Call Mistral AI completion
    const mistralStartedAt = performance.now();
    const aiResponse = await ai.complete({
      message: body.message,
      history,
      availableAnimationIds: body.availableAnimations,
      sessionId: session.sessionId,
      memoryContext
    });
    const mistralCompletedAt = performance.now();

    // 5. Save assistant message to database in the background (non-blocking)
    supabase.saveAssistantMessage(session.sessionId, aiResponse).catch((err) => {
      console.error("Failed to save assistant message in background:", err);
    });

    // 6. Background memory extraction & summarization
    if (isMemoryEnabled && memoryService.isConfigured() && env.MEMORY_ENABLED) {
      void memoryService.extractMemories(
        session.sessionId,
        body.anonymousId,
        body.characterId,
        body.message,
        aiResponse.reply
      );
      void memoryService.triggerRollingSummary(session.sessionId, body.anonymousId);
    }

    const responseSentAt = performance.now();

    // Calculate timing metrics
    const recentMessagesMs = recentMessagesCompletedAt - recentMessagesStartedAt;
    const timings = memoryService.getLastTimings();
    const mistralMs = mistralCompletedAt - mistralStartedAt;
    const totalChatMs = responseSentAt - requestStartedAt;

    // Send Server-Timing headers
    const serverTiming = [
      `recent-history;dur=${recentMessagesMs.toFixed(1)}`,
      `memory-wall;dur=${timings.wallMs.toFixed(1)}`,
      `memory-db-memories;dur=${timings.memoriesMs.toFixed(1)}`,
      `memory-db-summary;dur=${timings.currentSummaryMs.toFixed(1)}`,
      `memory-db-past;dur=${timings.pastSummariesMs.toFixed(1)}`,
      `context-build;dur=${timings.contextBuildMs.toFixed(1)}`,
      `mistral;dur=${mistralMs.toFixed(1)}`,
      `total;dur=${totalChatMs.toFixed(1)}`
    ].join(", ");

    reply.header("Server-Timing", serverTiming);

    reply.send({
      sessionId: session.sessionId,
      ...aiResponse,
      warnings: session.warnings
    });
  });
}
