import { describe, expect, it } from "vitest";
import { animationRegistry, resolveSafeAnimationId } from "./character.js";

describe("animation registry", () => {
  it("does not contain duplicate ids", () => {
    const ids = animationRegistry.map((animation) => animation.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back for invalid animation ids", () => {
    expect(resolveSafeAnimationId("../bad.vrma")).toBe("relax");
  });
});
