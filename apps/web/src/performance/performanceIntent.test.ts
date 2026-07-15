import { describe, expect, it } from "vitest";
import {
  classifyPerformanceIntent,
  isAipaiPerformanceRequest
} from "./performanceIntent.js";

describe("performance intent classifier", () => {
  it.each([
    "Hãy lên nhạc và nhảy cho t",
    "Bật nhạc rồi biểu diễn đi",
    "Mở nhạc và múa cho mình nhé",
    "Nhảy cho tôi xem nào",
    "Biểu diễn đi",
    "Làm ơn nhảy bài Aipai Dance Hall nhé",
    "Biểu diễn Aipai Dance Hall",
    "Tôi muốn xem em nhảy",
    "Please dance for me.",
    "Show me your dance!",
    "I want to watch you dance.",
    "Perform a dance now."
  ])("classifies a direct dance request: %s", (message) => {
    expect(classifyPerformanceIntent(message)).toBe("dance");
  });

  it.each([
    "Hãy hát cho anh nghe nhé",
    "Hát một bài đi em",
    "Làm ơn ca cho tôi nghe",
    "Anh muốn nghe em hát",
    "Biểu diễn bài hát Chạm Vào Bình Minh đi",
    "Hát Chạm Vào Bình Minh",
    "Please sing for me.",
    "Sing me a song.",
    "Let me hear you sing.",
    "Perform the song Chạm Vào Bình Minh.",
    "Start singing now."
  ])("classifies a direct singing request: %s", (message) => {
    expect(classifyPerformanceIntent(message)).toBe("sing");
  });

  it.each([
    "T thích nghe nhạc",
    "Bài hát này rất hay",
    "Mình đang học nhảy",
    "Aipai Dance Hall là bài gì?",
    "Nhảy lên bậc thang",
    "Cô ấy biểu diễn rất hay",
    "This dance is beautiful.",
    "I like singing songs."
  ])("ignores a mention that is not a request: %s", (message) => {
    expect(classifyPerformanceIntent(message)).toBeNull();
  });

  it.each([
    "Cô ấy hát một bài rất hay",
    "Anh ấy hát cho tôi nghe",
    "Cô ấy nhảy cho tôi xem",
    "They perform a song tonight.",
    "She dances for me.",
    "I watched her sing me a song."
  ])("ignores a third-party narrative: %s", (message) => {
    expect(classifyPerformanceIntent(message)).toBeNull();
  });

  it.each([
    "Bạn có biết nhảy không?",
    "Em có thể hát không?",
    "Em hát được không?",
    "Can you dance?",
    "Could you sing?",
    "Can you perform a song?",
    "Do you know how to sing?",
    "Are you able to dance?"
  ])("ignores a capability question: %s", (message) => {
    expect(classifyPerformanceIntent(message)).toBeNull();
  });

  it.each([
    "Đừng nhảy cho tôi xem",
    "Không cần hát đâu",
    "Tôi không muốn em nhảy",
    "Khỏi hát cho anh nghe",
    "Please don't sing for me.",
    "Please don't perform a song.",
    "Do not dance for me.",
    "Stop singing now."
  ])("respects a basic negation: %s", (message) => {
    expect(classifyPerformanceIntent(message)).toBeNull();
  });

  it("prefers a song-specific performance over generic performance wording", () => {
    expect(classifyPerformanceIntent("Hãy biểu diễn bài hát Chạm Vào Bình Minh đi")).toBe("sing");
  });

  it("keeps the Aipai compatibility wrapper dance-only", () => {
    expect(isAipaiPerformanceRequest("Nhảy cho anh xem nhé")).toBe(true);
    expect(isAipaiPerformanceRequest("Hát cho anh nghe nhé")).toBe(false);
  });
});
