import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MISTRAL_API_KEY: z.string().min(1, "MISTRAL_API_KEY is required"),
  MISTRAL_MODEL: z.string().min(1).default("mistral-small-latest"),
  MISTRAL_BASE_URL: z.string().url().default("https://api.mistral.ai/v1"),
  SUPABASE_URL: z.string().url().optional().or(z.literal("")),
  SUPABASE_SECRET_KEY: z.string().optional().or(z.literal("")),
  API_HOST: z.string().min(1).default("127.0.0.1"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  WEB_ORIGIN: z.string().url().default("http://127.0.0.1:3001"),
  TTS_SERVICE_URL: z.string().url().default("http://127.0.0.1:8000"),
  CHAT_MAX_CONTEXT_MESSAGES: z.coerce.number().int().min(1).max(50).default(20),
  CHAT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20),
  TTS_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(20)
});

export type ApiEnv = z.infer<typeof envSchema>;

let cachedEnv: ApiEnv | null = null;

export function getEnv(): ApiEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  loadEnvFiles();
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(formatEnvErrors(parsed.error));
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}

function loadEnvFiles(): void {
  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(process.cwd(), "../../../.env")
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate, override: false });
    }
  }
}

function formatEnvErrors(error: z.ZodError): string {
  const messages = error.issues.map((issue) => `${issue.path.join(".") || "ENV"}: ${issue.message}`);
  return `Invalid environment configuration: ${messages.join("; ")}`;
}
