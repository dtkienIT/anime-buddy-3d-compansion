import * as THREE from "../../frontend/node_modules/three/build/three.module.js";
import { OrbitControls } from "../../frontend/node_modules/three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "../../frontend/node_modules/three/examples/jsm/environments/RoomEnvironment.js";
import { GLTFLoader } from "../../frontend/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin } from "../../frontend/node_modules/@pixiv/three-vrm/lib/three-vrm.module.js";
import {
  VRMAnimationLoaderPlugin,
  VRMLookAtQuaternionProxy,
  createVRMAnimationClip,
} from "../../frontend/node_modules/@pixiv/three-vrm-animation/lib/three-vrm-animation.module.js";

const MODEL_OPTIONS = [
  { id: "mika", label: "Mika", url: "./vrm-models/8590256991748008892.vrm" },
  { id: "kato", label: "Kato", url: "./vrm-models/8329890252317737768.vrm" },
  { id: "sam", label: "Sam", url: "./vrm-models/sample.vrm" },
  { id: "vivi", label: "Vivi", url: "./vrm-models/vita.vrm" },
  { id: "tita", label: "Tita", url: "./vrm-models/vivi.vrm" },
  { id: "luna", label: "Luna", url: "./vrm-models/6493143135142452442.vrm" },
  { id: "naruto", label: "Naruto", url: "./vrm-models/naruto.vrm" },
  { id: "changli", label: "Changli", url: "./vrm-models/Changli.vrm" },
  { id: "yinlin", label: "Yinlin", url: "./vrm-models/Yinlin.vrm" },
  { id: "carlotta", label: "Carlotta", url: "./vrm-models/Carlotta.vrm" },
];

const ANIMATION_OPTIONS = [
  { id: "greeting", label: "Greeting", url: "./animations/Greeting.vrma" },
  { id: "relax", label: "Relax", url: "./animations/Relax.vrma" },
  { id: "thinking", label: "Thinking", url: "./animations/Thinking.vrma" },
  { id: "shake-head", label: "Shake Head", url: "./animations/ShakeHead.vrma" },
  { id: "dance-25", label: "Dance 25", url: "./animations/Dance25.vrma" },
  { id: "welcome-pose", label: "Welcome Pose", url: "./animations/WelcomePose.vrma" },
  { id: "cute-pose", label: "Cute Pose", url: "./animations/CutePose.vrma" },
  { id: "victory-pose", label: "Victory Pose", url: "./animations/VictoryPose.vrma" },
  { id: "presentation-pose", label: "Presentation Pose", url: "./animations/PresentationPose.vrma" },
  { id: "motion-pose", label: "Motion Pose", url: "./animations/MotionPose.vrma" },
  { id: "dogeza", label: "Dogeza", url: "./animations/Dogeza.vrma" },
  { id: "step-exercise", label: "Step Exercise", url: "./animations/StepExercise.vrma" },
  { id: "hello", label: "Hello", url: "./animations/Hello.vrma" },
  { id: "smartphone", label: "Smartphone", url: "./animations/Smartphone.vrma" },
  { id: "drink-water", label: "Drink Water", url: "./animations/DrinkWater.vrma" },
  { id: "encourage", label: "Encourage", url: "./animations/Encourage.vrma" },
  { id: "startled", label: "Startled", url: "./animations/Startled.vrma" },
  { id: "look-around", label: "Look Around", url: "./animations/LookAround.vrma" },
  { id: "clapping", label: "Clapping", url: "./animations/Clapping.vrma" },
  { id: "goodbye", label: "Goodbye", url: "./animations/Goodbye.vrma" },
  { id: "jump", label: "Jump", url: "./animations/Jump.vrma" },
  { id: "angry", label: "Angry", url: "./animations/Angry.vrma" },
  { id: "blush", label: "Blush", url: "./animations/Blush.vrma" },
  { id: "sad", label: "Sad", url: "./animations/Sad.vrma" },
  { id: "sleepy", label: "Sleepy", url: "./animations/Sleepy.vrma" },
  { id: "surprised", label: "Surprised", url: "./animations/Surprised.vrma" },
  { id: "peace", label: "Peace", url: "./animations/Peace.vrma" },
  { id: "shoot", label: "Shoot", url: "./animations/Shoot.vrma" },
  { id: "spin", label: "Spin", url: "./animations/Spin.vrma" },
  { id: "pose", label: "Pose", url: "./animations/Pose.vrma" },
  { id: "squat", label: "Squat", url: "./animations/Squat.vrma" },
  { id: "vrma-01", label: "VRMA 01", url: "./animations/vrma_01.vrma" },
];

