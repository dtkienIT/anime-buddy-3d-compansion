import { describe, expect, it } from "vitest";
import { sanitizeAiText } from "./text.js";

describe("sanitizeAiText", () => {
  it("removes dangerous html instead of rendering it", () => {
    expect(sanitizeAiText("<img src=x onerror=alert(1)>hello<script>x()</script>")).toBe("hello");
  });
});
