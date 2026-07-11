const musicCommands = ["len nhac", "bat nhac", "mo nhac", "quay nhac"];
const danceCommands = ["nhay", "mua", "bieu dien", "trinh dien"];

export function isAipaiPerformanceRequest(message: string): boolean {
  const normalized = normalizeVietnamese(message);
  const asksForMusic = musicCommands.some((command) => normalized.includes(command));
  const asksForDance = danceCommands.some((command) => normalized.includes(command));

  if (asksForMusic && asksForDance) {
    return true;
  }

  return /\b(nhay|mua|bieu dien|trinh dien)\b.{0,24}\b(cho (t|toi|minh)|di|nhe|nao)\b/.test(normalized);
}

function normalizeVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
