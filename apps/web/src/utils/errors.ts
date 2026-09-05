export function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
    return "Không thể kết nối backend.";
  }
  if (message.includes("TTS")) {
    return "Không thể phát giọng nói lúc này.";
  }
  if (message.includes("Rate limit") || message.includes("429") || message.includes("rate_limited")) {
    return "Hệ thống AI đang quá tải hoặc đạt giới hạn lượt gọi. Vui lòng thử lại sau giây lát.";
  }
  return "Mình gặp lỗi khi xử lý câu này.";
}
