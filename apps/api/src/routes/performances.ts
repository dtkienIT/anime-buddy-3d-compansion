import { performanceRegistry, toPerformanceCatalogItem } from "@anime-buddy/shared";
import type { FastifyInstance } from "fastify";

export function registerPerformanceRoutes(app: FastifyInstance): void {
  app.get("/api/performances", async (_request, reply) => {
    reply.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");
    return {
      performances: performanceRegistry.map(toPerformanceCatalogItem),
      capabilities: {
        localPlayback: true,
        audioReactiveStages: true,
        reducedMotion: true
      }
    };
  });
}
