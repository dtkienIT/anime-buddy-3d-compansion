import * as THREE from "three";
import type { VrmInstance } from "./types.js";

const centeredTarget = new THREE.Vector3(0, 1.48, 5.5);

export class LookAtController {
  readonly target = new THREE.Object3D();
  private readonly desired = centeredTarget.clone();
  private readonly saccadeOffset = new THREE.Vector3(0, 0, 0);
  private readonly effectiveDesired = centeredTarget.clone();
  private vrm: VrmInstance | null = null;
  private enabled = true;
  private lastPointerAt = 0;
  private nextSaccadeAt = 0;
  private nextGazeShiftAt = 0;
  private gazePhase: "direct" | "aside" = "direct";

  constructor() {
    this.target.name = "CompanionGazeTarget";
    this.target.position.copy(centeredTarget);
  }

  setVrm(vrm: VrmInstance | null): void {
    if (this.vrm?.lookAt?.target === this.target) {
      this.vrm.lookAt.target = null;
    }
    this.vrm = vrm;
    if (vrm?.lookAt) {
      vrm.lookAt.autoUpdate = true;
      vrm.lookAt.target = this.target;
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.center();
      this.saccadeOffset.set(0, 0, 0);
      this.target.position.copy(centeredTarget);
      this.target.updateMatrixWorld(true);
    }
  }

  followPointer(normalizedX: number, normalizedY: number): void {
    if (!this.enabled) return;
    this.lastPointerAt = performance.now();
    this.desired.set(
      THREE.MathUtils.clamp(normalizedX, -1, 1) * 0.92,
      1.48 + THREE.MathUtils.clamp(normalizedY, -1, 1) * 0.5,
      5.5
    );
  }

  center(): void {
    this.desired.copy(centeredTarget);
  }

  update(delta = 1 / 30): void {
    const lookAt = this.vrm?.lookAt;
    if (!lookAt) return;

    const now = performance.now();

    // Natural micro-saccades: subtle ocular shifts every 1.8 - 3.5 seconds
    if (this.enabled && now >= this.nextSaccadeAt) {
      this.nextSaccadeAt = now + 1800 + Math.random() * 1800;
      this.saccadeOffset.set(
        (Math.random() - 0.5) * 0.065,
        (Math.random() - 0.5) * 0.045,
        0
      );
    }

    // Natural idle gaze drift / camera glance when mouse is stationary > 3.5s
    if (this.enabled && now - this.lastPointerAt > 3500) {
      if (now >= this.nextGazeShiftAt) {
        if (this.gazePhase === "direct") {
          // Glance slightly aside or downward
          this.gazePhase = "aside";
          const side = Math.random() > 0.5 ? 0.22 : -0.22;
          const height = 1.40 + (Math.random() - 0.5) * 0.12;
          this.desired.set(side, height, 5.0);
          this.nextGazeShiftAt = now + 1600 + Math.random() * 1400;
        } else {
          // Look directly at user / camera
          this.gazePhase = "direct";
          this.desired.set(0, 1.50, 6.0);
          this.nextGazeShiftAt = now + 3200 + Math.random() * 2500;
        }
      }
    }

    this.effectiveDesired.copy(this.desired).add(this.saccadeOffset);
    const smoothing = 1 - Math.exp(-Math.max(delta, 0.001) * 7.5);
    this.target.position.lerp(this.effectiveDesired, smoothing);
    this.target.updateMatrixWorld(true);
    lookAt.update?.(delta);
  }
}
