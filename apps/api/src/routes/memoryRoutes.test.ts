import type { SupabaseClient } from "@supabase/supabase-js";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerErrorHandler } from "../middleware/errorHandler.js";
import { registerMemoryRoutes } from "./memoryRoutes.js";

interface SessionQueryResult {
  data: unknown[] | null;
  error: { code?: string; message?: string; status?: number } | null;
}

async function buildApp(supabase: SupabaseClient | null, timeoutMs = 50) {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  registerMemoryRoutes(app, supabase, { sessionQueryTimeoutMs: timeoutMs });
  await app.ready();
  return app;
}

function createSessionsSupabase(runQuery: () => Promise<SessionQueryResult>) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => runQuery());

  const client = {
    from: vi.fn(() => builder)
  } as unknown as SupabaseClient;

  return { client };
}

describe("memory routes sessions endpoint", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns sessions for a valid anonymous id", async () => {
    const sessions = [{
      id: "session-1",
      title: "Hello",
      character_id: "mika",
      created_at: "2026-07-10T00:00:00.000Z",
      updated_at: "2026-07-10T00:01:00.000Z"
    }];
    const { client } = createSessionsSupabase(async () => ({ data: sessions, error: null }));
    const app = await buildApp(client);

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions?anonymousId=anonymous-test"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessions });
    await app.close();
  });

  it("returns 400 when anonymousId is missing", async () => {
    const { client } = createSessionsSupabase(async () => ({ data: [], error: null }));
    const app = await buildApp(client);

    const response = await app.inject({ method: "GET", url: "/api/sessions" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "Invalid request" });
    await app.close();
  });

  it("returns 503 when Supabase is not configured", async () => {
    const app = await buildApp(null);

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions?anonymousId=anonymous-test"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Supabase is not configured" });
    await app.close();
  });

  it("returns 503 when Supabase reports an error", async () => {
    const { client } = createSessionsSupabase(async () => ({
      data: null,
      error: { code: "PGRST000", message: "database unavailable", status: 503 }
    }));
    const app = await buildApp(client);

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions?anonymousId=anonymous-test"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Session list unavailable" });
    await app.close();
  });

  it("returns 503 when the Supabase query times out", async () => {
    const { client } = createSessionsSupabase(() => new Promise<SessionQueryResult>(() => undefined));
    const app = await buildApp(client, 5);

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions?anonymousId=anonymous-test"
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Session list timed out" });
    await app.close();
  });

  it("returns an empty list when no sessions exist", async () => {
    const { client } = createSessionsSupabase(async () => ({ data: [], error: null }));
    const app = await buildApp(client);

    const response = await app.inject({
      method: "GET",
      url: "/api/sessions?anonymousId=anonymous-test"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ sessions: [] });
    await app.close();
  });
});
