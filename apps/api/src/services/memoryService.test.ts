import { describe, expect, it, vi, beforeEach } from "vitest";
import { MemoryService } from "./memoryService.js";
import type { ApiEnv } from "../config/env.js";

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
  TTS_REQUEST_TIMEOUT_MS: 120000,
  CHAT_MAX_CONTEXT_MESSAGES: 20,
  CHAT_RATE_LIMIT_PER_MINUTE: 2,
  TTS_RATE_LIMIT_PER_MINUTE: 2,
  DATA_RATE_LIMIT_PER_MINUTE: 60,
  RESPONSE_CACHE_ENABLED: false,
  RESPONSE_CACHE_BUCKET: "response-audio",
  RESPONSE_CACHE_SIMILARITY_THRESHOLD: 0.9,
  RESPONSE_CACHE_TOP_K: 3,
  MEMORY_ENABLED: true,
  MEMORY_RECENT_MESSAGE_LIMIT: 24,
  MEMORY_TOP_K: 8,
  MEMORY_SUMMARY_TRIGGER_MESSAGES: 2, // low threshold for testing
  MEMORY_SUMMARY_MAX_CHARS: 4000,
  MEMORY_MAX_CONTEXT_TOKENS: 6000,
  MEMORY_RETENTION_DAYS: 0,
  MEMORY_RETRIEVAL_TIMEOUT_MS: 700,
  MEMORY_EMBEDDINGS_ENABLED: false,
  MISTRAL_EMBEDDING_MODEL: ""
};

describe("MemoryService", () => {
  let mockSupabase: any;
  let service: MemoryService;

  beforeEach(() => {
    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      textSearch: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
      single: vi.fn().mockResolvedValue({ data: { id: "mock-id" } }),
      then: vi.fn().mockImplementation((resolve) => resolve({ data: [] }))
    };

    service = new MemoryService(env, mockSupabase as any);

    // Mock Mistral response format
    vi.mock("@mistralai/mistralai", () => {
      return {
        Mistral: vi.fn().mockImplementation(() => {
          return {
            chat: {
              complete: vi.fn().mockResolvedValue({
                choices: [
                  {
                    message: {
                      content: JSON.stringify({
                        memories: [
                          {
                            shouldRemember: true,
                            kind: "preference",
                            content: "User likes blue color.",
                            normalizedKey: "favoriteColor",
                            importance: 0.8,
                            confidence: 0.9,
                            explicitUserRequest: false,
                            sensitive: false
                          }
                        ],
                        forgetRequests: []
                      })
                    }
                  }
                ]
              })
            }
          };
        })
      };
    });
  });

  it("identifies if Supabase client is configured", () => {
    expect(service.isConfigured()).toBe(true);
    const emptyService = new MemoryService(env, null);
    expect(emptyService.isConfigured()).toBe(false);
  });

  it("retrieves context correctly", async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { rolling_summary: "User has introduced themselves." }
    });

    mockSupabase.order.mockReturnThis();
    mockSupabase.limit.mockResolvedValueOnce({
      data: [
        { id: "1", kind: "identity", content: "User name is Minh.", importance: 0.9, confidence: 1.0 }
      ]
    });

    const context = await service.retrieveContext("anon-1", "character-1", "session-1", "Tên mình là Minh");
    expect(context).toContain("[LONG-TERM MEMORY]");
    expect(context).toContain("User name is Minh");
    expect(context).toContain("[CURRENT SESSION SUMMARY]");
    expect(context).toContain("User has introduced themselves.");
  });

  it("handles extraction logic and calls Mistral", async () => {
    mockSupabase.eq.mockReturnThis();
    mockSupabase.maybeSingle.mockResolvedValueOnce({ data: null }); // existing active memory key

    mockSupabase.single.mockResolvedValueOnce({ data: { id: "new-memory-uuid" } }); // insert output

    // Call extraction
    await (service as any).extractMemoriesBackground("session-1", "anon-1", "mika", "Mình thích màu xanh", "Chào bạn");

    expect(mockSupabase.from).toHaveBeenCalledWith("conversation_memories");
    expect(mockSupabase.insert).toHaveBeenCalledWith(expect.objectContaining({
      anonymous_id: "anon-1",
      normalized_key: "favoriteColor",
      content: "User likes blue color."
    }));
  });
});
