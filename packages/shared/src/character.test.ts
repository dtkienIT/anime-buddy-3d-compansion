import { describe, expect, it } from "vitest";
import { animationRegistry, characterRegistry, resolveSafeAnimationId } from "./character.js";

describe("animation registry", () => {
  it("does not contain duplicate ids", () => {
    const ids = animationRegistry.map((animation) => animation.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("falls back for invalid animation ids", () => {
    expect(resolveSafeAnimationId("../bad.vrma")).toBe("relax");
  });

  it("registers subtle prop-free conversational reactions", () => {
    for (const id of ["gentle-gesture", "curious-tilt"]) {
      const animation = animationRegistry.find((item) => item.id === id);
      expect(animation).toMatchObject({
        loop: false,
        category: "reaction",
        chatEligible: true,
        fallbackId: "relax"
      });
      expect(animation?.requiresProp).not.toBe(true);
    }
  });

  it("registers the owner-downloaded BOOTH dance as a standalone motion", () => {
    expect(animationRegistry.find((item) => item.id === "ui-mugibatake-dance")).toMatchObject({
      url: "/animations/UiMugibatake.vrma",
      loop: false,
      category: "reaction",
      chatEligible: false,
      fallbackId: "relax"
    });
  });

  it("registers the Happy Synthesizer BOOTH dance as a standalone motion", () => {
    expect(animationRegistry.find((item) => item.id === "happy-synthesizer-stage")).toMatchObject({
      url: "/animations/Happy-Synthesizer.vrma",
      loop: false,
      category: "reaction",
      chatEligible: false,
      fallbackId: "relax"
    });
  });
});

describe("character registry", () => {
  it("gives every selectable companion a distinct conversational persona", () => {
    expect(characterRegistry.every((character) => Boolean(character.persona?.trim()))).toBe(true);
    expect(new Set(characterRegistry.map((character) => character.persona)).size).toBe(characterRegistry.length);
  });
});
