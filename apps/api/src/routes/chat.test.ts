import type { SupabaseClient } from "@supabase/supabase-js";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../config/env.js";
import { registerErrorHandler } from "../middleware/errorHandler.js";
import type { CompanionAiService } from "../services/mistralService.js";
import type { SupabaseService } from "../services/supabaseService.js";
import type { ResponseCacheService } from "../services/responseCacheService.js";
import { registerChatRoute } from "./chat.js";

vi.mock("@mistralai/mistralai", () => ({
  Mistral: vi.fn(() => ({
    chat: {
      complete: vi.fn(async () => ({
        choices: [{ message: { content: JSON.stringify({ memories: [], forgetRequests: [] }) } }]
      }))
    }
  }))
}));

const env: ApiEnv = {
  NODE_ENV: "test",
  MISTRAL_API_KEY: "test-key",
  MISTRAL_MODEL: "test-model",
  MISTRAL_BASE_URL: "https://api.mistral.ai/v1",
  SUPABASE_URL: "https://test.supabase.co",
  SUPABASE_SECRET_KEY: "test-secret",
  API_HOST: "127.0.0.1",
  API_PORT: 3002,
  WEB_ORIGIN: "http://127.0.0.1:3001",
  TTS_SERVICE_URL: "http://127.0.0.1:8000",
  TTS_SERVICE_TOKEN: "",
  TTS_REQUEST_TIMEOUT_MS: 120000,
  CHAT_MAX_CONTEXT_MESSAGES: 20,
  CHAT_RATE_LIMIT_PER_MINUTE: 100,
  TTS_RATE_LIMIT_PER_MINUTE: 100,
  DATA_RATE_LIMIT_PER_MINUTE: 100,
  RESPONSE_CACHE_ENABLED: false,
  RESPONSE_CACHE_BUCKET: "response-audio",
  RESPONSE_CACHE_SIMILARITY_THRESHOLD: 0.9,
  RESPONSE_CACHE_TOP_K: 3,
  MEMORY_ENABLED: true,
  MEMORY_RECENT_MESSAGE_LIMIT: 24,
  MEMORY_TOP_K: 8,
  MEMORY_SUMMARY_TRIGGER_MESSAGES: 20,
  MEMORY_SUMMARY_MAX_CHARS: 4000,
  MEMORY_MAX_CONTEXT_TOKENS: 6000,
  MEMORY_RETENTION_DAYS: 0,
  MEMORY_RETRIEVAL_TIMEOUT_MS: 25,
  MEMORY_EMBEDDINGS_ENABLED: false,
  MISTRAL_EMBEDDING_MODEL: ""
};

interface QueryResult {
  data: unknown;
  error: null;
}

interface SupabaseFixtureOptions {
  preferences?: Record<string, boolean | boolean[]>;
  memoryDelayMs?: Record<string, number>;
  timeoutAnonymousIds?: Set<string>;
  cachedResponse?: {
    reply: string;
    emotion: "happy";
    animation: string;
    expression: "happy";
    intensity: number;
    voiceStyle: "friendly";
  };
  aiComplete?: ReturnType<typeof vi.fn>;
}

async function buildChatApp(options: SupabaseFixtureOptions = {}) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  const complete = options.aiComplete ?? vi.fn(async ({ memoryContext }) => ({
      reply: memoryContext ? "ok with memory" : "ok",
      emotion: "neutral" as const,
      animation: "relax",
      expression: "neutral" as const,
      intensity: 0.2,
      voiceStyle: "friendly" as const
    }));
  const ai: CompanionAiService = {
    complete
  };
  const supabase = createSupabaseService(options);
  const responseCache = options.cachedResponse ? {
    findReply: vi.fn(async () => options.cachedResponse),
    saveReply: vi.fn(async () => undefined)
  } as unknown as ResponseCacheService : undefined;
  registerChatRoute(app, env, ai, supabase, responseCache);
  await app.ready();
  return app;
}