const BACKGROUND_OPTIONS = [
  { id: "study-room-sunlit", label: "Study Room", url: "./backgrounds/study-room-sunlit.png" },
  { id: "cozy-night", label: "Cozy Night", url: "./backgrounds/cozy-night.png" },
  { id: "cozy-lounge", label: "Cozy Lounge", url: "./backgrounds/cozy-lounge.png" },
  { id: "pastel-study", label: "Pastel Study", url: "./backgrounds/pastel-study.png" },
  { id: "forest-path-bright", label: "Forest Path", url: "./backgrounds/forest-path-bright.png" },
  { id: "lake-meadow-bright", label: "Lake Meadow", url: "./backgrounds/lake-meadow-bright.png" },
  { id: "neon-tech", label: "Neon Tech", url: "./backgrounds/neon-tech.png" },
];

const DEFAULT_MODEL_ID = "mika";
const DEFAULT_ANIMATION_ID = "greeting";
const DEFAULT_BACKGROUND_ID = "study-room-sunlit";
const TARGET_HEIGHT = 2.03;
const CAMERA_TARGET = new THREE.Vector3(0, 1.04, 0);

const canvas = document.querySelector("#stage");
const loaderProgress = document.querySelector("#loader-progress");
const loaderNote = document.querySelector("#loader-note");
const controlsPanel = document.querySelector("#controls");
const currentStatus = document.querySelector("#current-status");
const modelButtonsRoot = document.querySelector("#model-buttons");
const animationButtonsRoot = document.querySelector("#animation-buttons");
const backgroundButtonsRoot = document.querySelector("#background-buttons");

if (window.location.protocol === "file:") {
  setLoaderNote("Run start-mika.bat so the browser can load the 3D files.");
}

THREE.Cache.enabled = true;

const manager = new THREE.LoadingManager();
manager.onProgress = (_url, loaded, total) => {
  const ratio = total > 0 ? Math.round((loaded / total) * 100) : 36;
  setLoaderProgress(Math.max(12, Math.min(96, ratio)));
};

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  canvas,
  powerPreference: "high-performance",
});

renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.94;

const scene = new THREE.Scene();
const pmremGenerator = new THREE.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
camera.position.set(0, 1.13, 10);
camera.lookAt(CAMERA_TARGET);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableRotate = true;
controls.enableZoom = true;
controls.minPolarAngle = Math.PI / 2;
controls.maxPolarAngle = Math.PI / 2;
controls.minZoom = 0.82;
controls.maxZoom = 1.55;
controls.target.copy(CAMERA_TARGET);
controls.update();

const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
scene.add(ambientLight);

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
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.13);
rimLight.position.set(-2.4, 1.8, 1.5);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(8.5, 8.5),
  new THREE.ShadowMaterial({ opacity: 0.18, transparent: true }),
);
floor.position.set(0, -0.002, 0);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const softShadow = new THREE.Mesh(
  new THREE.CircleGeometry(0.72, 48),
  new THREE.MeshBasicMaterial({
    color: 0x101828,
    depthWrite: false,
    opacity: 0.12,
    transparent: true,
  }),
);
softShadow.position.set(0, 0.004, 0.04);
softShadow.rotation.x = -Math.PI / 2;
softShadow.scale.set(1.15, 0.44, 1);
scene.add(softShadow);

