import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UiPreferencesStore } from "./UiPreferences.js";

describe("UiPreferencesStore", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    });
    vi.stubGlobal("window", {
      innerWidth: 1440,
      matchMedia: vi.fn(() => ({ matches: false }))
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("persists companion and experience preferences", () => {
    const store = new UiPreferencesStore();
    expect(store.current.chatCollapsed).toBe(false);
    store.update({ characterId: "luna", backgroundId: "cozy-night", chatCollapsed: true, reducedMotion: true });

    expect(new UiPreferencesStore().current).toMatchObject({
      characterId: "luna",
      backgroundId: "cozy-night",
      chatCollapsed: true,
      reducedMotion: true
    });
  });

  it("recovers safely from invalid stored JSON", () => {
    localStorage.setItem("animeBuddy.uiPreferences.v2", "{");
    expect(new UiPreferencesStore().current.welcomeSeen).toBe(false);
  });
});
