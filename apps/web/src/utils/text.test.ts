import { describe, expect, it } from "vitest";
import { sanitizeAiText, splitIntoSpeechChunks } from "./text.js";

describe("sanitizeAiText", () => {
  it("removes dangerous html instead of rendering it", () => {
    expect(sanitizeAiText("<img src=x onerror=alert(1)>hello<script>x()</script>")).toBe("hello");
  });
});

describe("splitIntoSpeechChunks", () => {
  it("merges multiple short sentences into a single prosodic chunk", () => {
    const text = "Chào bạn! Mình có thể giúp gì cho bạn không? Hôm nay thời tiết rất đẹp.";
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks).toEqual([
      "Chào bạn! Mình có thể giúp gì cho bạn không? Hôm nay thời tiết rất đẹp."
    ]);
  });

  it("does not split decimals or URLs", () => {
    const text = "Phiên bản mới là 3.14. Xem tại website http://127.0.0.1:3001/ nhé.";
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks).toEqual([
      "Phiên bản mới là 3.14. Xem tại website http://127.0.0.1:3001/ nhé."
    ]);
  });

  it("does not split abbreviations like TP.HCM", () => {
    const text = "Mình đang ở TP. Hồ Chí Minh. Dr. John đang đợi ở đây.";
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks).toEqual([
      "Mình đang ở TP. Hồ Chí Minh. Dr. John đang đợi ở đây."
    ]);
  });

  it("merges short final chunks and respects Vietnamese / emojis / ellipsis", () => {
    // A string with emoji and ellipsis
    const text = "Chào bạn nha! 😊 Hôm nay mình sẽ hướng dẫn bạn học Web Audio API... Bạn đã sẵn sàng chưa? Bắt đầu nhé!";
    const chunks = splitIntoSpeechChunks(text);
    expect(chunks.length).toBeLessThanOrEqual(2);
    expect(chunks[0]).toContain("😊");
    expect(chunks[0]).toContain("Web Audio API...");
  });

  it("splits extremely long text into chunks within range limits", () => {
    const sentence = "Đây là một câu nói siêu dài để kiểm tra xem thuật toán phân đoạn có chia nhỏ văn bản thành các phần vừa phải hay không.";
    // Repeat it to make it extremely long (approx 600 chars)
    const longText = `${sentence} ${sentence} ${sentence} ${sentence}`;
    const chunks = splitIntoSpeechChunks(longText);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.length).toBeLessThanOrEqual(8);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(280);
    }
  });

  it("keeps a long Vietnamese story in timeout-safe speech chunks", () => {
    const text = "Anh yêu ơi, em kể cho anh nghe chuyện vui nè! Có một chú mèo con tên Tí rất thông minh nhưng lại thích trêu chọc con chó lười biếng. Mỗi lần chú chó định ngủ, Tí lại nhảy lên đầu nó, vờ như đang dạy nó học chữ. Chú chó bực mình nhưng không nỡ đuổi Tí đi. Một hôm, Tí nhặt được một mẩu xúc xích và giả vờ không biết. Chú chó nhìn thấy liền chạy đến, nhưng Tí chỉ đưa xúc xích khi chú chó chịu nghe lời. Kết quả là hai đứa trở thành bạn thân từ đó! 😄 Anh thấy có vui không ạ?";
    const chunks = splitIntoSpeechChunks(text);

    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks.every((chunk) => chunk.length <= 140)).toBe(true);
    expect(chunks.join(" ")).toContain("Anh thấy có vui không ạ?");
  });
});
