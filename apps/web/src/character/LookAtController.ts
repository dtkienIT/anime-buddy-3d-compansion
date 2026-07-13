import * as THREE from "three";
import type { VrmInstance } from "./types.js";

const centeredTarget = new THREE.Vector3(0, 1.48, 5.5);

export class LookAtController {
  readonly target = new THREE.Object3D();
  private readonly desired = centeredTarget.clone();
  private vrm: VrmInstance | null = null;
  private enabled = true;
  private lastPointerAt = 0;

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

    if (performance.now() - this.lastPointerAt > 4200) {
      this.center();
    }
    const smoothing = 1 - Math.exp(-Math.max(delta, 0.001) * 7.5);
    this.target.position.lerp(this.desired, smoothing);
    this.target.updateMatrixWorld(true);
    lookAt.update?.(delta);
  }
}
