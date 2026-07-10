export const companionEmotions = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "shy",
  "surprised",
  "excited",
  "sleepy"
] as const;

export const companionExpressions = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "surprised",
  "relaxed"
] as const;

export const companionRoles = ["user", "assistant", "system"] as const;

export type CompanionEmotion = (typeof companionEmotions)[number];
export type CompanionExpression = (typeof companionExpressions)[number];
export type CompanionRole = (typeof companionRoles)[number];

export interface ChatMessage {
  id?: string;
  role: CompanionRole;
  content: string;
  emotion?: CompanionEmotion | null;
  animation?: string | null;
  expression?: CompanionExpression | null;
  createdAt?: string;
}

export interface CompanionChatRequest {
  sessionId?: string;
  anonymousId: string;
  characterId: string;
  message: string;
  availableAnimations: string[];
}

export interface CompanionChatResponse {
  sessionId: string;
  reply: string;
  emotion: CompanionEmotion;
  animation: string;
  expression: CompanionExpression;
  intensity: number;
  voiceStyle: "friendly" | "calm" | "energetic" | "soft";
  warnings: string[];
}

export function isCompanionEmotion(value: unknown): value is CompanionEmotion {
  return typeof value === "string" && companionEmotions.includes(value as CompanionEmotion);
}

export function isCompanionExpression(value: unknown): value is CompanionExpression {
  return typeof value === "string" && companionExpressions.includes(value as CompanionExpression);
}
