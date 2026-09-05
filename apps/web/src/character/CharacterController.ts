import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { VRMLoaderPlugin } from "@pixiv/three-vrm";
import { VRMAnimationLoaderPlugin } from "@pixiv/three-vrm-animation";
import {
  backgroundRegistry,
  characterRegistry,
  defaultAnimationId,
  defaultBackgroundId,
  defaultCharacterId,
  getBackgroundById,
  getCharacterById
} from "./characterRegistry.js";
import { animationRegistry } from "./animationRegistry.js";
import { AnimationController } from "./AnimationController.js";
import { ExpressionController } from "./ExpressionController.js";
import { LipSyncController } from "./LipSyncController.js";
import { LookAtController } from "./LookAtController.js";
import { PerformanceStageController } from "./PerformanceStageController.js";
import type { PlayAnimationOptions, VrmInstance } from "./types.js";
import type { CompanionExpression, PerformanceStageTheme } from "@anime-buddy/shared";

const targetHeight = 2.03;

export type StageComposition = "center" | "left" | "right";

export interface CharacterInitSelection {
  characterId?: string;
  backgroundId?: string;
  animationId?: string;
}

export interface CharacterControllerOptions {
  canvas: HTMLCanvasElement;
  onStatus: (message: string) => void;
  onBusy: (busy: boolean) => void;
  onProgress: (percent: number, note?: string) => void;
  onAnimationChange?: (animationId: string) => void;
  onInteract?: () => void;
  onHeadPat?: () => void;
}

interface MicrophoneRig {
  root: THREE.Group;
  hand: THREE.Object3D;
  head: THREE.Object3D;
  handle: THREE.Mesh;
  grille: THREE.Mesh;
  collar: THREE.Mesh;
  initialized: boolean;
  lastUpdateTime: number;
  length: number;
}

export class CharacterController {
  readonly expressions = new ExpressionController();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private readonly controls: OrbitControls;
  private readonly clock = new THREE.Clock();
  private readonly vrmLoader: GLTFLoader;
  private readonly animationLoader: GLTFLoader;
  private readonly animations: AnimationController;
  private readonly lookAt = new LookAtController();
  private readonly lipSync = new LipSyncController(this.expressions);
  private readonly performanceStage = new PerformanceStageController(this.scene);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly interactionBounds = new THREE.Box3();
  private readonly interactionPosition = new THREE.Vector3();
  private readonly framingTarget = new THREE.Vector3(0, 1.04, 0);
  private readonly microphoneHandPosition = new THREE.Vector3();
  private readonly microphoneHeadPosition = new THREE.Vector3();
  private readonly microphoneMouthPosition = new THREE.Vector3();
  private readonly microphoneDirection = new THREE.Vector3();
  private readonly microphoneCameraDirection = new THREE.Vector3();
  private readonly microphoneTargetPosition = new THREE.Vector3();
  private readonly microphoneUp = new THREE.Vector3(0, 1, 0);
  private readonly microphoneTargetQuaternion = new THREE.Quaternion();
  private currentVrm: VrmInstance | null = null;
  private modelRoot: THREE.Group | null = null;
  private microphone: MicrophoneRig | null = null;
  private readonly customCharacters = new Map<string, any>();
  private currentCharacterId = defaultCharacterId;
  private currentAnimationId = defaultAnimationId;
  private currentBackgroundId = defaultBackgroundId;
  private renderLoopStarted = false;
  private targetRenderFps = 30;
  private lastRenderAt = 0;
  private modelSerial = 0;
  private pointerDown: { x: number; y: number; at: number } | null = null;
  private responsiveLayout = "";
  private stageComposition: StageComposition = "center";
  private reducedMotion = false;
  private gazeEnabled = true;
  private nextBlinkAt = 2.4;
  private blinkStartedAt = -1;
  private renderFrameId: number | null = null;
  private disposed = false;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bloomEnabled = true;
  private ambientLight: THREE.AmbientLight | null = null;
  private keyLight: THREE.DirectionalLight | null = null;
  private rimLight: THREE.DirectionalLight | null = null;
  private lightingMode: "auto" | "day" | "sunset" | "night" = "auto";
  private lastLightingUpdateAt = 0;
  private readonly onResize = (): void => this.resize();
  private readonly onPointerMove = (event: globalThis.PointerEvent): void => this.handlePointerMove(event);
  private readonly onPointerLeave = (): void => this.lookAt.center();
  private readonly onPointerDown = (event: globalThis.PointerEvent): void => {
    if (event.button !== 0 || !event.isPrimary) {
      this.pointerDown = null;
      return;
    }
    this.pointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
  };
  private readonly onPointerUp = (event: globalThis.PointerEvent): void => this.handlePointerUp(event);

