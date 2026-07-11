import { env } from "../config/env.js";

export type PerformanceMarkName =
  | "messageSubmitAt"
  | "assistantReplyStartedAt"
  | "firstVisibleTextAt"
  | "assistantReplyCompletedAt"
  | "chatRequestStartedAt"
  | "chatResponseReceivedAt"
  | "replyRenderedAt"
  | "audioQueueReceivedAt"
  | "chunkSplitStartedAt"
  | "chunkSplitCompletedAt"
  | "ttsRequestStartedAt"
  | "ttsResponseHeadersAt"
  | "ttsFirstByteAt"
  | "ttsResponseCompletedAt"
  | "audioDecodeStartedAt"
  | "audioDecodeCompletedAt"
  | "audioPlayCalledAt"
  | "audioScheduledAt"
  | "audioPlayingAt"
  | "audioEndedAt"
  | "queueIdleAt"
  | "cancelledAt";

export interface PerformanceRun {
  id: number;
  replyId: string;
  marks: Partial<Record<PerformanceMarkName, number>>;
  tts: Record<string, string | number | boolean | null>;
  metrics: Record<string, number>;
  chunks: PerformanceChunk[];
  status: "active" | "completed" | "cancelled";
}

export interface PerformanceChunk {
  chunkIndex: number;
  requestId: string;
  text: string;
  textLength: number;
  enqueuedAt: number;
  requestStartedAt: number;
  responseHeadersAt?: number;
  firstByteAt?: number;
  responseCompletedAt?: number;
  synthesisStartedAt: number;
  synthesisCompletedAt?: number;
  decodeStartedAt?: number;
  decodeCompletedAt?: number;
  scheduledAt?: number;
  scheduledStartTime?: number;
  playbackStartedAt?: number;
  playbackCompletedAt?: number;
  nextChunkReadyAt?: number;
  gapBeforeNextChunkMs?: number;
  leadingSilenceMs?: number;
  trailingSilenceMs?: number;
  audioDurationMs?: number;
  cancelled?: boolean;
  replaced?: boolean;
  cache?: string | null;
  serverTiming?: string | null;
}

class PerformanceMetrics {
  private sequence = 0;
  private readonly runs: PerformanceRun[] = [];

  constructor() {
    if (env.enablePerfMetrics && import.meta.env.DEV && typeof window !== "undefined") {
      window.__BUDDY_PERF__ = { runs: this.runs };
    }
  }

  start(): number {
    const id = ++this.sequence;
    if (!env.enablePerfMetrics) return id;
    const run: PerformanceRun = {
      id,
      replyId: crypto.randomUUID(),
      marks: {},
      tts: {},
      metrics: {},
      chunks: [],
      status: "active"
    };
    this.runs.push(run);
    if (this.runs.length > 100) this.runs.shift();
    this.mark(id, "messageSubmitAt");
    return id;
  }

  mark(runId: number, name: PerformanceMarkName, at = performance.now()): void {
    const run = this.getRun(runId);
    if (!run || run.marks[name] !== undefined) return;
    run.marks[name] = at;
    this.calculate(run);
  }

  addTtsMetadata(runId: number, metadata: Record<string, string | number | boolean | null>): void {
    const run = this.getRun(runId);
    if (run) Object.assign(run.tts, metadata);
  }

  addMetrics(runId: number, metrics: Record<string, number>): void {
    const run = this.getRun(runId);
    if (run) Object.assign(run.metrics, metrics);
  }

  addChunk(runId: number, chunk: PerformanceChunk): void {
    const run = this.getRun(runId);
    if (!run) return;
    const existing = run.chunks.find((item) => item.chunkIndex === chunk.chunkIndex);
    if (existing) Object.assign(existing, chunk);
    else run.chunks.push(chunk);
    run.chunks.sort((a, b) => a.chunkIndex - b.chunkIndex);
    this.calculateChunkMetrics(run);
  }

  updateChunk(runId: number, chunkIndex: number, update: Partial<PerformanceChunk>): void {
    const run = this.getRun(runId);
    const chunk = run?.chunks.find((item) => item.chunkIndex === chunkIndex);
    if (!run || !chunk) return;
    Object.assign(chunk, update);
    this.calculateChunkMetrics(run);
  }

  finish(runId: number, status: "completed" | "cancelled"): void {
    const run = this.getRun(runId);
    if (run) run.status = status;
  }

  private getRun(runId: number): PerformanceRun | undefined {
    return this.runs.find((run) => run.id === runId);
  }

  private calculate(run: PerformanceRun): void {
    const duration = (name: string, end: PerformanceMarkName, start: PerformanceMarkName) => {
      const endAt = run.marks[end];
      const startAt = run.marks[start];
      if (endAt !== undefined && startAt !== undefined) run.metrics[name] = endAt - startAt;
    };
    duration("firstVisibleTextLatency", "firstVisibleTextAt", "messageSubmitAt");
    duration("chatLatency", "chatResponseReceivedAt", "chatRequestStartedAt");
    duration("renderLatency", "replyRenderedAt", "chatResponseReceivedAt");
    duration("chunkSplitLatency", "chunkSplitCompletedAt", "chunkSplitStartedAt");
    duration("ttsBackendLatency", "ttsResponseHeadersAt", "ttsRequestStartedAt");
    duration("ttsFirstByteLatency", "ttsFirstByteAt", "ttsRequestStartedAt");
    duration("ttsDownloadLatency", "ttsResponseCompletedAt", "ttsResponseHeadersAt");
    duration("audioDecodeLatency", "audioDecodeCompletedAt", "audioDecodeStartedAt");
    duration("audioStartOverhead", "audioPlayingAt", "audioPlayCalledAt");
    duration("replyToAudioLatency", "audioPlayingAt", "replyRenderedAt");
    duration("submitToAudioLatency", "audioPlayingAt", "messageSubmitAt");
    duration("queueWallLatency", "queueIdleAt", "audioQueueReceivedAt");
  }

  private calculateChunkMetrics(run: PerformanceRun): void {
    const chunks = run.chunks;
    run.metrics.chunkCount = chunks.length;
    if (!chunks.length) return;
    run.metrics.averageChunkLength = chunks.reduce((sum, chunk) => sum + chunk.textLength, 0) / chunks.length;
    const gaps = chunks.map((chunk) => chunk.gapBeforeNextChunkMs)
      .filter((gap): gap is number => typeof gap === "number" && Number.isFinite(gap));
    if (gaps.length) {
      const sorted = [...gaps].sort((a, b) => a - b);
      run.metrics.maxGapBeforeNextChunkMs = sorted.at(-1) ?? 0;
      run.metrics.medianGapBeforeNextChunkMs = sorted[Math.floor(sorted.length / 2)];
    }
  }
}

export const perfMetrics = new PerformanceMetrics();
