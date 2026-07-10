import type { PcmAudioMetadata, TtsAudio } from "./TtsClient.js";
import { perfMetrics } from "../utils/PerformanceMetrics.js";

const PCM_WORKLET_NAME = "pcm-stream-player";
const PCM_WORKLET_URL = "/audio/pcm-stream-worklet.js";
const STREAM_PREBUFFER_MS = 120;

interface StreamMetrics {
  queuedFrames?: number;
  receivedFrames?: number;
  playedFrames?: number;
  droppedFrames?: number;
  duplicatedFrames?: number;
  underflowCount?: number;
  underflowDurationMs?: number;
}

interface WorkletMessage {
  type: "started" | "drained" | "metrics" | "underflow";
  metrics?: StreamMetrics;
}

export class AudioPlayer extends EventTarget {
  private context: AudioContext | null = null;
  private readonly sources = new Set<AudioBufferSourceNode>();
  private analyser: AnalyserNode | null = null;
  private streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private activeWorklet: AudioWorkletNode | null = null;
  private workletModule: Promise<void> | null = null;
  private stopRequested = false;

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  async resume(): Promise<void> {
    const context = this.getContext();
    if (context.state === "suspended") {
      await context.resume();
    }
  }

  async play(audio: TtsAudio): Promise<void> {
    this.stop();
    this.stopRequested = false;
    perfMetrics.mark("audioPlayCalledAt");

    const context = this.getContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.connect(context.destination);
    this.analyser = analyser;
    await this.resume();

    try {
      if (audio.kind === "pcm-stream") {
        await this.playPcmStream(audio, context, analyser);
      } else {
        await this.playBlob(audio.blob, context, analyser);
      }
    } finally {
      if (this.analyser === analyser) {
        analyser.disconnect();
        this.analyser = null;
      }
    }
  }

