import { env } from "../config/env.js";

export type PerformanceMarkName =
  | "messageSubmitAt"
  | "chatRequestStartedAt"
  | "chatResponseReceivedAt"
  | "replyRenderedAt"
  | "ttsRequestStartedAt"
  | "ttsResponseHeadersAt"
  | "ttsResponseCompletedAt"
  | "audioDecodeStartedAt"
  | "audioDecodeCompletedAt"
  | "audioPlayCalledAt"
  | "audioPlayingAt"
  | "audioEndedAt";

export interface PerformanceRun {
  id: number;
  marks: Partial<Record<PerformanceMarkName, number>>;
  tts: Record<string, string | number | boolean | null>;
  metrics: Record<string, number>;
  chunks: PerformanceChunk[];
}

export interface PerformanceChunk {
  chunkIndex: number;
  textLength: number;
  synthesisStartedAt: number;
  synthesisCompletedAt?: number;
  decodeStartedAt?: number;
  decodeCompletedAt?: number;
  scheduledStartTime?: number;
  nextChunkReadyAt?: number;
  gapBeforeNextChunkMs?: number;
  leadingSilenceMs?: number;
  trailingSilenceMs?: number;
  audioDurationMs?: number;
}

class PerformanceMetrics {
  private sequence = 0;
  private current: PerformanceRun | null = null;
  private readonly runs: PerformanceRun[] = [];

  constructor() {
    if (env.enablePerfMetrics && import.meta.env.DEV && typeof window !== "undefined") {
      window.__BUDDY_PERF__ = { runs: this.runs };
    }
  }

  start(): void {
    if (!env.enablePerfMetrics) return;
    this.current = { id: ++this.sequence, marks: {}, tts: {}, metrics: {}, chunks: [] };
    this.runs.push(this.current);
    if (this.runs.length > 100) this.runs.shift();
    this.mark("messageSubmitAt");
  }

  mark(name: PerformanceMarkName): void {
    if (!this.current) return;
    this.current.marks[name] = performance.now();
    this.calculate();
  }

  addTtsMetadata(metadata: Record<string, string | number | boolean | null>): void {
    if (!this.current) return;
    Object.assign(this.current.tts, metadata);
  }

  addMetrics(metrics: Record<string, number>): void {
    if (!this.current) return;
    Object.assign(this.current.metrics, metrics);
  }

  addChunk(chunk: PerformanceChunk): void {
    if (!this.current) return;
    this.current.chunks.push(chunk);
    this.calculateChunkMetrics();
  }

  private calculate(): void {
    const run = this.current;
    if (!run) return;
    const duration = (name: string, end: PerformanceMarkName, start: PerformanceMarkName) => {
      const endAt = run.marks[end];
      const startAt = run.marks[start];
      if (endAt !== undefined && startAt !== undefined) run.metrics[name] = endAt - startAt;
    };
    duration("chatLatency", "chatResponseReceivedAt", "chatRequestStartedAt");
    duration("renderLatency", "replyRenderedAt", "chatResponseReceivedAt");
    duration("ttsBackendLatency", "ttsResponseHeadersAt", "ttsRequestStartedAt");
    duration("ttsDownloadLatency", "ttsResponseCompletedAt", "ttsResponseHeadersAt");
    duration("audioDecodeLatency", "audioDecodeCompletedAt", "audioDecodeStartedAt");
    duration("audioStartOverhead", "audioPlayingAt", "audioPlayCalledAt");
    duration("replyToAudioLatency", "audioPlayingAt", "replyRenderedAt");
    duration("submitToAudioLatency", "audioPlayingAt", "messageSubmitAt");
  }

  private calculateChunkMetrics(): void {
    const run = this.current;
    if (!run) return;
    const chunks = run.chunks;
    run.metrics.chunkCount = chunks.length;
    if (chunks.length === 0) return;

    run.metrics.averageChunkLength = chunks.reduce((sum, chunk) => sum + chunk.textLength, 0) / chunks.length;

    const gaps = chunks
      .map((chunk) => chunk.gapBeforeNextChunkMs)
      .filter((gap): gap is number => typeof gap === "number" && Number.isFinite(gap));

    if (gaps.length > 0) {
      const sorted = [...gaps].sort((a, b) => a - b);
      run.metrics.maxGapBeforeNextChunkMs = sorted[sorted.length - 1];
      run.metrics.medianGapBeforeNextChunkMs = sorted[Math.floor(sorted.length / 2)];
    }
  }
}

export const perfMetrics = new PerformanceMetrics();
