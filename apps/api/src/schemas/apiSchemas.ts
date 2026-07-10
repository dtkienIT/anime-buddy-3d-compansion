import { z } from "zod";

export const conversationQuerySchema = z.object({
  anonymousId: z.string().min(8).max(120),
  sessionId: z.string().uuid().optional()
});

export const conversationParamsSchema = z.object({
  sessionId: z.string().uuid()
});