  stop(): void {
    this.stopRequested = true;
    void this.streamReader?.cancel().catch(() => undefined);
    this.streamReader = null;
    this.activeWorklet?.port.postMessage({ type: "reset" });
    this.activeWorklet?.disconnect();
    this.activeWorklet = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
    }
  }

  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = null;
  }

  private async playBlob(blob: Blob, context: AudioContext, analyser: AnalyserNode): Promise<void> {
    perfMetrics.mark("audioDecodeStartedAt");
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    perfMetrics.mark("audioDecodeCompletedAt");
    if (this.stopRequested) return;

    await new Promise<void>((resolve) => {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      this.sources.add(source);
      source.onended = () => {
        source.disconnect();
        this.sources.delete(source);
        resolve();
      };
      source.start();
      this.notifyPlaying();
    });
    this.notifyEnded();
  }

  private async playPcmStream(
    audio: Extract<TtsAudio, { kind: "pcm-stream" }>,
    context: AudioContext,
    analyser: AnalyserNode
  ): Promise<void> {
    if ("audioWorklet" in context) {
      await this.loadWorklet(context);
      await this.playPcmStreamWithWorklet(audio, context, analyser);
      return;
    }

    await this.playPcmStreamWithSources(audio, context, analyser);
  }

  private async playPcmStreamWithWorklet(
    audio: Extract<TtsAudio, { kind: "pcm-stream" }>,
    context: AudioContext,
    analyser: AnalyserNode
  ): Promise<void> {
    const reader = audio.stream.getReader();
    this.streamReader = reader;

    const node = new AudioWorkletNode(context, PCM_WORKLET_NAME, {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        capacityFrames: Math.max(context.sampleRate * 120, context.sampleRate)
      }
    });
    this.activeWorklet = node;
    node.connect(analyser);

    const bytesPerFrame = this.bytesPerFrame(audio);
    const resampler = new StreamingLinearResampler(audio.sampleRate, context.sampleRate);
    let remainder: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let sentFrames = 0;
    let started = false;
    let yieldedAfterStart = false;
    let readError: unknown = null;
    const prebufferFrames = Math.max(1, Math.floor(context.sampleRate * STREAM_PREBUFFER_MS / 1000));

    const startWorklet = () => {
      if (started || this.stopRequested) return;
      started = true;
      node.port.postMessage({ type: "start" });
    };

    const playbackDone = new Promise<void>((resolve, reject) => {
      node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
        const message = event.data;
        if (message.metrics) {
          this.recordStreamMetrics(message.metrics, context.sampleRate);
        }
        if (message.type === "started" && !this.stopRequested) {
          this.notifyPlaying();
        } else if (message.type === "drained") {
          resolve();
        } else if (message.type === "underflow" && message.metrics?.underflowCount) {
          perfMetrics.addMetrics({ underflowCount: message.metrics.underflowCount });
        }
      };
      node.port.onmessageerror = () => reject(new Error("Audio worklet message failed"));
    });

    const pushSamples = (samples: Float32Array<ArrayBufferLike>) => {
      if (samples.length === 0 || this.stopRequested) return;
      const exactSamples = Float32Array.from(samples);
      const frameCount = exactSamples.length;
      const buffer = exactSamples.buffer;
      node.port.postMessage({ type: "push", samples: buffer }, [buffer]);
      sentFrames += frameCount;
      if (sentFrames >= prebufferFrames) {
        startWorklet();
      }
    };

    try {
      while (!this.stopRequested) {
        const { done, value } = await reader.read();
        if (done) break;
        const { complete, trailing } = alignPcmBytes(remainder, value, bytesPerFrame);
        remainder = trailing;
        pushSamples(resampler.transform(this.decodePcmToMono(complete, audio)));
        if (started && !yieldedAfterStart) {
          yieldedAfterStart = true;
          await waitForMacrotask();
        }
      }

      if (remainder.byteLength > 0 && !this.stopRequested) {
        throw new Error(`TTS stream ended with ${remainder.byteLength} unaligned byte(s)`);
      }
      perfMetrics.mark("ttsResponseCompletedAt");
    } catch (error) {
      readError = error;
    } finally {
      if (this.streamReader === reader) this.streamReader = null;
      if (this.stopRequested) {
        node.port.postMessage({ type: "reset" });
      } else {
        const flushed = resampler.flush();
        if (flushed.length > 0) {
          pushSamples(flushed);
        }
        if (sentFrames > 0) {
          startWorklet();
          node.port.postMessage({ type: "end" });
        } else {
          node.port.postMessage({ type: "reset" });
        }
      }
    }

    if (readError && !this.stopRequested) {
      node.disconnect();
      if (this.activeWorklet === node) this.activeWorklet = null;
      throw readError;
    }

    if (!this.stopRequested && sentFrames > 0) {
      await playbackDone;
    }
    node.disconnect();
    if (this.activeWorklet === node) this.activeWorklet = null;
    this.notifyEnded();
  }

  private async playPcmStreamWithSources(
    audio: Extract<TtsAudio, { kind: "pcm-stream" }>,
    context: AudioContext,
    analyser: AnalyserNode
  ): Promise<void> {
    const reader = audio.stream.getReader();
    this.streamReader = reader;
    const bytesPerFrame = this.bytesPerFrame(audio);
    const resampler = new StreamingLinearResampler(audio.sampleRate, context.sampleRate);
    let remainder: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let nextStartTime = context.currentTime + STREAM_PREBUFFER_MS / 1000;
    let started = false;
    let streamEnded = false;
    let resolvePlayback!: () => void;
    const playbackDone = new Promise<void>((resolve) => { resolvePlayback = resolve; });

    const schedule = (samples: Float32Array<ArrayBufferLike>) => {
      if (samples.length === 0 || this.stopRequested) return;
      const buffer = context.createBuffer(1, samples.length, context.sampleRate);
      buffer.copyToChannel(Float32Array.from(samples), 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      this.sources.add(source);
      const startsAt = Math.max(context.currentTime + 0.01, nextStartTime);
      nextStartTime = startsAt + buffer.duration;
      source.onended = () => {
        source.disconnect();
        this.sources.delete(source);
        if (streamEnded && this.sources.size === 0) resolvePlayback();
      };
      source.start(startsAt);
      if (!started) {
        started = true;
        this.notifyPlaying();
      }
    };

    try {
      while (!this.stopRequested) {
        const { done, value } = await reader.read();
        if (done) break;
        const { complete, trailing } = alignPcmBytes(remainder, value, bytesPerFrame);
        remainder = trailing;
        schedule(resampler.transform(this.decodePcmToMono(complete, audio)));
      }
      if (remainder.byteLength > 0 && !this.stopRequested) {
        throw new Error(`TTS stream ended with ${remainder.byteLength} unaligned byte(s)`);
      }
      const flushed = resampler.flush();
      if (flushed.length > 0) {
        schedule(flushed);
      }
      perfMetrics.mark("ttsResponseCompletedAt");
    } finally {
      if (this.streamReader === reader) this.streamReader = null;
      streamEnded = true;
      if (this.sources.size === 0) resolvePlayback();
    }

    await playbackDone;
    this.notifyEnded();
  }

  private decodePcmToMono(bytes: Uint8Array<ArrayBufferLike>, metadata: PcmAudioMetadata): Float32Array {
    const bytesPerFrame = this.bytesPerFrame(metadata);
    const frameCount = Math.floor(bytes.byteLength / bytesPerFrame);
    const samples = new Float32Array(frameCount);
    const view = new DataView(bytes.buffer, bytes.byteOffset, frameCount * bytesPerFrame);

    for (let frame = 0; frame < frameCount; frame += 1) {
      let mixed = 0;
      for (let channel = 0; channel < metadata.channels; channel += 1) {
        const offset = frame * bytesPerFrame + channel * metadata.bytesPerSample;
        mixed += metadata.format === "f32le"
          ? view.getFloat32(offset, true)
          : view.getInt16(offset, true) / 32768;
      }
      const sample = mixed / metadata.channels;
      samples[frame] = Number.isFinite(sample) ? clampSample(sample) : 0;
    }

    return samples;
  }

  private bytesPerFrame(metadata: PcmAudioMetadata): number {
    return metadata.channels * metadata.bytesPerSample;
  }

  private loadWorklet(context: AudioContext): Promise<void> {
    this.workletModule ??= context.audioWorklet.addModule(PCM_WORKLET_URL);
    return this.workletModule;
  }

  private recordStreamMetrics(metrics: StreamMetrics, sampleRate: number): void {
    const normalized: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === "number" && Number.isFinite(value)) {
        normalized[key] = value;
      }
    }
    if (typeof metrics.queuedFrames === "number") {
      normalized.bufferedAudioMs = metrics.queuedFrames / sampleRate * 1000;
    }
    if (Object.keys(normalized).length > 0) {
      perfMetrics.addMetrics(normalized);
    }
  }

  private notifyPlaying(): void {
    perfMetrics.mark("audioPlayingAt");
    this.dispatchEvent(new Event("started"));
  }

  private notifyEnded(): void {
    perfMetrics.mark("audioEndedAt");
    this.dispatchEvent(new Event(this.stopRequested ? "stopped" : "ended"));
  }

  private getContext(): AudioContext {
    this.context ??= new AudioContext();
    return this.context;
  }
}

