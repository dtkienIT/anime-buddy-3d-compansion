import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { ApiEnv } from "../config/env.js";

export async function registerRateLimit(app: FastifyInstance, env: ApiEnv): Promise<void> {
  await app.register(rateLimit, {
    global: false,
    max: env.CHAT_RATE_LIMIT_PER_MINUTE,
    timeWindow: "1 minute"
  });
}
