import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      reply
        .type("application/json")
        .status(400)
        .send({ error: "Invalid request", details: error.issues.map((issue) => issue.message) });
      return;
    }

    const candidate = error as { statusCode?: number; message?: string; code?: string; requestId?: string };
    const statusCode = typeof candidate.statusCode === "number" ? candidate.statusCode : 500;
    const message = statusCode >= 500 ? "Internal server error" : candidate.message ?? "Request failed";
    if (statusCode >= 500) {
      request.log.error({
        statusCode,
        method: request.method,
        route: request.routeOptions.url,
        url: request.url,
        code: candidate.code,
        upstreamRequestId: candidate.requestId ?? request.headers["x-buddy-tts-request-id"],
        message: candidate.message ?? "Unknown error"
      }, "request failed");
    }
    reply.type("application/json").status(statusCode).send({
      error: candidate.code === "TTS_TIMEOUT" ? "TTS service timed out" : message,
      ...(candidate.code ? { code: candidate.code } : {}),
      ...(candidate.requestId ? { requestId: candidate.requestId } : {})
    });
  });
}
