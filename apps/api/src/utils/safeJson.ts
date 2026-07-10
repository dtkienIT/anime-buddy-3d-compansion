export function parsePossiblyFencedJson(text: unknown): unknown {
  if (typeof text !== "string") {
    throw new Error("Model response content is not text");
  }

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}