const clock = new THREE.Clock();
const vrmLoader = new GLTFLoader(manager);
vrmLoader.register((parser) => new VRMLoaderPlugin(parser));

const animationLoader = new GLTFLoader(manager);
animationLoader.register((parser) => new VRMAnimationLoaderPlugin(parser));

let mixer = null;
let currentAction = null;
let currentVrm = null;
let modelRoot = null;
let renderLoopStarted = false;
let modelRequestSerial = 0;
let animationRequestSerial = 0;
let currentModelOption = findModelOption(DEFAULT_MODEL_ID);
let currentAnimationOption = findAnimationOption(DEFAULT_ANIMATION_ID);
let currentBackgroundOption = findBackgroundOption(DEFAULT_BACKGROUND_ID);

main().catch((error) => {
  console.error(error);
  document.body.classList.add("is-error");
  setLoaderProgress(100);
  setLoaderNote("Could not load the 3D viewer. Run start-mika.bat from this folder and keep the asset folders beside index.html.");
  setStatus("Load failed");
  setControlsBusy(false);
});

async function main() {
  renderModelButtons();
  renderAnimationButtons();
  renderBackgroundButtons();
  switchBackground(DEFAULT_BACKGROUND_ID);
  updateActiveButtons();
  setControlsBusy(true);

  setLoaderNote("Loading Mika...");
  await switchModel(DEFAULT_MODEL_ID, { initial: true });

  setLoaderProgress(100);
  window.setTimeout(() => document.body.classList.add("is-ready"), 120);
  startRenderLoop();
}

async function switchModel(modelId, { initial = false } = {}) {
  const nextOption = findModelOption(modelId);
  if (!nextOption) {
    return;
  }

  if (!initial && currentVrm && currentModelOption?.id === nextOption.id) {
    return;
  }

  const requestId = ++modelRequestSerial;
  const previousModelOption = currentModelOption;

  setControlsBusy(true);
  setStatus(`Loading ${nextOption.label}...`);
  if (initial) {
    setLoaderNote(`Loading ${nextOption.label}...`);
  }

  try {
    const nextVrm = await loadVRM(nextOption.url, nextOption);

    if (requestId !== modelRequestSerial) {
      disposeMountedVRM(nextVrm, nextVrm.scene);
      return;
    }

    const nextRoot = mountVRM(nextVrm, nextOption);
    const previousRoot = modelRoot;
    const previousVrm = currentVrm;

    stopCurrentAnimation();
    if (previousRoot) {
      scene.remove(previousRoot);
    }

    currentVrm = nextVrm;
    modelRoot = nextRoot;
    currentModelOption = nextOption;
    scene.add(nextRoot);

    setHappyExpression(nextVrm);
    disposeMountedVRM(previousVrm, previousRoot);
    updateActiveModelButtons();

    await playAnimation(currentAnimationOption.id, {
      modelRequestId: requestId,
      silent: true,
    });

    setStatus(`${nextOption.label} / ${currentAnimationOption.label}`);
  } catch (error) {
    console.error(error);
    currentModelOption = previousModelOption;
    updateActiveModelButtons();

    if (initial) {
      throw error;
    }

    setStatus(`Could not load ${nextOption.label}`);
  } finally {
    if (requestId === modelRequestSerial) {
      setControlsBusy(false);
    }
  }
}

