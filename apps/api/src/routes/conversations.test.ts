import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../middleware/errorHandler.js";
import type { SupabaseService } from "../services/supabaseService.js";
import { registerConversationRoutes } from "./conversations.js";

const sessionId = "00000000-0000-4000-8000-000000000001";

describe("offline conversation writes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists a queued message only through the owner-aware service path", async () => {
    const supabase = createSupabaseFixture({ saved: true });
    const app = await buildApp(supabase);

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${sessionId}/messages`,
      payload: {
        anonymousId: "anonymous-owner",
        role: "user",
        content: "Queued message"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(supabase.saveOwnedMessage).toHaveBeenCalledWith({
      sessionId,
      anonymousId: "anonymous-owner",
      role: "user",
      content: "Queued message",
      emotion: undefined,
      animation: undefined,
      expression: undefined
    });
    await app.close();
  });

  it("rejects a queued message without an anonymous owner", async () => {
    const supabase = createSupabaseFixture({ saved: true });
    const app = await buildApp(supabase);

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${sessionId}/messages`,
      payload: { role: "user", content: "Queued message" }
    });

    expect(response.statusCode).toBe(400);
    expect(supabase.saveOwnedMessage).not.toHaveBeenCalled();
    await app.close();
  });

  it("does not reveal or write a session owned by another anonymous user", async () => {
    const supabase = createSupabaseFixture({ saved: false });
    const app = await buildApp(supabase);

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${sessionId}/messages`,
      payload: {
        anonymousId: "anonymous-wrong-owner",
        role: "user",
        content: "Injected message"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Conversation not found" });
    await app.close();
  });

  it("returns a controlled unavailable response when persistence is not configured", async () => {
    const supabase = createSupabaseFixture({ configured: false, saved: false });
    const app = await buildApp(supabase);

    const response = await app.inject({
      method: "POST",
      url: `/api/conversations/${sessionId}/messages`,
      payload: {
        anonymousId: "anonymous-owner",
        role: "user",
        content: "Queued message"
      }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Conversation persistence unavailable" });
    expect(supabase.saveOwnedMessage).not.toHaveBeenCalled();
    await app.close();
  });
});

async function buildApp(supabase: ReturnType<typeof createSupabaseFixture>) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerConversationRoutes(app, supabase as unknown as SupabaseService);
  await app.ready();
  return app;
}

function createSupabaseFixture(options: { configured?: boolean; saved: boolean }) {
  return {
    isConfigured: vi.fn(() => options.configured ?? true),
    saveOwnedMessage: vi.fn(async () => options.saved),
    loadRecentMessages: vi.fn(async () => []),
    clearConversation: vi.fn(async () => true)
  };
}
