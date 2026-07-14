import { Mistral } from "@mistralai/mistralai";
import {
  animationRegistry,
  getCharacterById,
  type ChatMessage,
  type CompanionChatResponse,
  type CompanionEmotion,
  type CompanionExpression,
  resolveSafeAnimationId
} from "@anime-buddy/shared";
import type { ApiEnv } from "../config/env.js";
import { companionModelResponseSchema } from "../schemas/chatSchemas.js";
import { buildCharacterSystemPrompt } from "../prompts/characterSystemPrompt.js";
import { parsePossiblyFencedJson } from "../utils/safeJson.js";

export interface CompleteCompanionInput {
  message: string;
  characterId: string;
  history: ChatMessage[];
  availableAnimationIds: string[];
  sessionId: string;
  memoryContext?: string;
}

export interface CompanionAiService {
  complete(input: CompleteCompanionInput): Promise<Omit<CompanionChatResponse, "sessionId" | "warnings">>;
}

const emotionAnimationFallback: Record<CompanionEmotion, string> = {
  neutral: "gentle-gesture",
  happy: "clapping",
  sad: "sad",
  angry: "angry",
  shy: "blush",
  surprised: "surprised",
  excited: "jump",
  sleepy: "sleepy"
};

const emotionExpressionFallback: Record<CompanionEmotion, CompanionExpression> = {
  neutral: "neutral",
  happy: "happy",
  sad: "sad",
  angry: "angry",
  shy: "happy",
  surprised: "surprised",
  excited: "happy",
  sleepy: "relaxed"
};

export class MistralService implements CompanionAiService {
  private readonly client: Mistral;

  constructor(private readonly env: ApiEnv) {
    this.client = new Mistral({ apiKey: env.MISTRAL_API_KEY });
  }

  async complete(input: CompleteCompanionInput): Promise<Omit<CompanionChatResponse, "sessionId" | "warnings">> {
    const safeAnimations = animationRegistry.filter((animation) => input.availableAnimationIds.includes(animation.id));
    const allowedAnimations = safeAnimations.length > 0 ? safeAnimations : animationRegistry;
    const character = getCharacterById(input.characterId);
    let systemPrompt = buildCharacterSystemPrompt(allowedAnimations, character);
    if (input.memoryContext) {
      systemPrompt += "\n" + input.memoryContext;
    }
    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...input.history.map((message) => ({
        role: message.role === "assistant" ? "assistant" as const : "user" as const,
        content: message.content
      })),
      { role: "user" as const, content: input.message }
    ];

    const response = await this.client.chat.complete({
      model: this.env.MISTRAL_MODEL,
      messages,
      temperature: 0.45,
      responseFormat: { type: "json_object" }
    } as any);

    const content = extractMistralText(response);
    return parseCompanionModelPayload(content, input.availableAnimationIds);
  }
}

export function parseCompanionModelPayload(
  content: unknown,
  availableAnimationIds: string[]
): Omit<CompanionChatResponse, "sessionId" | "warnings"> {
  const raw = parsePossiblyFencedJson(content);
  const parsed = companionModelResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Mistral returned invalid companion JSON");
  }

  const emotion = parsed.data.emotion;
  const animation = resolveSafeAnimationId(
    parsed.data.animation ?? emotionAnimationFallback[emotion],
    availableAnimationIds
  );
  const expression = parsed.data.expression ?? emotionExpressionFallback[emotion];

  return {
    reply: parsed.data.reply,
    emotion,
    animation,
    expression,
    intensity: parsed.data.intensity,
    voiceStyle: parsed.data.voiceStyle
  };
}

function extractMistralText(response: any): string {
  const content = response?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map((part) => part?.text ?? "").join("");
  }

  throw new Error("Mistral response did not contain text");
}