  constructor(private readonly options: CharacterControllerOptions) {
    THREE.Cache.enabled = true;

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => {
      const ratio = total > 0 ? Math.round((loaded / total) * 100) : 36;
      this.options.onProgress(Math.max(12, Math.min(96, ratio)));
    };

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas: options.canvas,
      powerPreference: "high-performance"
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.94;

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.camera.position.set(0, 1.13, 10);
    this.camera.lookAt(this.framingTarget);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.enableRotate = true;
    this.controls.enableZoom = true;
    this.controls.minPolarAngle = Math.PI / 2;
    this.controls.maxPolarAngle = Math.PI / 2;
    this.controls.minZoom = 0.82;
    this.controls.maxZoom = 1.55;
    this.controls.target.copy(this.framingTarget);
    this.controls.update();

    this.addLightsAndFloor();
    this.scene.add(this.lookAt.target);

    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.30,
      0.38,
      0.82
    );
    this.composer.addPass(this.bloomPass);
    this.applyLightingMode();

    this.vrmLoader = new GLTFLoader(manager);
    this.vrmLoader.register((parser) => new VRMLoaderPlugin(parser));
    this.animationLoader = new GLTFLoader(manager);
    this.animationLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    this.animations = new AnimationController(this.animationLoader);

    window.addEventListener("resize", this.onResize);
    this.options.canvas.addEventListener("pointermove", this.onPointerMove);
    this.options.canvas.addEventListener("pointerleave", this.onPointerLeave);
    this.options.canvas.addEventListener("pointerdown", this.onPointerDown);
    this.options.canvas.addEventListener("pointerup", this.onPointerUp);
    this.resize();
  }

  async init(selection: CharacterInitSelection = {}): Promise<void> {
    const background = getBackgroundById(selection.backgroundId).id;
    const character = getCharacterById(selection.characterId).id;
    const animation = animationRegistry.some((item) => item.id === selection.animationId)
      ? selection.animationId!
      : defaultAnimationId;
    this.switchBackground(background);
    this.options.onProgress(20, "Đang tải nhân vật…");
    await this.switchModel(character, true);
    await this.playAnimation(animation, { loop: true });
    this.options.onProgress(100, "Sẵn sàng");
    this.startRenderLoop();
  }

  getCharacters() {
    return [...characterRegistry, ...this.customCharacters.values()];
  }

  async loadCustomVrm(file: File): Promise<string> {
    const customId = `custom-${Date.now()}`;
    const url = URL.createObjectURL(file);
    const label = file.name.replace(/\.[^/.]+$/, "");
    const item = {
      id: customId,
      label,
      description: "Avatar VRM tùy chỉnh",
      persona: "Một người bạn đồng hành ảo thân thiết và tốt bụng.",
      url
    };
    this.customCharacters.set(customId, item);
    await this.switchModel(customId);
    return customId;
  }

  getAnimations() {
    return animationRegistry;
  }

  getBackgrounds() {
    return backgroundRegistry;
  }

  getCurrentCharacterId(): string {
    return this.currentCharacterId;
  }

  getCurrentAnimationId(): string {
    return this.currentAnimationId;
  }

  getCurrentBackgroundId(): string {
    return this.currentBackgroundId;
  }

  getAvailableAnimationIds(): string[] {
    return animationRegistry.map((animation) => animation.id);
  }

  async switchModel(characterId: string, initial = false): Promise<void> {
    const next = this.customCharacters.get(characterId) ?? getCharacterById(characterId);
    if (!initial && next.id === this.currentCharacterId && this.currentVrm) {
      return;
    }

    const requestId = ++this.modelSerial;
    this.hideMicrophone();
    this.options.onBusy(true);
    this.options.onStatus(`Đang chuẩn bị ${next.label}…`);

    try {
      const nextVrm = await this.loadVrm(next.url, next);
      if (requestId !== this.modelSerial) {
        this.disposeMountedVrm(nextVrm, nextVrm.scene);
        return;
      }

      const nextRoot = this.mountVrm(nextVrm, next);
      const previousRoot = this.modelRoot;
      const previousVrm = this.currentVrm;

      this.animations.stop();
      if (previousRoot) {
        this.scene.remove(previousRoot);
      }

      this.currentVrm = nextVrm;
      this.modelRoot = nextRoot;
      this.currentCharacterId = next.id;
      this.scene.add(nextRoot);
      this.expressions.setVrm(nextVrm);
      this.lookAt.setVrm(nextVrm);
      this.animations.setVrm(nextVrm);
      this.disposeMountedVrm(previousVrm, previousRoot);
      this.options.onStatus(next.label);
      await this.playAnimation(initial ? this.currentAnimationId : defaultAnimationId, { loop: true });
    } finally {
      if (requestId === this.modelSerial) {
        this.options.onBusy(false);
      }
    }
  }

  async playAnimation(animationId: string, options: PlayAnimationOptions = {}): Promise<void> {
    this.currentAnimationId = animationId;
    this.options.onAnimationChange?.(animationId);
    const resolvedAnimationId = await this.animations.play(animationId, options);
    if (resolvedAnimationId && resolvedAnimationId !== this.currentAnimationId) {
      this.currentAnimationId = resolvedAnimationId;
      this.options.onAnimationChange?.(resolvedAnimationId);
    }
    const animation = animationRegistry.find((item) => item.id === animationId);
    const loop = options.loop ?? animation?.loop ?? false;
    if (options.autoIdle && !loop && this.currentAnimationId === animationId) {
      await this.playAnimation(defaultAnimationId, { loop: true });
    }
  }

  async preloadAnimationAsset(url: string): Promise<void> {
    await this.animations.preload(url);
  }

  async playAnimationAsset(url: string, options: PlayAnimationOptions = {}): Promise<void> {
    await this.animations.playAsset(url, options);
  }

  switchBackground(backgroundId: string): void {
    const next = getBackgroundById(backgroundId);
    this.currentBackgroundId = next.id;
    document.documentElement.style.setProperty("--room-background", `url("${next.url}")`);
  }

  resetCamera(): void {
    this.applyDefaultFraming(true);
  }

  setStageComposition(composition: StageComposition): void {
    if (this.stageComposition === composition) return;
    this.stageComposition = composition;
    this.applyDefaultFraming(false);
  }

  zoomBy(delta: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom + delta, this.controls.minZoom, this.controls.maxZoom);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    if (reduced && this.modelRoot) this.modelRoot.position.y = 0;
    this.lookAt.setEnabled(this.gazeEnabled && !reduced);
    if (reduced) {
      this.expressions.setBlink(0);
      this.blinkStartedAt = -1;
    }
  }

  setBloomEnabled(enabled: boolean): void {
    this.bloomEnabled = enabled;
  }

  setLightingMode(mode: "auto" | "day" | "sunset" | "night"): void {
    this.lightingMode = mode;
    this.applyLightingMode();
  }

  private applyLightingMode(): void {
    if (!this.ambientLight || !this.keyLight || !this.rimLight) return;

    let effectiveMode = this.lightingMode;
    if (effectiveMode === "auto") {
      const hour = new Date().getHours();
      if (hour >= 6 && hour < 16) effectiveMode = "day";
      else if (hour >= 16 && hour < 19) effectiveMode = "sunset";
      else effectiveMode = "night";
    }

    if (effectiveMode === "day") {
      this.ambientLight.color.setHex(0xffffff);
      this.ambientLight.intensity = 0.74;
      this.keyLight.color.setHex(0xfffbf5);
      this.keyLight.intensity = 1.28;
      this.rimLight.color.setHex(0x93c5fd);
      this.rimLight.intensity = 0.15;
    } else if (effectiveMode === "sunset") {
      this.ambientLight.color.setHex(0xffeedd);
      this.ambientLight.intensity = 0.68;
      this.keyLight.color.setHex(0xffaa5e);
      this.keyLight.intensity = 1.34;
      this.rimLight.color.setHex(0xe879f9);
      this.rimLight.intensity = 0.24;
    } else {
      this.ambientLight.color.setHex(0x6366f1);
      this.ambientLight.intensity = 0.58;
      this.keyLight.color.setHex(0xc7d2fe);
      this.keyLight.intensity = 1.08;
      this.rimLight.color.setHex(0x38bdf8);
      this.rimLight.intensity = 0.32;
    }
  }

  setGazeEnabled(enabled: boolean): void {
    this.gazeEnabled = enabled;
    this.lookAt.setEnabled(enabled && !this.reducedMotion);
  }

  setExpression(expression: CompanionExpression, intensity?: number): void {
    this.expressions.setExpression(expression, intensity);
  }

  attachLipSyncAnalyser(analyser: AnalyserNode | null): void {
    this.lipSync.attachAnalyser(analyser);
  }

  startLipSync(): void {
    this.lipSync.start();
  }

  stopLipSync(): void {
    this.lipSync.stop();
  }

  showPerformanceStage(theme: PerformanceStageTheme): void {
    this.performanceStage.show(theme);
  }

  hidePerformanceStage(): void {
    this.performanceStage.hide();
  }

  attachPerformanceAnalyser(analyser: AnalyserNode | null): void {
    this.performanceStage.setAnalyser(analyser);
  }

  showMicrophone(): boolean {
    this.hideMicrophone();
    const humanoid = this.currentVrm?.humanoid;
    const hand = humanoid?.getNormalizedBoneNode?.("rightHand")
      ?? humanoid?.getRawBoneNode?.("rightHand");
    const head = humanoid?.getNormalizedBoneNode?.("head")
      ?? humanoid?.getRawBoneNode?.("head");
    if (!hand || !head) return false;

    const root = new THREE.Group();
    root.name = "CompanionMicrophone";
    root.renderOrder = 3;

    const handleMaterial = new THREE.MeshStandardMaterial({
      color: 0x17191f,
      emissive: 0x08090d,
      emissiveIntensity: 0.18,
      metalness: 0.62,
      roughness: 0.32,
      depthTest: false,
      depthWrite: false
    });
    const grilleMaterial = new THREE.MeshStandardMaterial({
      color: 0xaeb5c0,
      emissive: 0x151820,
      emissiveIntensity: 0.14,
      metalness: 0.78,
      roughness: 0.38,
      depthTest: false,
      depthWrite: false
    });
    const collarMaterial = new THREE.MeshStandardMaterial({
      color: 0x323640,
      metalness: 0.82,
      roughness: 0.28,
      depthTest: false,
      depthWrite: false
    });

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.2, 24), handleMaterial);
    handle.position.y = 0.1;
    const grille = new THREE.Mesh(new THREE.SphereGeometry(0.028, 28, 20), grilleMaterial);
    grille.position.y = 0.225;
    grille.scale.y = 1.18;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.018, 0.018, 24), collarMaterial);
    collar.position.y = 0.194;
    const endCap = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.013, 0.012, 20), collarMaterial);
    endCap.position.y = -0.006;
    root.add(handle, grille, collar, endCap);
    root.traverse((node: any) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.frustumCulled = false;
        node.renderOrder = 3;
      }
    });
    this.scene.add(root);
    this.microphone = {
      root,
      hand,
      head,
      handle,
      grille,
      collar,
      initialized: false,
      lastUpdateTime: this.clock.elapsedTime,
      length: 0.225
    };
    this.updateMicrophone(this.clock.elapsedTime);
    return true;
  }

  hideMicrophone(): void {
    const microphone = this.microphone;
    if (!microphone) return;
    this.microphone = null;
    this.scene.remove(microphone.root);
    microphone.root.traverse((node: any) => {
      node.geometry?.dispose?.();
      this.disposeMaterial(node.material);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    window.removeEventListener("resize", this.onResize);
    this.options.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.options.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.options.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.options.canvas.removeEventListener("pointerup", this.onPointerUp);
    if (this.renderFrameId !== null) window.cancelAnimationFrame(this.renderFrameId);
    this.renderFrameId = null;
    this.lipSync.stop();
    this.performanceStage.dispose();
    this.hideMicrophone();
    this.animations.dispose();
    this.disposeMountedVrm(this.currentVrm, this.modelRoot);
    this.controls.dispose();
    this.scene.environment?.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
  }

  private async loadVrm(url: string, option: { id: string; rotationY?: number }): Promise<VrmInstance> {
    const gltf = await this.vrmLoader.loadAsync(url);
    const vrm = gltf.userData.vrm;
    if (!vrm) {
      throw new Error(`VRM not found: ${url}`);
    }

    vrm.scene.rotation.y = option.rotationY ?? Math.PI;
    vrm.scene.userData.viewerModelId = option.id;
    this.tuneVrmMaterials(vrm);
    return vrm;
  }

  private mountVrm(vrm: VrmInstance, option: { label: string; targetHeight?: number; yOffset?: number; scaleMultiplier?: number }): THREE.Group {
    const root = new THREE.Group();
    root.name = option.label;
    vrm.scene.updateMatrixWorld(true);

    const bounds = new THREE.Box3().setFromObject(vrm.scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bounds.getSize(size);
    bounds.getCenter(center);

    const scale = (option.targetHeight ?? targetHeight) / Math.max(size.y, 0.1);
    vrm.scene.position.set(-center.x, -bounds.min.y + (option.yOffset ?? 0), -center.z);
    root.scale.setScalar(scale * (option.scaleMultiplier ?? 1));
    root.add(vrm.scene);
    return root;
  }

  private addLightsAndFloor(): void {
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(this.ambientLight);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 1.26);
    this.keyLight.position.set(1.7, 3.4, 2.3);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.bias = -0.00012;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.left = -4;
    this.keyLight.shadow.camera.right = 4;
    this.keyLight.shadow.camera.top = 4;
    this.keyLight.shadow.camera.bottom = -4;
    this.keyLight.shadow.camera.near = 0.1;
    this.keyLight.shadow.camera.far = 12;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(0x93c5fd, 0.13);
    this.rimLight.position.set(-2.4, 1.8, 1.5);
    this.scene.add(this.rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(8.5, 8.5),
      new THREE.ShadowMaterial({ opacity: 0.18, transparent: true })
    );
    floor.position.set(0, -0.002, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const softShadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 48),
      new THREE.MeshBasicMaterial({
        color: 0x101828,
        depthWrite: false,
        opacity: 0.12,
        transparent: true
      })
    );
    softShadow.position.set(0, 0.004, 0.04);
    softShadow.rotation.x = -Math.PI / 2;
    softShadow.scale.set(1.15, 0.44, 1);
    this.scene.add(softShadow);
  }

  private tuneVrmMaterials(vrm: VrmInstance): void {
    vrm.scene.traverse((node: any) => {
      if (!node.isMesh) {
        return;
      }

      node.castShadow = true;
      node.receiveShadow = true;
      node.frustumCulled = false;
      const material = this.stripOutlineMaterials(node.material);
      if (material) {
        node.material = material;
      }
      this.softenMaterial(node.material, node.name);
    });
  }

  private stripOutlineMaterials(material: any): any {
    if (!material) {
      return material;
    }

    if (Array.isArray(material)) {
      const stripped = material
        .filter((candidate) => !candidate?.isOutline)
        .map((candidate) => this.sanitizeMaterial(candidate))
        .filter(Boolean);
      return stripped.length > 0 ? stripped : material.map((candidate) => this.sanitizeMaterial(candidate)).filter(Boolean);
    }

    if (material.isOutline) {
      return this.sanitizeMaterial(material);
    }

    return this.sanitizeMaterial(material);
  }

  private sanitizeMaterial(material: any): any {
    if (!material) {
      return material;
    }

    if ("outlineWidthFactor" in material) material.outlineWidthFactor = 0;
    if ("outlineWidthMode" in material) material.outlineWidthMode = "none";
    if ("outlineLightingMixFactor" in material) material.outlineLightingMixFactor = 0;
    if ("shadingToonyFactor" in material) material.shadingToonyFactor = Math.min(material.shadingToonyFactor ?? 1, 0.42);
    if ("shadingShiftFactor" in material) material.shadingShiftFactor = Math.max(material.shadingShiftFactor ?? 0, -0.02);
    if ("alphaToCoverage" in material && material.transparent) material.alphaToCoverage = true;
    material.side = THREE.FrontSide;
    material.needsUpdate = true;
    return material;
  }

  private softenMaterial(material: any, meshName = ""): void {
    if (!material) {
      return;
    }

    const materials = Array.isArray(material) ? material : [material];
    materials.forEach((candidate) => {
      const hairLike = this.isHairLikeName(candidate.name) || this.isHairLikeName(meshName);
      this.multiplyNumber(candidate, "rimLightingMixFactor", hairLike ? 0.35 : 0.5);
      this.multiplyNumber(candidate, "parametricRimFresnelPowerFactor", hairLike ? 0.45 : 0.6);
      this.multiplyNumber(candidate, "parametricRimLiftFactor", hairLike ? 0.45 : 0.55);
      this.multiplyNumber(candidate, "outlineLightingMixFactor", 0.6);
      this.multiplyNumber(candidate, "envMapIntensity", hairLike ? 0.35 : 0.5);
      this.multiplyNumber(candidate, "specularIntensity", hairLike ? 0.25 : 0.45);
      this.multiplyNumber(candidate, "emissiveIntensity", hairLike ? 0.3 : 0.55);
      this.multiplyNumber(candidate, "metalness", hairLike ? 0.4 : 0.65);

      if (candidate.matcapFactor?.multiplyScalar) {
        candidate.matcapFactor.multiplyScalar(hairLike ? 0.35 : 0.5);
      } else {
        this.multiplyNumber(candidate, "matcapFactor", hairLike ? 0.35 : 0.5);
      }

      if (candidate.shadeColorFactor?.multiplyScalar && hairLike) {
        candidate.shadeColorFactor.multiplyScalar(0.94);
      }

      if (typeof candidate.roughness === "number") {
        candidate.roughness = Math.min(1, candidate.roughness + (hairLike ? 0.24 : 0.18));
      }

      candidate.needsUpdate = true;
    });
  }

  private multiplyNumber(target: any, key: string, factor: number): void {
    if (typeof target[key] === "number") {
      target[key] *= factor;
    }
  }

  private isHairLikeName(value: string): boolean {
    return /(hair|bang|fringe|fronthair|backhair|sidehair|ahoge|tail|twintail)/i.test(value);
  }

  private disposeMountedVrm(vrm: VrmInstance | null, root: THREE.Object3D | null): void {
    if (root) {
      root.traverse((node: any) => {
        node.geometry?.dispose?.();
        this.disposeMaterial(node.material);
      });
    }

    try {
      vrm?.dispose?.();
    } catch (error) {
      console.warn("Could not fully dispose VRM", error);
    }
  }

  private disposeMaterial(material: any): void {
    if (!material) {
      return;
    }

    if (Array.isArray(material)) {
      material.forEach((candidate) => this.disposeMaterial(candidate));
      return;
    }

    Object.keys(material).forEach((key) => {
      const value = material[key];
      if (value?.isTexture) {
        value.dispose();
      }
    });

    material.dispose?.();
  }

  private startRenderLoop(): void {
    if (this.renderLoopStarted) {
      return;
    }

    this.renderLoopStarted = true;
    this.clock.start();
    this.renderFrameId = requestAnimationFrame((timestamp) => this.animate(timestamp));
  }

  private animate(timestamp: number): void {
    if (this.disposed) return;
    this.renderFrameId = requestAnimationFrame((nextTimestamp) => this.animate(nextTimestamp));
    if (timestamp - this.lastRenderAt < 1000 / this.targetRenderFps) {
      return;
    }
    this.lastRenderAt = timestamp;
    const delta = Math.min(this.clock.getDelta(), 1 / 30);
    this.animations.update(delta);
    this.currentVrm?.update(delta);
    if (!this.reducedMotion) this.lookAt.update(delta);
    this.lipSync.update();
    if (!this.reducedMotion) this.updateBlink(this.clock.elapsedTime);

    if (this.modelRoot) {
      const time = this.clock.elapsedTime;
      this.modelRoot.position.y = this.reducedMotion ? 0 : Math.sin(time * 1.35) * 0.006;
    }
    this.performanceStage.update(this.clock.elapsedTime, this.reducedMotion);
    this.updateMicrophone(this.clock.elapsedTime);

    if (this.lightingMode === "auto" && timestamp - this.lastLightingUpdateAt > 60000) {
      this.lastLightingUpdateAt = timestamp;
      this.applyLightingMode();
    }

    this.controls.update();
    if (this.bloomEnabled && this.composer && !this.reducedMotion) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  setRenderRate(fps: number): void {
    this.targetRenderFps = Math.max(1, Math.min(30, Math.round(fps)));
  }

  private handlePointerMove(event: globalThis.PointerEvent): void {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const normalizedY = 1 - ((event.clientY - rect.top) / rect.height) * 2;
    this.lookAt.followPointer(normalizedX, normalizedY);
  }

  private handlePointerUp(event: globalThis.PointerEvent): void {
    const down = this.pointerDown;
    this.pointerDown = null;
    if (!down || !this.modelRoot || event.button !== 0) return;
    const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    if (distance > 8 || performance.now() - down.at > 600) return;

    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      1 - ((event.clientY - rect.top) / rect.height) * 2
    );
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    // Some third-party VRMs expose stale or enormous skinned-mesh bounds after
    // animation. Mesh raycasting can also throw when material indices are
    // incomplete. Use a stable, normalized person-shaped world-space target:
    // every mounted companion is scaled to roughly 2 m and stands at root Y.
    // This keeps shoulders/torso easy to tap without turning the whole canvas
    // into an interaction hotspot.
    this.modelRoot.getWorldPosition(this.interactionPosition);
    this.interactionBounds.min.set(
      this.interactionPosition.x - 0.66,
      this.interactionPosition.y - 0.04,
      this.interactionPosition.z - 0.42
    );
    this.interactionBounds.max.set(
      this.interactionPosition.x + 0.66,
      this.interactionPosition.y + 2.18,
      this.interactionPosition.z + 0.42
    );
    const hitPoint = new THREE.Vector3();
    const hit = !this.interactionBounds.isEmpty()
      && this.raycaster.ray.intersectBox(this.interactionBounds, hitPoint);
    if (hit) {
      const isHead = hitPoint.y >= this.interactionPosition.y + 1.25;
      if (isHead) {
        this.spawnHeartParticle(event.clientX, event.clientY);
        if (this.options.onHeadPat) {
          this.options.onHeadPat();
        } else {
          this.options.onInteract?.();
        }
      } else {
        this.options.onInteract?.();
      }
    }
  }

  private spawnHeartParticle(clientX: number, clientY: number): void {
    const particle = document.createElement("div");
    particle.className = "heart-particle";
    particle.textContent = Math.random() > 0.35 ? "❤️" : "✨";
    particle.style.left = `${clientX}px`;
    particle.style.top = `${clientY}px`;
    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), 1200);
  }

  private updateBlink(time: number): void {
    if (this.blinkStartedAt >= 0) {
      const elapsed = time - this.blinkStartedAt;
      const duration = 0.16;
      if (elapsed >= duration) {
        this.expressions.setBlink(0);
        this.blinkStartedAt = -1;
        this.nextBlinkAt = time + 2.4 + Math.random() * 3.2;
      } else {
        this.expressions.setBlink(Math.sin((elapsed / duration) * Math.PI));
      }
      return;
    }

    if (time >= this.nextBlinkAt) this.blinkStartedAt = time;
  }

  private updateMicrophone(time: number): void {
    const microphone = this.microphone;
    if (!microphone) return;

    const handPosition = this.microphoneHandPosition;
    const mouthPosition = this.microphoneMouthPosition;
    // The normalized hand origin is at the wrist. Move the grip slightly
    // toward the palm and toward the camera so the microphone stays visible
    // instead of disappearing behind the forearm.
    handPosition.set(0, -0.024, 0.052);
    microphone.hand.localToWorld(handPosition);
    // Use a head-local target so the microphone follows head turns while
    // remaining just below and beside the lips instead of covering the face.
    mouthPosition.set(0.028, 0.025, 0.18);
    microphone.head.localToWorld(mouthPosition);
    // Some VRM heads expose their forward axis opposite to the stage camera.
    // If the local mouth point falls on the far side during an orbit, mirror
    // that same distance onto the camera-facing side instead of crossing the
    // microphone through the neck.
    microphone.head.getWorldPosition(this.microphoneHeadPosition);
    this.microphoneCameraDirection.subVectors(this.camera.position, this.microphoneHeadPosition);
    const headOffset = this.microphoneDirection.subVectors(mouthPosition, this.microphoneHeadPosition);
    if (
      this.microphoneCameraDirection.lengthSq() > 1e-6 &&
      headOffset.lengthSq() > 1e-6
    ) {
      this.microphoneCameraDirection.normalize();
      if (headOffset.dot(this.microphoneCameraDirection) < 0) {
        const mouthDistance = headOffset.length();
        mouthPosition.copy(this.microphoneHeadPosition)
          .addScaledVector(this.microphoneCameraDirection, mouthDistance);
        mouthPosition.y += 0.025;
      }
    }
    const direction = this.microphoneDirection.subVectors(mouthPosition, handPosition);
    const handToMouthDistance = direction.length();
    if (handToMouthDistance < 1e-3) direction.set(0, 1, 0);
    direction.normalize();

    const gripOffset = 0.045;
    const targetLength = THREE.MathUtils.clamp(handToMouthDistance + gripOffset, 0.19, 0.36);
    this.microphoneTargetPosition.copy(handPosition).addScaledVector(direction, -gripOffset);
    // Keep the prop just in front of the animated hand/face from the current
    // camera angle. A fixed world-Z offset breaks as soon as OrbitControls
    // moves around the character and makes the microphone cross the neck.
    this.microphoneCameraDirection.subVectors(this.camera.position, mouthPosition);
    if (this.microphoneCameraDirection.lengthSq() > 1e-6) {
      this.microphoneCameraDirection.normalize();
      // The prop is deliberately brought a little farther toward the
      // viewer than the hand. This keeps it readable from a side/back orbit
      // instead of letting the head occlude the grille.
      this.microphoneTargetPosition.addScaledVector(this.microphoneCameraDirection, 0.105);
    }
    this.microphoneTargetQuaternion.setFromUnitVectors(this.microphoneUp, direction);

    let smoothing = 1;
    if (!microphone.initialized) {
      microphone.root.position.copy(this.microphoneTargetPosition);
      microphone.root.quaternion.copy(this.microphoneTargetQuaternion);
      microphone.length = targetLength;
      microphone.initialized = true;
    } else {
      const deltaSeconds = Math.min(0.05, Math.max(0, time - microphone.lastUpdateTime));
      smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-deltaSeconds * 14);
      microphone.root.position.lerp(this.microphoneTargetPosition, smoothing);
      microphone.root.quaternion.slerp(this.microphoneTargetQuaternion, smoothing);
      microphone.length = THREE.MathUtils.lerp(microphone.length, targetLength, smoothing);
    }

    const handleLength = Math.max(0.12, microphone.length - 0.032);
    microphone.handle.position.y = handleLength / 2;
    microphone.handle.scale.y = handleLength / 0.2;
    microphone.collar.position.y = microphone.length - 0.031;
    microphone.grille.position.y = microphone.length;
    microphone.lastUpdateTime = time;
  }

  private applyDefaultFraming(resetZoom: boolean): void {
    const layout = this.responsiveLayout || this.resolveResponsiveLayout();
    if (layout === "mobile") {
      this.framingTarget.set(0, 1.22, 0);
    } else if (layout === "compact") {
      // The orthographic camera looks towards the target: a positive target X
      // places the model on the left (clear of the right chat), and vice versa.
      const targetX = this.stageComposition === "left" ? 0.34 : this.stageComposition === "right" ? -0.34 : 0;
      this.framingTarget.set(targetX, 1.12, 0);
    } else {
      this.framingTarget.set(0, 1.04, 0);
    }

    this.camera.position.set(this.framingTarget.x, this.framingTarget.y + 0.09, 10);
    this.camera.lookAt(this.framingTarget);
    this.controls.target.copy(this.framingTarget);
    if (resetZoom) this.camera.zoom = 1;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.controls.saveState();
  }

  private resolveResponsiveLayout(): "mobile" | "compact" | "desktop" {
    if (window.innerWidth < 760) return "mobile";
    if (window.innerWidth < 1100) return "compact";
    return "desktop";
  }

  private resize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const aspect = width / Math.max(height, 1);
    const nextLayout = this.resolveResponsiveLayout();
    const layoutChanged = nextLayout !== this.responsiveLayout;
    this.responsiveLayout = nextLayout;
    const viewHeight = nextLayout === "mobile" ? 2.25 : nextLayout === "compact" ? 2.42 : 2.52;

    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    this.renderer.setSize(width, height);
    this.composer?.setSize(width, height);
    this.bloomPass?.resolution.set(width, height);
    if (layoutChanged) this.applyDefaultFraming(false);
  }
}
