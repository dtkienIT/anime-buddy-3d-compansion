export type PerformanceIntent = "dance" | "sing";

const danceTerms = "(?:nhay|mua|bieu dien|trinh dien|dance|dancing|perform)";
const singingTerms = "(?:hat|ca|sing|singing|perform)";

const danceRequests = [
  /\b(?:hay|lam on|vui long|xin)\b(?:\s+\w+){0,4}\s+\b(?:nhay|mua|bieu dien|trinh dien)\b/,
  /\b(?:nhay|mua|bieu dien|trinh dien)\b(?:\s+\w+){0,5}\s+\b(?:di|nhe|nao)\b/,
  /\b(?:nhay|mua|bieu dien|trinh dien)\b(?:\s+\w+){0,3}\s+\bcho\s+(?:anh|em|t|toi|minh|tui|ban|chung toi|bon minh)\b/,
  /\b(?:bat|mo|len|quay)\s+nhac\b(?:\s+\w+){0,6}\s+\b(?:nhay|mua|bieu dien|trinh dien)\b/,
  /\b(?:nhay|mua|bieu dien|trinh dien|dance|perform)\b(?:\s+(?:bai|bai nhay|the dance))?\s+aipai\s+dance\s+hall\b/,
  /\bcho\s+(?:anh|em|t|toi|minh|tui|ban)\s+xem\b(?:\s+\w+){0,3}\s+\b(?:nhay|mua)\b/,
  /\b(?:anh|em|t|toi|minh|tui)\s+muon\s+xem\s+(?:em\s+)?(?:\w+\s+){0,3}(?:nhay|mua)\b/,
  /\b(?:please|kindly)\b(?:\s+\w+){0,3}\s+\b(?:dance|perform)\b/,
  /^(?:please\s+|kindly\s+)?(?:dance|perform(?:\s+a\s+dance)?)\b(?:\s+\w+){0,4}\s+\b(?:for\s+me|please|now)\b/,
  /\b(?:show\s+me|let\s+me\s+(?:see|watch)|i\s+want\s+to\s+(?:see|watch)\s+you)\b(?:\s+\w+){0,3}\s+\b(?:dance|dancing)\b/,
  /\b(?:will|would)\s+you\s+dance\b(?:\s+\w+){0,3}\s+\bfor\s+me\b/,
  /^(?:nhay|mua|bieu dien|trinh dien|dance|perform)(?:\s+(?:di|nhe|nao|please|now))?$/
];

const singingRequests = [
  /\b(?:hay|lam on|vui long|xin)\b(?:\s+\w+){0,4}\s+\b(?:hat|ca)\b/,
  /\b(?:hat|ca)\b(?:\s+\w+){0,5}\s+\b(?:di|nhe|nao)\b/,
  /\b(?:hat|ca)\b(?:\s+\w+){0,3}\s+\bcho\s+(?:anh|em|t|toi|minh|tui|ban|chung toi|bon minh)\b/,
  /\b(?:hat|ca)\s+(?:cho\s+\w+\s+)?(?:mot\s+)?(?:bai|ca khuc)\b/,
  /\bcho\s+(?:anh|em|t|toi|minh|tui|ban)\s+nghe\b(?:\s+\w+){0,3}\s+\b(?:hat|ca)\b/,
  /\b(?:anh|em|t|toi|minh|tui)\s+muon\s+nghe\s+(?:em\s+)?(?:\w+\s+){0,3}(?:hat|ca)\b/,
  /\b(?:bieu dien|trinh dien)\b(?:\s+\w+){0,4}\s+\b(?:bai hat|ca khuc|cham vao binh minh)\b/,
  /\b(?:hat|ca|bieu dien|trinh dien|sing|perform)\b(?:\s+(?:bai|bai hat|ca khuc|the song))?\s+cham\s+vao\s+binh\s+minh\b/,
  /\b(?:please|kindly)\b(?:\s+\w+){0,3}\s+\bsing\b/,
  /^(?:please\s+|kindly\s+)?sing\b(?:\s+\w+){0,4}\s+\b(?:for\s+me|me\s+a\s+song|a\s+song|please|now)\b/,
  /\b(?:let\s+me\s+hear\s+you|i\s+want\s+to\s+hear\s+you)\b(?:\s+\w+){0,2}\s+\bsing\b/,
  /^(?:please\s+|kindly\s+)?perform\s+(?:a|the|this)\s+song\b/,
  /^(?:please\s+|kindly\s+)?start\s+singing\b/,
  /\b(?:will|would)\s+you\s+sing\b(?:\s+\w+){0,3}\s+\bfor\s+me\b/,
  /^(?:hat|ca|sing)(?:\s+(?:di|nhe|nao|please|now))?$/
];

export function classifyPerformanceIntent(message: string): PerformanceIntent | null {
  const normalized = normalizeVietnamese(message);
  if (!normalized) return null;
  if (isThirdPartyNarrative(normalized)) return null;

  // Song-specific wording wins over generic "perform / biểu diễn" wording.
  if (
    !isNegated(normalized, singingTerms)
    && !isCapabilityQuestion(normalized, singingTerms)
    && singingRequests.some((pattern) => pattern.test(normalized))
  ) {
    return "sing";
  }

  if (
    !isNegated(normalized, danceTerms)
    && !isCapabilityQuestion(normalized, danceTerms)
    && danceRequests.some((pattern) => pattern.test(normalized))
  ) {
    return "dance";
  }

  return null;
}

/** @deprecated Prefer classifyPerformanceIntent when routing performances. */
export function isAipaiPerformanceRequest(message: string): boolean {
  return classifyPerformanceIntent(message) === "dance";
}

function isNegated(message: string, terms: string): boolean {
  return new RegExp(
    `\\b(?:dung|khong|chang|cha|khoi|don t|do not|not|never|no|stop)\\b(?:\\s+\\w+){0,4}\\s+\\b${terms}\\b`
  ).test(message);
}

function isCapabilityQuestion(message: string, terms: string): boolean {
  const vietnameseCapability = new RegExp(
    `\\b(?:ban|em|anh|chi|cau|may)?\\s*(?:co\\s+)?(?:biet|the|lam duoc)\\b(?:\\s+\\w+){0,4}\\s+\\b${terms}\\b(?:\\s+\\w+){0,4}\\s+\\bkhong\\b`
  );
  const vietnameseShortQuestion = new RegExp(
    `\\b${terms}\\b(?:\\s+\\w+){0,2}\\s+\\bduoc\\s+khong\\b`
  );
  const englishCapability = new RegExp(
    `\\b(?:can|could)\\s+you\\b(?:\\s+\\w+){0,4}\\s+\\b${terms}\\b|\\b(?:do\\s+you\\s+know\\s+how\\s+to|are\\s+you\\s+able\\s+to)\\b(?:\\s+\\w+){0,3}\\s+\\b${terms}\\b`
  );

  return vietnameseCapability.test(message)
    || vietnameseShortQuestion.test(message)
    || englishCapability.test(message);
}

function isThirdPartyNarrative(message: string): boolean {
  const vietnameseThirdParty = /\b(?:co|anh|chi|em|ban|cau|ong|ba)\s+ay\s+(?:dang\s+)?(?:hat|ca|nhay|mua|bieu dien|trinh dien)\b/;
  const englishThirdParty = /^(?:he|she|they|someone|the\s+singer|the\s+dancer)\s+(?:is\s+)?(?:singing|dancing|performing|sings|dances|performs)\b/;
  return vietnameseThirdParty.test(message) || englishThirdParty.test(message);
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
