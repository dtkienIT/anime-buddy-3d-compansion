import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
import type { PlayAnimationOptions, VrmInstance } from "./types.js";
import type { CompanionExpression } from "@anime-buddy/shared";

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

interface SingingStage {
  group: THREE.Group;
  spotlights: THREE.SpotLight[];
  ledMaterials: THREE.MeshBasicMaterial[];
  ledBars: THREE.Mesh[];
  screenMaterial: THREE.ShaderMaterial;
  rings: THREE.Mesh[];
  heroRings: THREE.Mesh[];
  beams: THREE.Mesh[];
  particles: THREE.Points;
  particleBasePositions: Float32Array;
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
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly interactionBounds = new THREE.Box3();
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
  private singingStage: SingingStage | null = null;
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
    return characterRegistry;
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
    const next = getCharacterById(characterId);
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

  showSingingStage(): void {
    if (this.singingStage) return;

    const group = new THREE.Group();
    group.name = "SingingStage";
    group.position.set(0, 0, -0.72);
    group.renderOrder = -2;

    const backdropMaterial = new THREE.MeshBasicMaterial({
      color: 0x0b1230,
      transparent: true,
      opacity: 0.18,
      depthWrite: false
    });
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 4.5), backdropMaterial);
    backdrop.position.set(0, 2.15, -0.5);
    group.add(backdrop);

    const screenFrameMaterial = new THREE.MeshStandardMaterial({
      color: 0x261453,
      emissive: 0x6d28d9,
      emissiveIntensity: 0.9,
      metalness: 0.74,
      roughness: 0.24,
      transparent: true,
      opacity: 0.44,
      depthWrite: false
    });
    const screenFramePieces = [
      { size: [3.78, 0.055, 0.08] as const, position: [0, 3.02, -0.43] as const },
      { size: [3.78, 0.055, 0.08] as const, position: [0, 1.26, -0.43] as const },
      { size: [0.055, 1.82, 0.08] as const, position: [-1.86, 2.14, -0.43] as const },
      { size: [0.055, 1.82, 0.08] as const, position: [1.86, 2.14, -0.43] as const }
    ];
    for (const piece of screenFramePieces) {
      const framePiece = new THREE.Mesh(
        new THREE.BoxGeometry(piece.size[0], piece.size[1], piece.size[2]),
        screenFrameMaterial.clone()
      );
      framePiece.position.set(piece.position[0], piece.position[1], piece.position[2]);
      framePiece.renderOrder = -2;
      group.add(framePiece);
    }

    const screenMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uPulse;
        varying vec2 vUv;
        void main() {
          vec2 centered = vUv - 0.5;
          float vignette = smoothstep(0.78, 0.18, length(centered));
          float wave = 0.5 + 0.5 * sin(uTime * 1.2 + centered.x * 5.2 + centered.y * 3.8);
          float glow = exp(-8.0 * length(centered + vec2(0.0, 0.08)));
          vec3 deep = vec3(0.08, 0.025, 0.28);
          vec3 violet = vec3(0.62, 0.10, 0.74);
          vec3 cyan = vec3(0.08, 0.86, 0.92);
          vec3 color = mix(deep, violet, 0.5 + 0.32 * wave);
          color = mix(color, cyan, glow * (0.32 + 0.26 * uPulse));
          float starA = smoothstep(0.018, 0.0, abs(fract((vUv.x + uTime * 0.008) * 8.0) - 0.5));
          float starB = smoothstep(0.014, 0.0, abs(fract((vUv.y - uTime * 0.006) * 5.0) - 0.5));
          color += vec3(0.38, 0.68, 1.0) * starA * starB * 0.22;
          gl_FragColor = vec4((color + vec3(0.035, 0.02, 0.06)) * vignette, 0.98);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(3.54, 1.58), screenMaterial);
    screen.position.set(0, 2.14, -0.375);
    screen.renderOrder = -1;
    group.add(screen);

    const heroRings: THREE.Mesh[] = [];
    for (const [radius, color] of [[0.82, 0x67e8f9], [0.68, 0xf0abfc], [0.54, 0xa78bfa]] as const) {
      const heroRing = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.018, 8, 64),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.46,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      heroRing.position.set(0, 1.42, -0.3);
      heroRing.scale.y = 1.2;
      group.add(heroRing);
      heroRings.push(heroRing);
    }

    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0x8b5cf6,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(2.38, 0.045, 10, 96), haloMaterial);
    halo.position.set(0, 1.98, -0.33);
    halo.scale.y = 0.45;
    group.add(halo);

    const podiumMaterial = new THREE.MeshStandardMaterial({
      color: 0x171329,
      emissive: 0x24114f,
      emissiveIntensity: 0.62,
      metalness: 0.78,
      roughness: 0.3
    });
    const podium = new THREE.Mesh(new THREE.CylinderGeometry(2.45, 2.72, 0.16, 64), podiumMaterial);
    podium.position.set(0, 0.08, -0.25);
    podium.receiveShadow = true;
    group.add(podium);

    const podiumTopMaterial = new THREE.MeshStandardMaterial({
      color: 0x251d45,
      emissive: 0x34216c,
      emissiveIntensity: 0.72,
      metalness: 0.64,
      roughness: 0.26
    });
    const podiumTop = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.045, 64), podiumTopMaterial);
    podiumTop.position.set(0, 0.18, -0.25);
    podiumTop.receiveShadow = true;
    group.add(podiumTop);

    const rings: THREE.Mesh[] = [];
    for (const [radius, color] of [[2.12, 0x22d3ee], [1.76, 0xf472b6], [1.38, 0xa855f7]] as const) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(radius, 0.018, 8, 64),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.72,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      ring.position.set(0, 0.215, -0.25);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
      rings.push(ring);
    }

    const ledMaterials: THREE.MeshBasicMaterial[] = [];
    const ledBars: THREE.Mesh[] = [];
    const ledColors = [0x22d3ee, 0xa855f7, 0xf472b6, 0x38bdf8];
    for (let index = 0; index < 4; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: ledColors[index % ledColors.length],
        transparent: true,
        opacity: 0.76,
        depthWrite: false
      });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.72, 0.028), material);
      bar.position.set(index < 2 ? -2.04 : 2.04, 1.94 - (index % 2) * 0.18, -0.34);
      group.add(bar);
      ledMaterials.push(material);
      ledBars.push(bar);
    }

    const sidePillarMaterial = new THREE.MeshBasicMaterial({
      color: 0x6d28d9,
      transparent: true,
      opacity: 0.68,
      depthWrite: false
    });
    for (const x of [-2.22, 2.22]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.7, 0.16), sidePillarMaterial.clone());
      pillar.position.set(x, 1.46, -0.35);
      group.add(pillar);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.2), sidePillarMaterial.clone());
      cap.position.set(x, 2.78, -0.35);
      group.add(cap);
    }

    const beams: THREE.Mesh[] = [];
    const beamColors = [0x22d3ee, 0xa855f7, 0xf472b6];
    for (let index = 0; index < 3; index += 1) {
      const beamMaterial = new THREE.MeshBasicMaterial({
        color: beamColors[index],
        transparent: true,
        opacity: 0.11,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
      });
      const beam = new THREE.Mesh(new THREE.ConeGeometry(0.16, 3.5, 24, 1, true), beamMaterial);
      beam.position.set((index - 1) * 1.5, 2.12, -0.18);
      beam.rotation.x = Math.PI;
      beam.rotation.z = (index - 1) * 0.18;
      group.add(beam);
      beams.push(beam);
    }

    const spotlights: THREE.SpotLight[] = [];
    const spotlightColors = [0x22d3ee, 0xf472b6, 0xa855f7];
    for (let index = 0; index < 3; index += 1) {
      const spotlight = new THREE.SpotLight(spotlightColors[index], 3.2, 5.4, Math.PI / 8, 0.65, 1.2);
      spotlight.position.set((index - 1) * 1.8, 3.55, 0.3);
      spotlight.castShadow = index === 1;
      spotlight.shadow.mapSize.set(512, 512);
      const target = new THREE.Object3D();
      target.position.set((index - 1) * 0.65, 0.16, -0.2);
      group.add(target);
      spotlight.target = target;
      group.add(spotlight);
      spotlights.push(spotlight);
    }

    const particleBasePositions = new Float32Array(120 * 3);
    for (let index = 0; index < 120; index += 1) {
      particleBasePositions[index * 3] = (Math.random() - 0.5) * 5.4;
      particleBasePositions[index * 3 + 1] = 0.3 + Math.random() * 2.8;
      particleBasePositions[index * 3 + 2] = -0.05 - Math.random() * 0.65;
    }
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(particleBasePositions.slice(), 3));
    const particles = new THREE.Points(
      particleGeometry,
      new THREE.PointsMaterial({
        color: 0xf5d0fe,
        size: 0.026,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      })
    );
    group.add(particles);

    this.scene.add(group);
    this.singingStage = {
      group,
      spotlights,
      ledMaterials,
      ledBars,
      screenMaterial,
      rings,
      heroRings,
      beams,
      particles,
      particleBasePositions
    };
  }

  hideSingingStage(): void {
    const stage = this.singingStage;
    if (!stage) return;
    this.singingStage = null;
    this.scene.remove(stage.group);
    stage.group.traverse((node: any) => {
      node.geometry?.dispose?.();
      this.disposeMaterial(node.material);
    });
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
    this.hideSingingStage();
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
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.26);
    keyLight.position.set(1.7, 3.4, 2.3);
    keyLight.castShadow = true;
    keyLight.shadow.bias = -0.00012;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = 12;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.13);
    rimLight.position.set(-2.4, 1.8, 1.5);
    this.scene.add(rimLight);

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
    this.updateSingingStage(this.clock.elapsedTime);
    this.updateMicrophone(this.clock.elapsedTime);

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
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
    // Some third-party VRMs contain geometry groups whose material index is
    // missing. Three.js mesh raycasting throws for those assets, so use the
    // animated model's world-space bounds for a forgiving, material-agnostic
    // touch target.
    this.interactionBounds.setFromObject(this.modelRoot);
    const hit = !this.interactionBounds.isEmpty()
      && this.raycaster.ray.intersectsBox(this.interactionBounds);
    if (hit) this.options.onInteract?.();
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

  private updateSingingStage(time: number): void {
    const stage = this.singingStage;
    if (!stage || this.reducedMotion) return;

    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    const sweep = Math.sin(time * 0.82);
    stage.group.rotation.y = Math.sin(time * 0.18) * 0.018;
    stage.group.position.x = Math.sin(time * 0.24) * 0.018;
    stage.screenMaterial.uniforms.uTime.value = time;
    stage.screenMaterial.uniforms.uPulse.value = pulse;
    stage.rings.forEach((ring, index) => {
      ring.rotation.z = time * (0.12 + index * 0.035) * (index % 2 === 0 ? 1 : -1);
      ring.scale.setScalar(1 + 0.018 * Math.sin(time * 2.4 + index));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.48 + pulse * 0.3;
    });
    stage.heroRings.forEach((ring, index) => {
      ring.rotation.z = time * (0.18 + index * 0.045) * (index % 2 === 0 ? 1 : -1);
      ring.scale.set(
        1 + 0.04 * Math.sin(time * 1.8 + index),
        1.2 + 0.05 * Math.sin(time * 1.4 + index),
        1
      );
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.28 + pulse * 0.24;
    });

    stage.spotlights.forEach((spotlight, index) => {
      const phase = time * (0.72 + index * 0.11) + index * 1.9;
      spotlight.position.x = (index - 1) * 1.8 + Math.sin(phase) * 0.62;
      spotlight.position.z = 0.3 + Math.cos(phase * 0.8) * 0.18;
      spotlight.intensity = 2.3 + pulse * 1.65 + index * 0.12;
      spotlight.target.position.x = (index - 1) * 0.65 + Math.sin(phase * 0.7) * 0.42;
    });

    stage.ledBars.forEach((bar, index) => {
      const phase = time * 2.2 + index * 0.55;
      bar.scale.x = 0.94 + 0.08 * (0.5 + 0.5 * Math.sin(phase));
      bar.position.x = sweep * (index % 2 === 0 ? 0.035 : -0.035);
      stage.ledMaterials[index].opacity = 0.38 + 0.34 * (0.5 + 0.5 * Math.sin(phase + 0.7));
    });

    stage.beams.forEach((beam, index) => {
      beam.rotation.z = (index - 1) * 0.18 + Math.sin(time * 0.62 + index) * 0.09;
      (beam.material as THREE.MeshBasicMaterial).opacity =
        0.07 + 0.06 * (0.5 + 0.5 * Math.sin(time * 2.4 + index));
    });

    const positions = stage.particles.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const baseIndex = index * 3;
      positions.array[baseIndex] =
        stage.particleBasePositions[baseIndex] + Math.sin(time * 0.42 + index * 0.37) * 0.035;
      positions.array[baseIndex + 1] =
        stage.particleBasePositions[baseIndex + 1] + ((time * (0.035 + (index % 4) * 0.006) + index * 0.013) % 0.22);
    }
    positions.needsUpdate = true;
    stage.particles.rotation.y = time * 0.045;
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
    if (layoutChanged) this.applyDefaultFraming(false);
  }
}
