import type { CompanionExpression } from "@anime-buddy/shared";
import type { VrmInstance } from "./types.js";
import { clamp } from "../utils/text.js";

const expressionMap: Record<CompanionExpression, string[]> = {
  neutral: ["neutral"],
  happy: ["happy", "relaxed"],
  sad: ["sad"],
  angry: ["angry"],
  surprised: ["surprised"],
  relaxed: ["relaxed", "happy"]
};

const emotionalExpressions = ["happy", "relaxed", "sad", "angry", "surprised"];
const mouthExpressions = ["aa", "A", "mouthAa", "oh", "ih"];

export class ExpressionController {
  private vrm: VrmInstance | null = null;
  private currentExpression: string | null = null;
  private mouthExpression: string | null = null;

  setVrm(vrm: VrmInstance | null): void {
    this.vrm = vrm;
    this.currentExpression = null;
    this.mouthExpression = null;
    this.resolveMouthExpression();
  }

  setExpression(expression: CompanionExpression, intensity = 0.7): void {
    const manager = this.vrm?.expressionManager;
    if (!manager) {
      return;
    }

    this.resetEmotionalExpressions();
    const candidates = expressionMap[expression] ?? expressionMap.neutral;
    const found = candidates.find((name) => this.hasExpression(name));
    if (!found || found === "neutral") {
      manager.update?.();
      this.currentExpression = null;
      return;
    }

    manager.setValue(found, clamp(intensity, 0, 1));
    manager.update?.();
    this.currentExpression = found;
  }

  setMouthOpen(value: number): void {
    const manager = this.vrm?.expressionManager;
    if (!manager || !this.mouthExpression) {
      return;
    }

    manager.setValue(this.mouthExpression, clamp(value, 0, 1));
    manager.update?.();
  }

  resetMouth(): void {
    this.setMouthOpen(0);
  }

  resetAll(): void {
    this.resetEmotionalExpressions();
    this.resetMouth();
  }

  private resetEmotionalExpressions(): void {
    const manager = this.vrm?.expressionManager;
    if (!manager) {
      return;
    }

    for (const name of emotionalExpressions) {
      if (this.hasExpression(name)) {
        manager.setValue(name, 0);
      }
    }
    manager.update?.();
    this.currentExpression = null;
  }

  private resolveMouthExpression(): void {
    this.mouthExpression = mouthExpressions.find((name) => this.hasExpression(name)) ?? null;
  }

  private hasExpression(name: string): boolean {
    const manager = this.vrm?.expressionManager as any;
    if (!manager) {
      return false;
    }

    if (manager.getExpressionTrackName?.(name)) {
      return true;
    }

    if (manager.expressionMap?.[name] || manager._expressionMap?.[name]) {
      return true;
    }

    try {
      manager.setValue(name, 0);
      return true;
    } catch {
      return false;
    }
  }
}
