import type { TtsAudio } from "./TtsClient.js";
import type { AudioPlayer } from "./AudioPlayer.js";
import { perfMetrics } from "../utils/PerformanceMetrics.js";

export class AudioQueue {
  private activeAbort: AbortController | null = null;
  private activeTask: Promise<void> | null = null;

  get isBusy(): boolean {
    return Boolean(this.activeTask);
  }

  cancel(): void {
    this.activeAbort?.abort();
    this.activeAbort = null;
    this.activeTask = null;
  }

  async playChunks(
    chunks: string[],
    audioPlayer: AudioPlayer,
    synthesize: (text: string, signal: AbortSignal) => Promise<TtsAudio>,
    onPlaying: () => void,
    replace = true,
    runId = 0
  ): Promise<void> {
    if (replace) {
      this.cancel();
      audioPlayer.stop();
    }
    audioPlayer.prepareForPlayback();

    const abort = new AbortController();
    this.activeAbort = abort;

    const task = (async () => {
      if (chunks.length === 0) return;

      perfMetrics.mark(runId, "audioQueueReceivedAt");
      const enqueuedAt = performance.now();
      chunks.forEach((text, chunkIndex) => perfMetrics.addChunk(runId, {
        chunkIndex,
        requestId: "pending",
        text,
        textLength: text.length,
        enqueuedAt,
        requestStartedAt: 0,
        synthesisStartedAt: 0
      }));

      const preFetched: Promise<TtsAudio>[] = [];
      const synthesisStartedAt: number[] = [];
      const synthesisCompletedAt: number[] = [];
      let previousScheduledEndTime: number | null = null;

      const startSynthesize = (index: number): Promise<TtsAudio> => {
        if (abort.signal.aborted) {
          return Promise.reject(new DOMException("Aborted", "AbortError"));
        }
        synthesisStartedAt[index] = performance.now();
        return synthesize(chunks[index], abort.signal).then((audio) => {
          synthesisCompletedAt[index] = performance.now();
          perfMetrics.updateChunk(runId, index, {
            requestId: audio.requestId,
            requestStartedAt: audio.requestStartedAt,
            responseHeadersAt: audio.responseHeadersAt,
            firstByteAt: audio.firstByteAt,
            responseCompletedAt: audio.responseCompletedAt,
            synthesisStartedAt: synthesisStartedAt[index],
            synthesisCompletedAt: synthesisCompletedAt[index],
            cache: audio.cache,
            serverTiming: audio.serverTiming
          });
          return audio;
        });
      };

      // Start pre-fetching chunk 0 synchronously to minimize latency and ensure correct abort listener registration
      preFetched[0] = startSynthesize(0);

      // VieNeu serializes inference on the local CPU. Buffer the first three complete
      // WAVs before playback so synthesis that is slower than real time cannot leave
      // a pause between the opening chunks. Later chunks are produced while this
      // initial audio reserve is playing.
      const initialPrefetchCount = Math.min(3, chunks.length);
      for (let index = 1; index < initialPrefetchCount; index += 1) {
        preFetched[index] = preFetched[index - 1].then(() => startSynthesize(index));
      }
      if (initialPrefetchCount > 1) {
        await preFetched[initialPrefetchCount - 1];
        if (abort.signal.aborted) return;
      }

      const context = (audioPlayer as any).getContext();
      await audioPlayer.resume();

      // Timeline pointer. We start slightly in the future (50ms) to ensure smooth scheduling
      let nextScheduledTime = context.currentTime + 0.05;

      const playPromises: Promise<void>[] = [];

      for (let i = 0; i < chunks.length; i++) {
        if (abort.signal.aborted) break;

        const audio = await preFetched[i];

        // Start pre-fetching next chunk immediately
        if (i + 1 < chunks.length && !preFetched[i + 1]) {
          preFetched[i + 1] = startSynthesize(i + 1);
        }

        if (abort.signal.aborted) break;

        // Ensure we don't schedule in the past
        nextScheduledTime = Math.max(context.currentTime + 0.02, nextScheduledTime);
        const startTime = nextScheduledTime;
        const gapBeforeNextChunkMs = previousScheduledEndTime === null
          ? 0
          : Math.max(0, (startTime - previousScheduledEndTime) * 1000);
        const decodeStartedAt = performance.now();

        if (audio.kind === "blob") {
          // Pre-decode WAV blob
          const buffer = await audioPlayer.decodeWav(audio.blob);
          if (abort.signal.aborted) break;
          const trimmed = audioPlayer.trimAudioBuffer(buffer, chunks[i]);
          const decodeCompletedAt = performance.now();

          nextScheduledTime = startTime + trimmed.duration;
          previousScheduledEndTime = nextScheduledTime;
          perfMetrics.updateChunk(runId, i, {
            synthesisStartedAt: synthesisStartedAt[i],
            synthesisCompletedAt: synthesisCompletedAt[i],
            decodeStartedAt,
            decodeCompletedAt,
            scheduledStartTime: startTime,
            nextChunkReadyAt: decodeCompletedAt,
            gapBeforeNextChunkMs,
            audioDurationMs: trimmed.duration * 1000
          });

          onPlaying();
          perfMetrics.mark(runId, "audioScheduledAt");
          const playPromise = audioPlayer.playBufferDirect(trimmed, startTime, runId, i)
            .then(() => perfMetrics.updateChunk(runId, i, { playbackCompletedAt: performance.now() }));
          playPromises.push(playPromise);
        } else {
          // PCM stream (Cache HIT)
          // Read entire stream into memory to calculate exact duration
          const reader = audio.stream.getReader();
          const pcmChunks: Uint8Array[] = [];
          let totalBytes = 0;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            pcmChunks.push(value);
            totalBytes += value.byteLength;
          }

          if (abort.signal.aborted) break;

          const fileBytes = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of pcmChunks) {
            fileBytes.set(chunk, offset);
            offset += chunk.byteLength;
          }

          const bytesPerFrame = audio.channels * audio.bytesPerSample;
          const frameCount = fileBytes.byteLength / bytesPerFrame;
          const buffer = audioPlayer.createBufferFromPcm(fileBytes, audio);
          const duration = buffer.duration;
          const decodeCompletedAt = performance.now();

          nextScheduledTime = startTime + duration;
          previousScheduledEndTime = nextScheduledTime;
          perfMetrics.updateChunk(runId, i, {
            synthesisStartedAt: synthesisStartedAt[i],
            synthesisCompletedAt: synthesisCompletedAt[i],
            decodeStartedAt,
            decodeCompletedAt,
            scheduledStartTime: startTime,
            nextChunkReadyAt: decodeCompletedAt,
            gapBeforeNextChunkMs,
            audioDurationMs: duration * 1000
          });

          onPlaying();
          perfMetrics.mark(runId, "audioScheduledAt");
          perfMetrics.addMetrics(runId, {
            receivedFrames: frameCount,
            playedFrames: frameCount,
            droppedFrames: 0,
            duplicatedFrames: 0,
            underflowCount: 0,
            underflowDurationMs: 0
          });
          const playPromise = audioPlayer.playBufferDirect(buffer, startTime, runId, i)
            .then(() => perfMetrics.updateChunk(runId, i, { playbackCompletedAt: performance.now() }));
          playPromises.push(playPromise);
        }
      }

      await Promise.all(playPromises);
      perfMetrics.mark(runId, "queueIdleAt");
      perfMetrics.finish(runId, abort.signal.aborted ? "cancelled" : "completed");
    })();

    this.activeTask = task;

    try {
      await task;
    } finally {
      if (abort.signal.aborted) {
        perfMetrics.mark(runId, "cancelledAt");
        perfMetrics.finish(runId, "cancelled");
        chunks.forEach((_, index) => perfMetrics.updateChunk(runId, index, { cancelled: true }));
      }
      if (this.activeTask === task) {
        this.activeTask = null;
        this.activeAbort = null;
      }
    }
  }
}