async function playAnimation(animationId, { modelRequestId = modelRequestSerial, silent = false } = {}) {
  const nextOption = findAnimationOption(animationId);
  if (!nextOption || !currentVrm) {
    return;
  }

  const requestId = ++animationRequestSerial;
  const targetVrm = currentVrm;

  if (!silent) {
    setControlsBusy(true);
    setStatus(`Loading ${nextOption.label}...`);
  }

  try {
    const clip = await loadAnimationClip(nextOption.url, targetVrm);
    if (!isCurrentAnimationRequest(requestId, modelRequestId, targetVrm)) {
      return;
    }

    applyAnimationClip(clip, targetVrm);
    currentAnimationOption = nextOption;
    updateActiveAnimationButtons();
    setStatus(`${currentModelOption.label} / ${nextOption.label}`);
  } catch (error) {
    console.error(error);
    await playFallbackAnimation(requestId, modelRequestId, targetVrm, nextOption);
  } finally {
    if (!silent && requestId === animationRequestSerial) {
      setControlsBusy(false);
    }
  }
}

async function playFallbackAnimation(requestId, modelRequestId, targetVrm, failedOption) {
  const fallback = findAnimationOption("relax");
  if (!fallback || failedOption.id === fallback.id) {
    setStatus(`Could not load ${failedOption.label}`);
    return;
  }

  try {
    const fallbackClip = await loadAnimationClip(fallback.url, targetVrm);
    if (!isCurrentAnimationRequest(requestId, modelRequestId, targetVrm)) {
      return;
    }

    applyAnimationClip(fallbackClip, targetVrm);
    currentAnimationOption = fallback;
    updateActiveAnimationButtons();
    setStatus(`${currentModelOption.label} / ${fallback.label}`);
  } catch (fallbackError) {
    console.error(fallbackError);
    setStatus(`Could not load ${failedOption.label}`);
  }
}

function applyAnimationClip(clip, vrm) {
  stopCurrentAnimation();
  mixer = new THREE.AnimationMixer(vrm.scene);
  currentAction = mixer.clipAction(clip);
  currentAction.reset();
  currentAction.enabled = true;
  currentAction.setLoop(THREE.LoopRepeat, Infinity);
  currentAction.fadeIn(0.18);
  currentAction.play();
}

function stopCurrentAnimation() {
  if (currentAction) {
    currentAction.stop();
    currentAction = null;
  }

  if (mixer) {
    mixer.stopAllAction();
    mixer.uncacheRoot(currentVrm?.scene);
    mixer = null;
  }
}

function isCurrentAnimationRequest(requestId, modelRequestId, targetVrm) {
  return requestId === animationRequestSerial && modelRequestId === modelRequestSerial && targetVrm === currentVrm;
}

async function loadVRM(url, option) {
  const gltf = await vrmLoader.loadAsync(url);
  const vrm = gltf.userData.vrm;

  if (!vrm) {
    throw new Error(`VRM not found in ${url}`);
  }

  vrm.scene.rotation.y = option.rotationY ?? Math.PI;
  vrm.scene.userData.viewerModelId = option.id;
  tuneVRMMaterials(vrm);
  return vrm;
}

function mountVRM(vrm, option) {
  const root = new THREE.Group();
  root.name = option.label;

  vrm.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vrm.scene);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  bounds.getSize(size);
  bounds.getCenter(center);

  const scale = (option.targetHeight ?? TARGET_HEIGHT) / Math.max(size.y, 0.1);
  vrm.scene.position.set(-center.x, -bounds.min.y + (option.yOffset ?? 0), -center.z);
  root.scale.setScalar(scale * (option.scaleMultiplier ?? 1));
  root.add(vrm.scene);
  return root;
}

async function loadAnimationClip(url, vrm) {
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const firstArg = args[0] ?? "";
    const message = typeof firstArg === "string" ? firstArg : "";
    if (message.includes("specVersion of the VRMA is not defined")) {
      return;
    }
    originalWarn(...args);
  };

  try {
    const gltf = await animationLoader.loadAsync(url);
    const vrmAnimation = gltf.userData.vrmAnimations?.[0];

    if (!vrmAnimation) {
      throw new Error(`VRM animation not found in ${url}`);
    }

    if (vrm.lookAt && !vrm.scene.children.some((child) => child instanceof VRMLookAtQuaternionProxy)) {
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt);
      proxy.name = "VRMLookAtQuaternionProxy";
      vrm.scene.add(proxy);
    }

    return createVRMAnimationClip(vrmAnimation, vrm);
  } finally {
    console.warn = originalWarn;
  }
}

