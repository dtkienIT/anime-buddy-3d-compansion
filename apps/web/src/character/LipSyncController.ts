import { lipSyncConfig } from "../config/constants.js";
import { clamp } from "../utils/text.js";
import type { ExpressionController } from "./ExpressionController.js";

export class LipSyncController {
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private previousVolume = 0;
  private enabled = false;

  constructor(private readonly expressions: ExpressionController) {}

  attachAnalyser(analyser: AnalyserNode | null): void {
    this.analyser = analyser;
    this.data = analyser ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) : null;
    if (analyser) {
      analyser.fftSize = lipSyncConfig.fftSize;
    }
  }

  start(): void {
    this.enabled = true;
  }

  stop(): void {
    this.enabled = false;
    this.previousVolume = 0;
    this.expressions.resetMouth();
  }

  update(): void {
    if (!this.enabled || !this.analyser || !this.data) {
      return;
    }

    this.analyser.getByteTimeDomainData(this.data);
    let sum = 0;
    for (const value of this.data) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / this.data.length);
    const smoothed = this.previousVolume * lipSyncConfig.smoothing + rms * (1 - lipSyncConfig.smoothing);
    this.previousVolume = smoothed;
    const mouthValue = clamp((smoothed - lipSyncConfig.noiseFloor) * lipSyncConfig.gain, 0, 1);
    this.expressions.setMouthOpen(mouthValue);
  }
}
