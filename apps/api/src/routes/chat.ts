import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";
import { chatRequestSchema } from "../schemas/chatSchemas.js";
import type { CompanionAiService } from "../services/mistralService.js";
import type { SupabaseService } from "../services/supabaseService.js";
import { createMemoryTimings, MemoryService, type MemoryContextResult } from "../services/memoryService.js";
import type { ResponseCacheService } from "../services/responseCacheService.js";

export function registerChatRoute(
  app: FastifyInstance,
  env: ApiEnv,
  ai: CompanionAiService,
  supabase: SupabaseService,
  _responseCache?: ResponseCacheService
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

    // 1. Get/create session AND check if memory is enabled concurrently.
    let preferencesMs = 0;
    const sessionPromise = supabase.getOrCreateSession(body);
    const prefPromise = memoryService.isConfigured() && env.MEMORY_ENABLED
      ? (async () => {
          const startedAt = performance.now();
          try {
            return await supabase.getClient()!
              .from("user_preferences")
              .select("memory_enabled")
              .eq("anonymous_id", body.anonymousId)
              .maybeSingle();
          } catch (err: unknown) {
            console.error("Failed to load user preferences:", err);
            return { data: null };
          } finally {
            preferencesMs = performance.now() - startedAt;
          }
        })()
      : Promise.resolve({ data: null });

    const [session, prefResult] = await Promise.all([sessionPromise, prefPromise]);
    const isMemoryEnabled = prefResult?.data ? prefResult.data.memory_enabled : true;

    // Text replies are context-dependent and may contain user-specific memory.
    // Keep response audio caching available through the TTS route, but never
    // reuse or persist complete chat replies across sessions/users here.

    // 2. Fetch history AND retrieve memory context concurrently.
    let recentMessagesMs = 0;
    const recentMessagesStartedAt = performance.now();
    const historyPromise = (async () => {
      try {
        return await supabase.loadRecentMessages(
          session.sessionId,
          body.anonymousId,
          env.CHAT_MAX_CONTEXT_MESSAGES
        );
      } catch (err: unknown) {
        console.error("Failed to load recent messages:", err);
        return [];
      } finally {
        recentMessagesMs = performance.now() - recentMessagesStartedAt;
      }
    })();

    const shouldRetrieveMemory = isMemoryEnabled && memoryService.isConfigured() && env.MEMORY_ENABLED;
    const memoryContextPromise: Promise<MemoryContextResult> = shouldRetrieveMemory
      ? memoryService.retrieveContextWithTimings(
          body.anonymousId,
          body.characterId,
          session.sessionId,
          body.message
        )
      : Promise.resolve({ context: "", timings: createMemoryTimings() });

    const [history, memoryResult] = await Promise.all([historyPromise, memoryContextPromise]);
    const memoryContext = memoryResult.context;
    const memoryTimings = memoryResult.timings;

    // 3. Save user message to database in the background (non-blocking)
    supabase.saveUserMessage(session.sessionId, body.message).catch((err: unknown) => {
      console.error("Failed to save user message in background:", err);
    });

    // 4. Call Mistral AI completion
    const mistralStartedAt = performance.now();
    const aiResponse = await ai.complete({
      message: body.message,
      characterId: body.characterId,
      history,
      availableAnimationIds: body.availableAnimations,
      sessionId: session.sessionId,
      memoryContext
    });
    const mistralCompletedAt = performance.now();

    // 5. Save assistant message to database in the background (non-blocking)
    supabase.saveAssistantMessage(session.sessionId, aiResponse).catch((err: unknown) => {
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
    const mistralMs = mistralCompletedAt - mistralStartedAt;
    const totalChatMs = responseSentAt - requestStartedAt;

    // Send Server-Timing headers
    const timingParts = [
      `recent-history;dur=${recentMessagesMs.toFixed(1)}`,
      `preferences;dur=${preferencesMs.toFixed(1)}`,
      `memory-wall;dur=${memoryTimings.wallMs.toFixed(1)}`,
      `memory-db-memories;dur=${memoryTimings.memoriesMs.toFixed(1)}`,
      `memory-db-general;dur=${memoryTimings.generalMemoriesMs.toFixed(1)}`,
      `memory-db-matched;dur=${memoryTimings.matchedMemoriesMs.toFixed(1)}`,
      `memory-db-deleted;dur=${memoryTimings.deletedMemoriesMs.toFixed(1)}`,
      `memory-db-summary;dur=${memoryTimings.currentSummaryMs.toFixed(1)}`,
      `memory-db-past;dur=${memoryTimings.pastSummariesMs.toFixed(1)}`,
      `context-build;dur=${memoryTimings.contextBuildMs.toFixed(1)}`,
      `memory-timeouts;desc="${memoryTimings.timeoutCount}"`,
      `memory-fallbacks;desc="${memoryTimings.fallbackCount}"`,
      `memory-cache-hits;desc="${memoryTimings.cacheHitCount}"`,
      'response-cache;dur=0;desc="BYPASS"',
      `mistral;dur=${mistralMs.toFixed(1)}`,
      `total;dur=${totalChatMs.toFixed(1)}`
    ];
    if (!shouldRetrieveMemory) {
      timingParts.splice(2, 0, "memory-disabled;dur=0");
    }
    const serverTiming = timingParts.join(", ");

    reply.header("Server-Timing", serverTiming);

    reply.send({
      sessionId: session.sessionId,
      ...aiResponse,
      warnings: session.warnings
    });
  });
}