function renderModelButtons() {
  renderOptionButtons(modelButtonsRoot, MODEL_OPTIONS, "model");
}

function renderAnimationButtons() {
  renderOptionButtons(animationButtonsRoot, ANIMATION_OPTIONS, "animation");
}

function renderBackgroundButtons() {
  renderOptionButtons(backgroundButtonsRoot, BACKGROUND_OPTIONS, "background");
}

function renderOptionButtons(container, options, type) {
  if (!container) {
    return;
  }

  container.replaceChildren();
  const fragment = document.createDocumentFragment();

  options.forEach((option) => {
    const button = document.createElement("button");
    button.className = "control-button";
    button.type = "button";
    button.textContent = option.label;
    button.title = option.url.replace("./", "");

    if (type === "model") {
      button.dataset.modelId = option.id;
      button.addEventListener("click", () => switchModel(option.id));
    } else if (type === "animation") {
      button.dataset.animationId = option.id;
      button.addEventListener("click", () => playAnimation(option.id));
    } else {
      button.dataset.backgroundId = option.id;
      button.addEventListener("click", () => switchBackground(option.id));
    }

    fragment.append(button);
  });

  container.append(fragment);
}

function updateActiveButtons() {
  updateActiveModelButtons();
  updateActiveAnimationButtons();
  updateActiveBackgroundButtons();
}

function updateActiveModelButtons() {
  document.querySelectorAll("[data-model-id]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.modelId === currentModelOption?.id);
  });
}

function updateActiveAnimationButtons() {
  document.querySelectorAll("[data-animation-id]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.animationId === currentAnimationOption?.id);
  });
}

function updateActiveBackgroundButtons() {
  document.querySelectorAll("[data-background-id]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.backgroundId === currentBackgroundOption?.id);
  });
}

function switchBackground(backgroundId) {
  const nextOption = findBackgroundOption(backgroundId);
  if (!nextOption) {
    return;
  }

  currentBackgroundOption = nextOption;
  document.documentElement.style.setProperty("--room-background", `url("${nextOption.url}")`);
  updateActiveBackgroundButtons();
}

function setControlsBusy(isBusy) {
  controlsPanel?.classList.toggle("is-busy", isBusy);
  document.querySelectorAll(".control-button").forEach((button) => {
    button.disabled = isBusy;
  });
}

function setStatus(text) {
  if (currentStatus) {
    currentStatus.textContent = text;
  }
}

function findModelOption(id) {
  return MODEL_OPTIONS.find((option) => option.id === id) ?? MODEL_OPTIONS[0];
}

function findAnimationOption(id) {
  return ANIMATION_OPTIONS.find((option) => option.id === id) ?? ANIMATION_OPTIONS[0];
}

function findBackgroundOption(id) {
  return BACKGROUND_OPTIONS.find((option) => option.id === id) ?? BACKGROUND_OPTIONS[0];
}

function tuneVRMMaterials(vrm) {
  vrm.scene.traverse((node) => {
    if (!node.isMesh) {
      return;
    }

    node.castShadow = true;
    node.receiveShadow = true;
    node.frustumCulled = false;
    const material = stripOutlineMaterials(node.material);
    if (material) {
      node.material = material;
    }
    softenMaterial(node.material, node.name);
  });
}

function stripOutlineMaterials(material) {
  if (!material) {
    return material;
  }

  if (Array.isArray(material)) {
    const stripped = material
      .filter((candidate) => !candidate?.isOutline)
      .map((candidate) => sanitizeMaterial(candidate))
      .filter(Boolean);
    return stripped.length > 0 ? stripped : material.map((candidate) => sanitizeMaterial(candidate)).filter(Boolean);
  }

  if (material.isOutline) {
    return sanitizeMaterial(material);
  }

  return sanitizeMaterial(material);
}