class StreamingLinearResampler {
  private previousSample: number | null = null;
  private position = 0;

  constructor(
    private readonly inputRate: number,
    private readonly outputRate: number
  ) {}

  transform(input: Float32Array<ArrayBufferLike>): Float32Array {
    if (input.length === 0) {
      return new Float32Array(0);
    }
    if (this.inputRate === this.outputRate) {
      return Float32Array.from(input);
    }

    const source = this.previousSample === null ? input : prependSample(this.previousSample, input);
    const ratio = this.inputRate / this.outputRate;
    const output: number[] = [];
    while (this.position + 1 < source.length) {
      const index = Math.floor(this.position);
      const fraction = this.position - index;
      output.push(source[index] + (source[index + 1] - source[index]) * fraction);
      this.position += ratio;
    }

    this.previousSample = source[source.length - 1];
    this.position -= source.length - 1;
    return Float32Array.from(output);
  }

  flush(): Float32Array {
    if (this.inputRate === this.outputRate || this.previousSample === null) {
      return new Float32Array(0);
    }
    const sample = this.previousSample;
    this.previousSample = null;
    this.position = 0;
    return new Float32Array([sample]);
  }
}

function prependSample(sample: number, input: Float32Array<ArrayBufferLike>): Float32Array {
  const output = new Float32Array(input.length + 1);
  output[0] = sample;
  output.set(input, 1);
  return output;
}

function alignPcmBytes(
  remainder: Uint8Array<ArrayBufferLike>,
  value: Uint8Array<ArrayBufferLike>,
  bytesPerFrame: number
): {
  complete: Uint8Array<ArrayBufferLike>;
  trailing: Uint8Array<ArrayBufferLike>;
} {
  const combined = new Uint8Array(remainder.byteLength + value.byteLength);
  combined.set(remainder);
  combined.set(value, remainder.byteLength);
  const completeLength = combined.byteLength - (combined.byteLength % bytesPerFrame);
  return {
    complete: combined.subarray(0, completeLength),
    trailing: combined.slice(completeLength)
  };
}

function clampSample(sample: number): number {
  return Math.max(-1, Math.min(1, sample));
}

function waitForMacrotask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
