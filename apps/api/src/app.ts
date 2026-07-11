import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import type { ApiEnv } from "./config/env.js";
import { getEnv } from "./config/env.js";
import { registerErrorHandler } from "./middleware/errorHandler.js";
import { registerRateLimit } from "./middleware/rateLimit.js";
import { registerRequestLogger } from "./middleware/requestLogger.js";
import { MistralService, type CompanionAiService } from "./services/mistralService.js";
import { SupabaseService } from "./services/supabaseService.js";
import { TtsService } from "./services/ttsService.js";
import { registerChatRoute } from "./routes/chat.js";
import { registerConversationRoutes } from "./routes/conversations.js";
import { registerHealthRoute } from "./routes/health.js";
import { registerTtsRoute } from "./routes/tts.js";
import { registerMemoryRoutes } from "./routes/memoryRoutes.js";


export interface AppServices {
  ai?: CompanionAiService;
  supabase?: SupabaseService;
  tts?: TtsService;
}

export async function createApp(env: ApiEnv = getEnv(), services: AppServices = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "MISTRAL_API_KEY", "SUPABASE_SECRET_KEY"]
    },
    bodyLimit: 64 * 1024,
    requestTimeout: 120000
  });

  await app.register(cors, {
    exposedHeaders: [
      "Server-Timing",
      "X-TTS-Cache",
      "X-TTS-Synthesis-Ms",
      "X-TTS-Queue-Ms",
      "X-TTS-Engine-Warm",
      "X-Audio-Format",
      "X-Audio-Sample-Rate",
      "X-Audio-Channels",
      "X-Audio-Bytes-Per-Sample"
    ],
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowed = origin === env.WEB_ORIGIN || (env.NODE_ENV !== "production" && /^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin));
      callback(allowed ? null : new Error("CORS origin is not allowed"), allowed);
    }
  });

  registerErrorHandler(app);
  registerRequestLogger(app);
  await registerRateLimit(app, env);

  const supabase = services.supabase ?? new SupabaseService(env);
  const tts = services.tts ?? new TtsService(env);
  const ai = services.ai ?? new MistralService(env);

  registerHealthRoute(app, env, supabase, tts);
  registerChatRoute(app, env, ai, supabase);
  registerTtsRoute(app, env, tts);
  registerConversationRoutes(app, supabase);
  registerMemoryRoutes(app, supabase.getClient(), { rateLimitMax: env.DATA_RATE_LIMIT_PER_MINUTE });

  return app;
}
