export function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Failed to fetch")) {
    return "Không thể kết nối backend.";
  }
  if (message.includes("TTS")) {
    return "Không thể phát giọng nói lúc này.";
  }
  return "Mình gặp lỗi khi xử lý câu này.";
}
