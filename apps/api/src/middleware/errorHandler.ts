import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply.status(400).send({ error: "Invalid request", details: error.issues.map((issue) => issue.message) });
      return;
    }

    const candidate = error as { statusCode?: number; message?: string };
    const statusCode = typeof candidate.statusCode === "number" ? candidate.statusCode : 500;
    const message = statusCode >= 500 ? "Internal server error" : candidate.message ?? "Request failed";
    if (statusCode >= 500) {
      request.log.error({ statusCode, message: candidate.message ?? "Unknown error" }, "request failed");
    }
    reply.status(statusCode).send({ error: message });
  });
}
