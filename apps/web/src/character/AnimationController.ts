import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip
} from "@pixiv/three-vrm-animation";
import { animationRegistry, getAnimationById } from "./animationRegistry.js";
import type { PlayAnimationOptions, VrmInstance } from "./types.js";

export class AnimationController {
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private currentVrm: VrmInstance | null = null;
  private clipCache = new Map<string, THREE.AnimationClip>();
  private serial = 0;

  constructor(private readonly loader: GLTFLoader) {}

  setVrm(vrm: VrmInstance | null): void {
    this.stop();
    this.currentVrm = vrm;
    this.clipCache.clear();
  }

  async play(animationId: string, options: PlayAnimationOptions = {}): Promise<void> {
    const vrm = this.currentVrm;
    if (!vrm) {
      return;
    }

    const requestId = ++this.serial;
    const animation = getAnimationById(animationId);
    const loop = options.loop ?? animation.loop;
    const fadeDuration = options.fadeDuration ?? animation.fadeDuration;

    try {
      const clip = await this.loadClip(animation.url, vrm);
      if (requestId !== this.serial || vrm !== this.currentVrm) {
        return;
      }
      await this.applyClip(clip, loop, fadeDuration);
    } catch (error) {
      if (animation.id !== animation.fallbackId) {
        await this.play(animation.fallbackId, { loop: true });
        return;
      }
      throw error;
    }
  }

  async preload(url: string): Promise<void> {
    const vrm = this.currentVrm;
    if (!vrm) {
      return;
    }
    await this.loadClip(url, vrm);
  }

  async playAsset(url: string, options: PlayAnimationOptions = {}): Promise<void> {
    const vrm = this.currentVrm;
    if (!vrm) {
      return;
    }

    const requestId = ++this.serial;
    const loop = options.loop ?? false;
    const fadeDuration = options.fadeDuration ?? 0.12;
    const clip = await this.loadClip(url, vrm);
    if (requestId !== this.serial || vrm !== this.currentVrm) {
      return;
    }
    await this.applyClip(clip, loop, fadeDuration);
  }

  stop(): void {
    this.serial += 1;
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.currentVrm?.scene);
      this.mixer = null;
    }
  }

  update(delta: number): void {
    this.mixer?.update(delta);
  }

  dispose(): void {
    this.stop();
    this.clipCache.clear();
  }

  private async loadClip(url: string, vrm: VrmInstance): Promise<THREE.AnimationClip> {
    const cached = this.clipCache.get(url);
    if (cached) {
      return cached;
    }

    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      const firstArg = args[0] ?? "";
      const message = typeof firstArg === "string" ? firstArg : "";
      if (message.includes("specVersion of the VRMA is not defined")) {
        return;
      }
      originalWarn(...args);
    };

    try {
      const gltf = await this.loader.loadAsync(url);
      const vrmAnimation = gltf.userData.vrmAnimations?.[0];
      if (!vrmAnimation) {
        throw new Error(`VRMA not found: ${url}`);
      }

      if (vrm.lookAt && !vrm.scene.children.some((child: THREE.Object3D) => child instanceof VRMLookAtQuaternionProxy)) {
        const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
        proxy.name = "VRMLookAtQuaternionProxy";
        vrm.scene.add(proxy);
      }

      const clip = createVRMAnimationClip(vrmAnimation, vrm);
      this.clipCache.set(url, clip);
      return clip;
    } finally {
      console.warn = originalWarn;
    }
  }

  private async applyClip(clip: THREE.AnimationClip, loop: boolean, fadeDuration: number): Promise<void> {
    const vrm = this.currentVrm;
    if (!vrm) {
      return;
    }

    const previous = this.currentAction;
    this.mixer ??= new THREE.AnimationMixer(vrm.scene);
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.enabled = true;
    action.clampWhenFinished = !loop;
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);

    if (previous && previous !== action) {
      previous.crossFadeTo(action, fadeDuration, false);
    }

    action.fadeIn(fadeDuration);
    action.play();
    this.currentAction = action;

    if (loop) {
      return;
    }

    await new Promise<void>((resolve) => {
      const mixer = this.mixer!;
      const durationMs = Number.isFinite(clip.duration) && clip.duration > 0
        ? clip.duration * 1000
        : 1000;
      const timeoutMs = Math.min(Math.max(durationMs + 500, 1000), 5 * 60 * 1000);
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        mixer.removeEventListener("finished", onFinished);
        resolve();
      };
      const onFinished = (event: any) => {
        if (event.action === action) {
          finish();
        }
      };
      mixer.addEventListener("finished", onFinished);
      timeoutId = setTimeout(finish, timeoutMs);
    });
  }
}

export function getTalkingFallbackId(candidate: string): string {
  const animation = animationRegistry.find((item) => item.id === candidate);
  return animation?.category === "talking" ? animation.id : candidate || "relax";
}
