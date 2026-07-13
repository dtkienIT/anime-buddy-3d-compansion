import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient } from "./apiClient.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("ApiClient.clearConversation", () => {
  it("rejects a failed delete instead of reporting an optimistic success", async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      error: "Conversation could not be cleared"
    }), {
      status: 503,
      headers: { "content-type": "application/json" }
    })) as typeof fetch;

    await expect(new ApiClient("http://api.test").clearConversation(
      "session/with spaces",
      "anonymous-1"
    )).rejects.toThrow("Conversation could not be cleared");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://api.test/api/conversations/session%2Fwith%20spaces?anonymousId=anonymous-1",
      { method: "DELETE" }
    );
  });

  it("resolves only when the backend accepts the delete", async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch;

    await expect(new ApiClient("http://api.test").clearConversation(
      "session-1",
      "anonymous-1"
    )).resolves.toBeUndefined();
  });
});
