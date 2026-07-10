export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function sanitizeAiText(value: unknown, limit = 1200): string {
  if (typeof value !== "string") {
    return "";
  }

  return normalizeWhitespace(value)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .slice(0, limit);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function estimateSpeechBubbleMs(text: string): number {
  return clamp(1800 + text.length * 42, 2600, 9000);
}
