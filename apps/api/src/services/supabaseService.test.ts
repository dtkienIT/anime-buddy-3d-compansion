import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { ApiEnv } from "../config/env.js";
import { SupabaseService } from "./supabaseService.js";

const sessionId = "00000000-0000-4000-8000-000000000001";

describe("SupabaseService.saveOwnedMessage", () => {
  it("checks both session id and anonymous owner before refusing a write", async () => {
    const fixture = createFixture(false);

    await expect(fixture.service.saveOwnedMessage({
      sessionId,
      anonymousId: "anonymous-wrong-owner",
      role: "user",
      content: "Injected message"
    })).resolves.toBe(false);

    expect(fixture.ownershipFilters).toEqual([
      ["id", sessionId],
      ["anonymous_id", "anonymous-wrong-owner"]
    ]);
    expect(fixture.insertMessage).not.toHaveBeenCalled();
  });

  it("inserts only after the owner check succeeds", async () => {
    const fixture = createFixture(true);

    await expect(fixture.service.saveOwnedMessage({
      sessionId,
      anonymousId: "anonymous-owner",
      role: "user",
      content: "Queued message",
      emotion: "neutral"
    })).resolves.toBe(true);

    expect(fixture.ownershipFilters).toEqual([
      ["id", sessionId],
      ["anonymous_id", "anonymous-owner"]
    ]);
    expect(fixture.insertMessage).toHaveBeenCalledWith({
      session_id: sessionId,
      role: "user",
      content: "Queued message",
      emotion: "neutral",
      animation: null,
      expression: null
    });
  });
});

function createFixture(ownerExists: boolean) {
  const ownershipFilters: Array<[string, unknown]> = [];
  const insertMessage = vi.fn(async () => ({ data: null, error: null }));
  let sessionTableCalls = 0;

  const ownershipBuilder = {
    select: vi.fn(() => ownershipBuilder),
    eq: vi.fn((column: string, value: unknown) => {
      ownershipFilters.push([column, value]);
      return ownershipBuilder;
    }),
    maybeSingle: vi.fn(async () => ({
      data: ownerExists ? { id: sessionId } : null,
      error: null
    }))
  };
  const messageBuilder = { insert: insertMessage };
  const sessionUpdateBuilder = {
    update: vi.fn(() => sessionUpdateBuilder),
    eq: vi.fn(async () => ({ data: null, error: null }))
  };
  const client = {
    from: vi.fn((table: string) => {
      if (table === "chat_messages") return messageBuilder;
      if (table === "chat_sessions" && sessionTableCalls++ === 0) return ownershipBuilder;
      return sessionUpdateBuilder;
    })
  } as unknown as SupabaseClient;

  const service = new SupabaseService({
    SUPABASE_URL: "",
    SUPABASE_SECRET_KEY: ""
  } as ApiEnv);
  Object.defineProperty(service, "client", { value: client });

  return { service, ownershipFilters, insertMessage };
}
