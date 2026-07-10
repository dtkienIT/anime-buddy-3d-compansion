import type { FastifyInstance } from "fastify";

export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    request.log.info({ method: request.method, url: request.url }, "request");
  });
}