function createSupabaseService(options: SupabaseFixtureOptions): SupabaseService {
  const preferenceCounts = new Map<string, number>();
  const client = {
    from: vi.fn((table: string) => createBuilder(table, options, preferenceCounts))
  } as unknown as SupabaseClient;

  return {
    isConfigured: () => true,
    getClient: () => client,
    getOrCreateSession: vi.fn(async (input: { sessionId?: string; anonymousId: string }) => ({
      sessionId: input.sessionId ?? `session-${input.anonymousId}`,
      warnings: []
    })),
    loadRecentMessages: vi.fn(async () => []),
    saveUserMessage: vi.fn(async () => undefined),
    saveAssistantMessage: vi.fn(async () => undefined)
  } as unknown as SupabaseService;
}

function createBuilder(
  table: string,
  options: SupabaseFixtureOptions,
  preferenceCounts: Map<string, number>
) {
  const filters = new Map<string, string>();
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      filters.set(column, String(value));
      return builder;
    }),
    neq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    or: vi.fn(() => builder),
    textSearch: vi.fn(() => builder),
    update: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => resolveSingle(table, filters, options, preferenceCounts)),
    single: vi.fn(async () => ({ data: { id: "memory-id" }, error: null })),
    then: (resolve: (value: QueryResult) => unknown, reject?: (reason: unknown) => unknown) => {
      return resolveQuery(table, filters, options).then(resolve, reject);
    }
  };
  return builder;
}

async function resolveSingle(
  table: string,
  filters: Map<string, string>,
  options: SupabaseFixtureOptions,
  preferenceCounts: Map<string, number>
): Promise<QueryResult> {
  if (table === "user_preferences") {
    const anonymousId = filters.get("anonymous_id") ?? "";
    const configured = options.preferences?.[anonymousId] ?? true;
    const count = preferenceCounts.get(anonymousId) ?? 0;
    preferenceCounts.set(anonymousId, count + 1);
    const enabled = Array.isArray(configured) ? configured[Math.min(count, configured.length - 1)] : configured;
    return { data: { memory_enabled: enabled }, error: null };
  }
  if (table === "chat_sessions") {
    return { data: { rolling_summary: "" }, error: null };
  }
  return { data: null, error: null };
}

