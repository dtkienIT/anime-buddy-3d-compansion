import { describe, expect, it } from "vitest";
import { isAipaiPerformanceRequest } from "./performanceIntent.js";

describe("Aipai performance intent", () => {
  it.each([
    "Hãy lên nhạc và nhảy cho t",
    "Bật nhạc rồi biểu diễn đi",
    "Mở nhạc và múa cho mình nhé",
    "Nhảy cho tôi xem nào",
    "Biểu diễn đi"
  ])("matches %s", (message) => {
    expect(isAipaiPerformanceRequest(message)).toBe(true);
  });

  it.each([
    "T thích nghe nhạc",
    "Bạn có biết nhảy không?",
    "Hôm nay mình học bài nhé",
    "Bling-Bang-Bang-Born là bài gì?"
  ])("does not match %s", (message) => {
    expect(isAipaiPerformanceRequest(message)).toBe(false);
  });
});
