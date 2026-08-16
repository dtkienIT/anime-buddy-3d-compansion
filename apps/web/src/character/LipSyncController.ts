import { lipSyncConfig } from "../config/constants.js";
import { clamp } from "../utils/text.js";
import type { ExpressionController } from "./ExpressionController.js";

export class LipSyncController {
  private analyser: AnalyserNode | null = null;
  private timeData: Uint8Array<ArrayBuffer> | null = null;
  private freqData: Uint8Array<ArrayBuffer> | null = null;
  private previousVolume = 0;
  private enabled = false;

  constructor(private readonly expressions: ExpressionController) {}

  attachAnalyser(analyser: AnalyserNode | null): void {
    this.analyser = analyser;
    this.timeData = analyser ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) : null;
    this.freqData = analyser ? new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) : null;
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
    this.expressions.resetVisemes();
  }

  update(): void {
    if (!this.enabled || !this.analyser || !this.timeData || !this.freqData) {
      return;
    }

    // 1. Time-domain RMS volume calculation
    this.analyser.getByteTimeDomainData(this.timeData);
    let sum = 0;
    for (const value of this.timeData) {
      const normalized = (value - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / this.timeData.length);
    const smoothed = this.previousVolume * lipSyncConfig.smoothing + rms * (1 - lipSyncConfig.smoothing);
    this.previousVolume = smoothed;
    const overallMouth = clamp((smoothed - lipSyncConfig.noiseFloor) * lipSyncConfig.gain, 0, 1);

    if (overallMouth <= 0.01) {
      this.expressions.resetVisemes();
      return;
    }

    // 2. Frequency-domain distribution calculation
    this.analyser.getByteFrequencyData(this.freqData);
    const binCount = this.freqData.length;
    let lowEnergy = 0;
    let midEnergy = 0;
    let highEnergy = 0;

    const lowEnd = Math.max(1, Math.floor(binCount * 0.15));
    const midEnd = Math.max(lowEnd + 1, Math.floor(binCount * 0.55));

    for (let i = 0; i < lowEnd; i++) {
      lowEnergy += this.freqData[i];
    }
    for (let i = lowEnd; i < midEnd; i++) {
      midEnergy += this.freqData[i];
    }
    for (let i = midEnd; i < binCount; i++) {
      highEnergy += this.freqData[i];
    }

    const totalEnergy = Math.max(1, lowEnergy + midEnergy + highEnergy);
    const lowRatio = lowEnergy / totalEnergy;
    const midRatio = midEnergy / totalEnergy;
    const highRatio = highEnergy / totalEnergy;

    this.expressions.setVisemeWeights({
      aa: overallMouth * (midRatio * 1.5),
      ih: overallMouth * (highRatio * 1.2),
      ou: overallMouth * (lowRatio * 1.4),
      ee: overallMouth * (highRatio * 1.1),
      oh: overallMouth * (lowRatio * 1.1)
    });
  }
}
