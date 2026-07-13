import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip
} from "@pixiv/three-vrm-animation";
import { animationRegistry, getAnimationById } from "./animationRegistry.js";
import type { PlayAnimationOptions, VrmInstance } from "./types.js";
import { ensureVrmaSpecVersion } from "./vrmaMetadata.js";

export class AnimationController {
  private mixer: THREE.AnimationMixer | null = null;
  private currentAction: THREE.AnimationAction | null = null;
  private currentVrm: VrmInstance | null = null;
  private clipCache = new Map<string, THREE.AnimationClip>();
  private serial = 0;
  private finishCurrentAction: (() => void) | null = null;

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
    this.finishCurrentAction?.();
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

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not load VRMA ${url}: HTTP ${response.status}`);
    }
    const data = ensureVrmaSpecVersion(await response.arrayBuffer());
    const resolvedUrl = new URL(url, window.location.href);
    const resourcePath = resolvedUrl.href.slice(0, resolvedUrl.href.lastIndexOf("/") + 1);
    const gltf = await this.loader.parseAsync(data, resourcePath);
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
      let frameId: number | undefined;
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = undefined;
        }
        if (frameId !== undefined) {
          window.cancelAnimationFrame(frameId);
          frameId = undefined;
        }
        mixer.removeEventListener("finished", onFinished);
        if (this.finishCurrentAction === finish) {
          this.finishCurrentAction = null;
        }
        resolve();
      };
      const onFinished = (event: any) => {
        if (event.action === action) {
          finish();
        }
      };
      const observeCompletion = () => {
        if (settled) {
          return;
        }
        const reachedClipEnd = Number.isFinite(clip.duration)
          && clip.duration > 0
          && action.time >= clip.duration - 1 / 60;
        if (reachedClipEnd || (!action.isRunning() && action.time > 0)) {
          finish();
          return;
        }
        frameId = requestAnimationFrame(observeCompletion);
      };

      this.finishCurrentAction?.();
      this.finishCurrentAction = finish;
      mixer.addEventListener("finished", onFinished);
      timeoutId = setTimeout(finish, timeoutMs);
      frameId = requestAnimationFrame(observeCompletion);
    });
  }
}

export function getTalkingFallbackId(candidate: string): string {
  const animation = animationRegistry.find((item) => item.id === candidate);
  return animation?.category === "talking" ? animation.id : candidate || "relax";
}
