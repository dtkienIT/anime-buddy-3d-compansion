import { describe, expect, it } from "vitest";
import { getPerformanceById, performanceRegistry, toPerformanceCatalogItem } from "./performance.js";

describe("performance registry", () => {
  it("keeps every local performance uniquely addressable with a dedicated stage", () => {
    expect(performanceRegistry).toHaveLength(4);
    expect(new Set(performanceRegistry.map((performance) => performance.id)).size).toBe(4);
    expect(new Set(performanceRegistry.map((performance) => performance.stageTheme)).size).toBe(4);
  });

  it("keeps local asset paths out of the public catalog response", () => {
    const catalog = toPerformanceCatalogItem(performanceRegistry[0]);
    expect(catalog).not.toHaveProperty("audioUrl");
    expect(catalog).not.toHaveProperty("animationUrl");
    expect(catalog).toMatchObject({
      id: "bling-bang-bang-born",
      stageTheme: "neon-cube",
      mediaMode: "local-audio"
    });
  });

  it("returns undefined for unknown performance ids", () => {
    expect(getPerformanceById("missing")).toBeUndefined();
  });

  it("pairs the BOOTH motion with the first-party Golden Wheatlight soundtrack", () => {
    expect(getPerformanceById("ui-mugibatake-dance")).toMatchObject({
      animationUrl: "/animations/UiMugibatake.vrma",
      audioUrl: "/audio/music/Golden-Wheatlight-Original.mp3",
      durationSeconds: 26.8,
      stageTheme: "wheat-field"
    });
    expect(toPerformanceCatalogItem(getPerformanceById("ui-mugibatake-dance")!)).toMatchObject({
      mediaMode: "local-audio"
    });
  });
});
