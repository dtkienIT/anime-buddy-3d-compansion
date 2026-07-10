import type { VrmInstance } from "./types.js";

export class LookAtController {
  private vrm: VrmInstance | null = null;

  setVrm(vrm: VrmInstance | null): void {
    this.vrm = vrm;
  }

  update(): void {
    const lookAt = this.vrm?.lookAt;
    if (!lookAt) {
      return;
    }
    lookAt.update?.();
  }
}
