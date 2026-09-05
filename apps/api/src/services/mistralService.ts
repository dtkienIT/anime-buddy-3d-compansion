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
  stream?(input: CompleteCompanionInput): Promise<{
    tokenStream: AsyncIterable<string>;
    getFinalResponse: () => Promise<Omit<CompanionChatResponse, "sessionId" | "warnings">>;
  }>;
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

const FALLBACK_MODELS = ["ministral-8b-latest", "ministral-3b-latest", "codestral-latest"];

function isRateLimitOrCapacityError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? "");
  const code = String((err as any)?.statusCode ?? (err as any)?.status ?? "");
  return code === "429" || msg.includes("429") || msg.includes("rate_limited") || msg.includes("Rate limit");
}

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

    const candidateModels = [
      this.env.MISTRAL_MODEL,
      ...FALLBACK_MODELS.filter((m) => m !== this.env.MISTRAL_MODEL)
    ];

    let lastError: unknown = null;
    let response: any = null;

    for (const model of candidateModels) {
      try {
        response = await this.client.chat.complete({
          model,
          messages,
          temperature: 0.45,
          responseFormat: { type: "json_object" }
        } as any);
        break;
      } catch (err: unknown) {
        lastError = err;
        if (isRateLimitOrCapacityError(err) && model !== candidateModels[candidateModels.length - 1]) {
          console.warn(`[MistralService] Model ${model} rate-limited, falling back to next candidate model.`);
          continue;
        }
        throw err;
      }
    }

    if (!response) {
      throw lastError;
    }

    const content = extractMistralText(response);
    return parseCompanionModelPayload(content, input.availableAnimationIds);
  }

  async stream(input: CompleteCompanionInput): Promise<{
    tokenStream: AsyncIterable<string>;
    getFinalResponse: () => Promise<Omit<CompanionChatResponse, "sessionId" | "warnings">>;
  }> {
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

    const candidateModels = [
      this.env.MISTRAL_MODEL,
      ...FALLBACK_MODELS.filter((m) => m !== this.env.MISTRAL_MODEL)
    ];

    let lastError: unknown = null;
    let responseStream: any = null;

    for (const model of candidateModels) {
      try {
        responseStream = await this.client.chat.stream({
          model,
          messages,
          temperature: 0.45,
          responseFormat: { type: "json_object" }
        } as any);
        break;
      } catch (err: unknown) {
        lastError = err;
        if (isRateLimitOrCapacityError(err) && model !== candidateModels[candidateModels.length - 1]) {
          console.warn(`[MistralService] Model ${model} stream rate-limited, falling back to next candidate model.`);
          continue;
        }
        throw err;
      }
    }

    if (!responseStream) {
      throw lastError;
    }

    let fullJsonBuffer = "";
    let inReplyField = false;
    let extractedIndex = 0;

    async function* generateTokens(): AsyncIterable<string> {
      for await (const chunk of responseStream) {
        const delta = (chunk as any).data?.choices?.[0]?.delta?.content;
        if (typeof delta === "string") {
          fullJsonBuffer += delta;

          if (!inReplyField) {
            const match = /"reply"\s*:\s*"/i.exec(fullJsonBuffer);
            if (match) {
              inReplyField = true;
              extractedIndex = match.index + match[0].length;
            }
          }

          if (inReplyField) {
            let token = "";
            let i = extractedIndex;
            while (i < fullJsonBuffer.length) {
              const char = fullJsonBuffer[i];
              if (char === "\\") {
                if (i + 1 < fullJsonBuffer.length) {
                  const nextChar = fullJsonBuffer[i + 1];
                  if (nextChar === "n") token += "\n";
                  else if (nextChar === "t") token += "\t";
                  else if (nextChar === '"') token += '"';
                  else if (nextChar === "\\") token += "\\";
                  else token += nextChar;
                  i += 2;
                } else {
                  break;
                }
              } else if (char === '"') {
                inReplyField = false;
                extractedIndex = i + 1;
                break;
              } else {
                token += char;
                i++;
              }
            }
            extractedIndex = i;
            if (token) {
              yield token;
            }
          }
        }
      }
    }

    return {
      tokenStream: generateTokens(),
      getFinalResponse: async () => {
        return parseCompanionModelPayload(fullJsonBuffer, input.availableAnimationIds);
      }
    };
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
