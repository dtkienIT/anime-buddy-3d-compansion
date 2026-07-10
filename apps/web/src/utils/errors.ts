export function toUserMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("Failed to fetch")) {
    return "Khong the ket noi backend.";
  }
  if (message.includes("TTS")) {
    return "Khong the phat giong noi luc nay.";
  }
  return "Minh gap loi khi xu ly cau nay.";
}
