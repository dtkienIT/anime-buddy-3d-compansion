import { z } from "zod";
import {
  animationRegistry,
  companionEmotions,
  companionExpressions
} from "@anime-buddy/shared";

export const availableAnimationIds = animationRegistry.map((animation) => animation.id);

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  anonymousId: z.string().min(8).max(120),
  characterId: z.string().min(1).max(80),
  message: z.string().trim().min(1).max(1200),
  availableAnimations: z.array(z.string().min(1).max(80)).max(64).default([])
});

export const companionModelResponseSchema = z.object({
  reply: z.string().trim().min(1).max(1200),
  emotion: z.enum(companionEmotions).catch("neutral"),
  animation: z.string().trim().max(80).optional(),
  expression: z.enum(companionExpressions).catch("neutral"),
  intensity: z.coerce.number().min(0).max(1).catch(0.5),
  voiceStyle: z.enum(["friendly", "calm", "energetic", "soft"]).catch("friendly")
});

export const ttsRequestSchema = z.object({
  text: z.string().trim().min(1).max(600),
  voice: z.string().trim().min(1).max(80).optional(),
  style: z.string().trim().min(1).max(80).optional(),
  stream: z.boolean().default(true)
});

export type ChatRequestBody = z.infer<typeof chatRequestSchema>;
export type TtsRequestBody = z.infer<typeof ttsRequestSchema>;
