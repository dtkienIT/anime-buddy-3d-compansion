import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";
import type { SupabaseService } from "../services/supabaseService.js";
import type { TtsService } from "../services/ttsService.js";

export function registerHealthRoute(
  app: FastifyInstance,
  env: ApiEnv,
  supabase: SupabaseService,
  tts: TtsService
): void {
  app.get("/health", async () => ({
    status: "ok",
    mistralConfigured: Boolean(env.MISTRAL_API_KEY),
    supabaseConfigured: supabase.isConfigured(),
    ttsReachable: await tts.health()
  }));
}