function sanitizeMaterial(material) {
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

function softenMaterial(material, meshName = "") {
  if (!material) {
    return;
  }

  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((candidate) => {
    const hairLike = isHairLikeName(candidate.name) || isHairLikeName(meshName);

    multiplyNumber(candidate, "rimLightingMixFactor", hairLike ? 0.35 : 0.5);
    multiplyNumber(candidate, "parametricRimFresnelPowerFactor", hairLike ? 0.45 : 0.6);
    multiplyNumber(candidate, "parametricRimLiftFactor", hairLike ? 0.45 : 0.55);
    multiplyNumber(candidate, "outlineLightingMixFactor", 0.6);
    multiplyNumber(candidate, "envMapIntensity", hairLike ? 0.35 : 0.5);
    multiplyNumber(candidate, "specularIntensity", hairLike ? 0.25 : 0.45);
    multiplyNumber(candidate, "emissiveIntensity", hairLike ? 0.3 : 0.55);
    multiplyNumber(candidate, "metalness", hairLike ? 0.4 : 0.65);

    if (candidate.matcapFactor?.multiplyScalar) {
      candidate.matcapFactor.multiplyScalar(hairLike ? 0.35 : 0.5);
    } else {
      multiplyNumber(candidate, "matcapFactor", hairLike ? 0.35 : 0.5);
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

function multiplyNumber(target, key, factor) {
  if (typeof target[key] === "number") {
    target[key] *= factor;
  }
}

function isHairLikeName(value) {
  return typeof value === "string" && /(hair|bang|fringe|fronthair|backhair|sidehair|ahoge|tail|twintail)/i.test(value);
}

function setHappyExpression(vrm) {
  const manager = vrm.expressionManager;
  if (!manager) {
    return;
  }

  ["happy", "relaxed", "sad", "angry", "surprised"].forEach((name) => {
    try {
      manager.setValue(name, name === "happy" ? 0.72 : 0);
    } catch {
      // Expressions vary by model; unsupported names can be ignored.
    }
  });
  manager.update?.();
}

function disposeMountedVRM(vrm, root) {
  if (root) {
    root.traverse((node) => {
      node.geometry?.dispose?.();
      disposeMaterial(node.material);
    });
  }

  try {
    vrm?.dispose?.();
  } catch (error) {
    console.warn("Could not fully dispose VRM", error);
  }
}

function disposeMaterial(material) {
  if (!material) {
    return;
  }

  if (Array.isArray(material)) {
    material.forEach((candidate) => disposeMaterial(candidate));
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

function startRenderLoop() {
  if (renderLoopStarted) {
    return;
  }

  renderLoopStarted = true;
  clock.start();
  animate();
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 1 / 30);
  mixer?.update(delta);
  currentVrm?.update(delta);

  if (modelRoot) {
    const time = clock.elapsedTime;
    modelRoot.position.y = Math.sin(time * 1.35) * 0.006;
  }

  controls.update();
  renderer.render(scene, camera);
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const aspect = width / Math.max(height, 1);
  const viewHeight = width < 680 ? 2.34 : 2.52;

  camera.left = (-viewHeight * aspect) / 2;
  camera.right = (viewHeight * aspect) / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.setSize(width, height);
}

function setLoaderProgress(percent) {
  if (loaderProgress) {
    loaderProgress.style.width = `${percent}%`;
  }
}

function setLoaderNote(text) {
  if (loaderNote) {
    loaderNote.textContent = text;
  }
}

window.addEventListener("resize", resize);
resize();

window.buddyViewer = {
  playAnimation,
  setStatus,
  getCurrentState() {
    return {
      animation: currentAnimationOption?.id ?? null,
      model: currentModelOption?.id ?? null,
    };
  },
};
