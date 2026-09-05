import { describe, expect, it } from "vitest";
import { toUserMessage } from "./errors.js";

describe("toUserMessage", () => {
  it("returns readable Vietnamese fallback messages", () => {
    expect(toUserMessage(new Error("Failed to fetch"))).toBe("Không thể kết nối backend.");
    expect(toUserMessage(new Error("TTS unavailable"))).toBe("Không thể phát giọng nói lúc này.");
    expect(toUserMessage(new Error("Rate limit exceeded"))).toBe("Hệ thống AI đang quá tải hoặc đạt giới hạn lượt gọi. Vui lòng thử lại sau giây lát.");
    expect(toUserMessage(new Error("unexpected"))).toBe("Mình gặp lỗi khi xử lý câu này.");
  });
});