async function resolveQuery(
  table: string,
  filters: Map<string, string>,
  options: SupabaseFixtureOptions
): Promise<QueryResult> {
  const anonymousId = filters.get("anonymous_id") ?? "";
  if (options.timeoutAnonymousIds?.has(anonymousId) && table !== "chat_messages") {
    return new Promise<QueryResult>(() => undefined);
  }

  const delayMs = options.memoryDelayMs?.[anonymousId] ?? 0;
  if (delayMs > 0 && (table === "conversation_memories" || table === "conversation_summaries")) {
    await delay(delayMs);
  }

  if (table === "conversation_memories") {
    return {
      data: [{
        id: `memory-${anonymousId || "anon"}`,
        kind: "identity",
        content: "User name is Nam.",
        importance: 0.9,
        confidence: 0.9,
        normalized_key: "userName"
      }],
      error: null
    };
  }
  return { data: [], error: null };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chatPayload(anonymousId: string) {
  return {
    anonymousId,
    characterId: "mika",
    message: "Please remember my name is Nam.",
    availableAnimations: ["relax"]
  };
}

function parseTiming(header: unknown) {
  const value = Array.isArray(header) ? header.join(",") : String(header ?? "");
  const timings = new Map<string, number>();
  for (const part of value.split(",")) {
    const match = part.trim().match(/^([^;]+);dur=([\d.]+)/);
    if (match) {
      timings.set(match[1], Number(match[2]));
    }
  }
  return timings;
}

describe("chat route memory Server-Timing", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an approved cache hit without calling the AI", async () => {
    const aiComplete = vi.fn();
    const cachedResponse = {
      reply: "Xin chao, rat vui duoc gap ban!",
      emotion: "happy" as const,
      animation: "greeting",
      expression: "happy" as const,
      intensity: 0.8,
      voiceStyle: "friendly" as const
    };
    const app = await buildChatApp({ cachedResponse, aiComplete });

    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { ...chatPayload("anonymous-cache"), message: "xin chao" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(cachedResponse);
    expect(aiComplete).not.toHaveBeenCalled();
    expect(response.headers["server-timing"]).toContain('response-cache;');
    expect(response.headers["server-timing"]).toContain('desc="HIT"');
    await app.close();
  });

  it("does not reuse enabled memory timings on a following disabled request", async () => {
    const anonymousId = "anonymous-toggle";
    const app = await buildChatApp({
      preferences: { [anonymousId]: [true, false] },
      memoryDelayMs: { [anonymousId]: 5 }
    });

    const enabled = await app.inject({ method: "POST", url: "/api/chat", payload: chatPayload(anonymousId) });
    const disabled = await app.inject({ method: "POST", url: "/api/chat", payload: chatPayload(anonymousId) });

    const enabledTiming = parseTiming(enabled.headers["server-timing"]);
    const disabledTiming = parseTiming(disabled.headers["server-timing"]);
    expect(enabledTiming.get("memory-db-memories")).toBeGreaterThan(0);
    expect(disabledTiming.get("memory-disabled")).toBe(0);
    expect(disabledTiming.get("memory-wall")).toBe(0);
    expect(disabledTiming.get("memory-db-memories")).toBe(0);
    expect(disabledTiming.get("memory-db-summary")).toBe(0);
    expect(disabledTiming.get("memory-db-past")).toBe(0);

    await app.close();
  }, 15000);

  it("keeps concurrent enabled and disabled request timings isolated", async () => {
    const slowId = "anonymous-concurrent-slow";
    const disabledId = "anonymous-concurrent-off";
    const app = await buildChatApp({
      preferences: { [slowId]: true, [disabledId]: false },
      memoryDelayMs: { [slowId]: 10 }
    });

    const [enabled, disabled] = await Promise.all([
      app.inject({ method: "POST", url: "/api/chat", payload: chatPayload(slowId) }),
      app.inject({ method: "POST", url: "/api/chat", payload: chatPayload(disabledId) })
    ]);

    const enabledTiming = parseTiming(enabled.headers["server-timing"]);
    const disabledTiming = parseTiming(disabled.headers["server-timing"]);
    expect(enabledTiming.get("memory-db-memories")).toBeGreaterThan(0);
    expect(disabledTiming.get("memory-disabled")).toBe(0);
    expect(disabledTiming.get("memory-db-memories")).toBe(0);

    await app.close();
  });

  it("does not leak timeout timing into a later normal request", async () => {
    const timeoutId = "anonymous-timeout";
    const normalId = "anonymous-normal";
    const app = await buildChatApp({
      preferences: { [timeoutId]: true, [normalId]: true },
      timeoutAnonymousIds: new Set([timeoutId]),
      memoryDelayMs: { [normalId]: 3 }
    });

    const timedOut = await app.inject({ method: "POST", url: "/api/chat", payload: chatPayload(timeoutId) });
    const normal = await app.inject({ method: "POST", url: "/api/chat", payload: chatPayload(normalId) });

    const timedOutTiming = parseTiming(timedOut.headers["server-timing"]);
    const normalTiming = parseTiming(normal.headers["server-timing"]);
    expect(timedOutTiming.get("memory-db-memories")).toBeGreaterThanOrEqual(env.MEMORY_RETRIEVAL_TIMEOUT_MS);
    expect(normalTiming.get("memory-db-memories")).toBeLessThan(timedOutTiming.get("memory-db-memories") ?? Infinity);
    expect(normalTiming.has("memory-disabled")).toBe(false);

    await app.close();
  });
});
