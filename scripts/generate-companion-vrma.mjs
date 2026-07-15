import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const FLOAT_COMPONENT_TYPE = 5126;
const FPS = 30;
const EPSILON = 1e-5;
const identityQuaternion = [0, 0, 0, 1];
const zeroEuler = [0, 0, 0];

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const outputDirectories = [
  path.join(repositoryRoot, "animations"),
  path.join(repositoryRoot, "apps", "web", "public", "animations")
];
const checkOnly = process.argv.includes("--check");

const skeleton = [
  { name: "hips", translation: [0, 1, 0], children: ["spine", "leftUpperLeg", "rightUpperLeg"] },
  { name: "spine", translation: [0, 0.12, 0], children: ["chest"] },
  { name: "chest", translation: [0, 0.16, 0], children: ["upperChest"] },
  { name: "upperChest", translation: [0, 0.16, 0], children: ["neck", "leftShoulder", "rightShoulder"] },
  { name: "neck", translation: [0, 0.13, 0], children: ["head"] },
  { name: "head", translation: [0, 0.12, 0] },
  { name: "leftShoulder", translation: [0.1, 0.08, 0], children: ["leftUpperArm"] },
  { name: "leftUpperArm", translation: [0.12, 0, 0], children: ["leftLowerArm"] },
  { name: "leftLowerArm", translation: [0.28, 0, 0], children: ["leftHand"] },
  { name: "leftHand", translation: [0.25, 0, 0] },
  { name: "rightShoulder", translation: [-0.1, 0.08, 0], children: ["rightUpperArm"] },
  { name: "rightUpperArm", translation: [-0.12, 0, 0], children: ["rightLowerArm"] },
  { name: "rightLowerArm", translation: [-0.28, 0, 0], children: ["rightHand"] },
  { name: "rightHand", translation: [-0.25, 0, 0] },
  { name: "leftUpperLeg", translation: [0.09, -0.06, 0], children: ["leftLowerLeg"] },
  { name: "leftLowerLeg", translation: [0, -0.4, 0], children: ["leftFoot"] },
  { name: "leftFoot", translation: [0, -0.4, 0], children: ["leftToes"] },
  { name: "leftToes", translation: [0, -0.09, 0.13] },
  { name: "rightUpperLeg", translation: [-0.09, -0.06, 0], children: ["rightLowerLeg"] },
  { name: "rightLowerLeg", translation: [0, -0.4, 0], children: ["rightFoot"] },
  { name: "rightFoot", translation: [0, -0.4, 0], children: ["rightToes"] },
  { name: "rightToes", translation: [0, -0.09, 0.13] }
];

const animations = [
  {
    fileName: "Relax.vrma",
    id: "relax",
    duration: 5.2,
    loop: true,
    pose: idlePose
  },
  {
    fileName: "Listening.vrma",
    id: "listening",
    duration: 4,
    loop: true,
    pose: listeningPose
  },
  {
    fileName: "Thinking.vrma",
    id: "thinking",
    duration: 4.8,
    loop: true,
    pose: thinkingPose
  },
  {
    fileName: "Talking.vrma",
    id: "talking",
    duration: 2.4,
    loop: true,
    pose: talkingPose
  },
  {
    fileName: "Singing.vrma",
    id: "singing",
    duration: 6,
    loop: true,
    pose: singingPose
  },
  {
    fileName: "GentleGesture.vrma",
    id: "gentle-gesture",
    duration: 2.4,
    loop: false,
    pose: gentleGesturePose
  },
  {
    fileName: "CuriousTilt.vrma",
    id: "curious-tilt",
    duration: 2.6,
    loop: false,
    pose: curiousTiltPose
  },
  {
    fileName: "Nod.vrma",
    id: "nod",
    duration: 1.4,
    loop: false,
    pose: nodPose
  },
  {
    fileName: "Wave.vrma",
    id: "wave",
    duration: 2.8,
    loop: false,
    pose: wavePose
  }
];

for (const definition of animations) {
  const generated = buildVrma(definition);
  const generatedStats = validateVrma(generated, definition);

  for (const outputDirectory of outputDirectories) {
    const outputPath = path.join(outputDirectory, definition.fileName);
    if (checkOnly) {
      if (!fs.existsSync(outputPath)) {
        throw new Error(`Missing generated VRMA: ${path.relative(repositoryRoot, outputPath)}`);
      }
      const existing = fs.readFileSync(outputPath);
      validateVrma(existing, definition);
      if (!existing.equals(generated)) {
        throw new Error(`Generated VRMA is stale: ${path.relative(repositoryRoot, outputPath)}`);
      }
    } else {
      fs.mkdirSync(outputDirectory, { recursive: true });
      const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath) : null;
      if (!existing?.equals(generated)) {
        fs.writeFileSync(outputPath, generated);
      }
    }
  }

  console.log(JSON.stringify({
    file: definition.fileName,
    mode: checkOnly ? "checked" : "generated",
    ...generatedStats
  }));
}

function buildVrma(definition) {
  const nodeIndexByName = new Map(skeleton.map((bone, index) => [bone.name, index]));
  const nodes = skeleton.map((bone) => ({
    name: bone.name,
    translation: bone.translation,
    rotation: [0, 0, 0, 1],
    ...(bone.children ? { children: bone.children.map((name) => requiredNodeIndex(nodeIndexByName, name)) } : {})
  }));
  const frameCount = Math.round(definition.duration * FPS) + 1;
  const times = Array.from({ length: frameCount }, (_, index) => index === frameCount - 1
    ? definition.duration
    : index / FPS);
  const samples = times.map((time, index) => {
    const normalizedTime = index === frameCount - 1 ? 0 : time / definition.duration;
    return definition.pose(normalizedTime);
  });

  const binaryParts = [];
  const bufferViews = [];
  const accessors = [];
  let byteOffset = 0;

  const addAccessor = (values, type, componentCount, includeBounds = true) => {
    const alignedOffset = align4(byteOffset);
    if (alignedOffset !== byteOffset) {
      binaryParts.push(Buffer.alloc(alignedOffset - byteOffset));
      byteOffset = alignedOffset;
    }

    const data = Buffer.alloc(values.length * 4);
    values.forEach((value, index) => data.writeFloatLE(value, index * 4));
    const bufferViewIndex = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length });
    binaryParts.push(data);
    byteOffset += data.length;

    const accessor = {
      bufferView: bufferViewIndex,
      componentType: FLOAT_COMPONENT_TYPE,
      count: values.length / componentCount,
      type
    };
    if (includeBounds) {
      const { min, max } = componentBounds(values, componentCount);
      accessor.min = min;
      accessor.max = max;
    }
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const timeAccessor = addAccessor(times, "SCALAR", 1);
  const hipsTranslationAccessor = addAccessor(
    samples.flatMap((sample) => sample.hips),
    "VEC3",
    3
  );
  const channels = [];
  const samplers = [];

  addChannel("hips", "translation", hipsTranslationAccessor);
  for (const bone of skeleton) {
    const outputAccessor = addAccessor(
      samples.flatMap((sample) => sample.rotations[bone.name] ?? identityQuaternion),
      "VEC4",
      4
    );
    addChannel(bone.name, "rotation", outputAccessor);
  }

  function addChannel(boneName, targetPath, outputAccessor) {
    const samplerIndex = samplers.length;
    samplers.push({ input: timeAccessor, interpolation: "LINEAR", output: outputAccessor });
    channels.push({
      sampler: samplerIndex,
      target: {
        node: requiredNodeIndex(nodeIndexByName, boneName),
        path: targetPath
      }
    });
  }

  const binaryChunk = Buffer.concat(binaryParts);
  const document = {
    asset: {
      version: "2.0",
      generator: "anime-buddy generate-companion-vrma 1.0.0"
    },
    extensionsUsed: ["VRMC_vrm_animation"],
    extensions: {
      VRMC_vrm_animation: {
        specVersion: "1.0",
        humanoid: {
          humanBones: Object.fromEntries(skeleton.map((bone, index) => [bone.name, { node: index }]))
        },
        expressions: {
          preset: {},
          custom: {}
        }
      }
    },
    scene: 0,
    scenes: [{ nodes: [requiredNodeIndex(nodeIndexByName, "hips")] }],
    nodes,
    animations: [{ name: definition.id, channels, samplers }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binaryChunk.length }]
  };

  return encodeGlb(document, binaryChunk);
}

function validateVrma(bytes, definition) {
  const { document, binaryChunkOffset } = decodeGlb(bytes);
  const extension = document.extensions?.VRMC_vrm_animation;
  if (extension?.specVersion !== "1.0") {
    throw new Error(`${definition.fileName}: missing VRMA specVersion 1.0`);
  }
  if (!document.extensionsUsed?.includes("VRMC_vrm_animation")) {
    throw new Error(`${definition.fileName}: VRMC_vrm_animation is not declared in extensionsUsed`);
  }

  const animation = document.animations?.[0];
  if (!animation || animation.channels.length !== skeleton.length + 1) {
    throw new Error(`${definition.fileName}: expected ${skeleton.length + 1} animation channels`);
  }
  const hipsNode = extension.humanoid?.humanBones?.hips?.node;
  const translationChannels = animation.channels.filter((channel) => channel.target.path === "translation");
  if (translationChannels.length !== 1 || translationChannels[0].target.node !== hipsNode) {
    throw new Error(`${definition.fileName}: only hips may have a translation channel`);
  }
  if (animation.channels.some((channel) => channel.target.path !== "translation" && channel.target.path !== "rotation")) {
    throw new Error(`${definition.fileName}: unsupported animation channel path`);
  }

  const inputAccessors = new Set(animation.samplers.map((sampler) => sampler.input));
  if (inputAccessors.size !== 1) {
    throw new Error(`${definition.fileName}: all tracks must share one time accessor`);
  }
  const timeAccessorIndex = [...inputAccessors][0];
  const times = readAccessor(document, bytes, binaryChunkOffset, timeAccessorIndex).flat();
  if (Math.abs(times[0]) > EPSILON || Math.abs(times.at(-1) - definition.duration) > EPSILON) {
    throw new Error(`${definition.fileName}: unexpected animation duration`);
  }
  for (let index = 1; index < times.length; index += 1) {
    if (!(times[index] > times[index - 1])) {
      throw new Error(`${definition.fileName}: animation times must be strictly increasing`);
    }
  }

  let maxQuaternionLengthError = 0;
  let maxEndpointRotationDegrees = 0;
  let maxEndpointTranslation = 0;
  let endpointsExactlyEqual = true;
  for (const channel of animation.channels) {
    const sampler = animation.samplers[channel.sampler];
    if (sampler.interpolation !== "LINEAR") {
      throw new Error(`${definition.fileName}: all samplers must use LINEAR interpolation`);
    }
    const rows = readAccessor(document, bytes, binaryChunkOffset, sampler.output);
    if (rows.length !== times.length || rows.some((row) => row.some((value) => !Number.isFinite(value)))) {
      throw new Error(`${definition.fileName}: invalid output accessor`);
    }
    endpointsExactlyEqual &&= rows[0].every((value, index) => Object.is(value, rows.at(-1)[index]));

    if (channel.target.path === "rotation") {
      for (const quaternion of rows) {
        const length = Math.hypot(...quaternion);
        maxQuaternionLengthError = Math.max(maxQuaternionLengthError, Math.abs(1 - length));
      }
      maxEndpointRotationDegrees = Math.max(
        maxEndpointRotationDegrees,
        quaternionAngleDegrees(rows[0], rows.at(-1))
      );
    } else {
      maxEndpointTranslation = Math.max(
        maxEndpointTranslation,
        Math.hypot(...rows[0].map((value, index) => rows.at(-1)[index] - value))
      );
    }
  }

  if (maxQuaternionLengthError > EPSILON) {
    throw new Error(`${definition.fileName}: quaternion normalization error ${maxQuaternionLengthError}`);
  }
  if (definition.loop && !endpointsExactlyEqual) {
    throw new Error(`${definition.fileName}: loop endpoint components are not exactly equal`);
  }
  if (definition.loop && (maxEndpointRotationDegrees > 1e-4 || maxEndpointTranslation > 1e-6)) {
    throw new Error(`${definition.fileName}: loop endpoints do not match`);
  }

  return {
    bytes: bytes.length,
    duration: definition.duration,
    fps: FPS,
    frames: times.length,
    channels: animation.channels.length,
    loop: definition.loop,
    endpointsExactlyEqual,
    maxEndpointRotationDegrees: round(maxEndpointRotationDegrees, 6),
    maxEndpointTranslation: round(maxEndpointTranslation, 8),
    maxQuaternionLengthError: round(maxQuaternionLengthError, 8)
  };
}

function idlePose(progress) {
  const phase = progress * Math.PI * 2;
  const breath = 0.5 - 0.5 * Math.cos(phase);
  const sway = Math.sin(phase);
  return makePose({
    hips: [0, 1 + 0.004 * breath, 0],
    eulers: {
      hips: [0, degrees(0.6 * sway), degrees(0.35 * sway)],
      spine: [degrees(0.7 * breath), 0, degrees(0.45 * sway)],
      chest: [degrees(-0.5 * breath), degrees(0.35 * sway), degrees(-0.35 * sway)],
      upperChest: [degrees(-0.8 * breath), degrees(0.45 * sway), degrees(-0.3 * sway)],
      neck: [degrees(-0.35 * breath), degrees(-0.5 * sway), degrees(0.25 * sway)],
      head: [degrees(-0.6 * breath), degrees(-0.8 * sway), degrees(0.45 * sway)],
      leftUpperArm: [degrees(-2 + 0.7 * breath), 0, degrees(-75 - 0.8 * sway)],
      rightUpperArm: [degrees(-2 + 0.7 * breath), 0, degrees(75 - 0.8 * sway)]
    }
  });
}

function listeningPose(progress) {
  const phase = progress * Math.PI * 2;
  const breath = 0.5 - 0.5 * Math.cos(phase);
  const sway = Math.sin(phase);
  return makePose({
    hips: [0, 1 + 0.006 * breath, 0],
    eulers: {
      hips: [0, degrees(0.8 * sway), degrees(0.5 * sway)],
      spine: [degrees(1.2 + 0.5 * breath), 0, degrees(0.8 * sway)],
      chest: [degrees(-1 + 0.8 * breath), 0, degrees(-0.6 * sway)],
      upperChest: [degrees(-1.5 + 0.7 * breath), degrees(0.8 * sway), 0],
      neck: [degrees(-1.5 + 0.8 * sway), degrees(1.2 * sway), degrees(-2.5)],
      head: [degrees(-2 + 1.2 * sway), degrees(1.8 * sway), degrees(-3.5 + 0.8 * sway)]
    }
  });
}

function thinkingPose(progress) {
  const phase = progress * Math.PI * 2;
  const breath = 0.5 - 0.5 * Math.cos(phase);
  const consider = Math.sin(phase);
  const microNod = Math.sin(phase * 2);
  return makePose({
    hips: [0, 1 + 0.004 * breath, 0],
    eulers: {
      hips: [degrees(0.4 * breath), degrees(0.45 * consider), degrees(0.3 * consider)],
      spine: [degrees(1.2 + 0.45 * breath), degrees(0.6 * consider), degrees(0.5 * consider)],
      chest: [degrees(1.4 + 0.5 * breath), degrees(1.1 * consider), degrees(-0.7 * consider)],
      upperChest: [degrees(1.7 + 0.5 * breath), degrees(1.4 * consider), degrees(-0.9 * consider)],
      neck: [degrees(1.6 + 0.6 * microNod), degrees(-1.8 * consider), degrees(1.2 + 0.5 * consider)],
      head: [degrees(3.5 + 1.3 * microNod), degrees(4.5 * consider), degrees(-2.8 - 0.9 * consider)],
      leftShoulder: [0, 0, degrees(-4 - 0.8 * breath)],
      leftUpperArm: [degrees(-2.5), degrees(0.5 * consider), degrees(-74 - 1.2 * breath)],
      leftLowerArm: [degrees(1.2 * consider), 0, degrees(-12 - 2 * breath)],
      rightShoulder: [degrees(-1.2), 0, degrees(2 - 0.8 * breath)],
      rightUpperArm: [degrees(-5 - 1.2 * breath), degrees(-3), degrees(62 - 1.5 * consider)],
      rightLowerArm: [degrees(3 + 1.2 * consider), degrees(-6), degrees(-12 - 3 * breath)],
      rightHand: [degrees(1.5 * microNod), degrees(-4 + 1.5 * consider), degrees(4 + 1.5 * consider)]
    }
  });
}

function talkingPose(progress) {
  const phase = progress * Math.PI * 2;
  const gesture = Math.sin(phase);
  const lift = 0.5 - 0.5 * Math.cos(phase);
  return makePose({
    hips: [0, 1 + 0.004 * lift, 0],
    eulers: {
      hips: [0, degrees(1.2 * gesture), degrees(0.8 * gesture)],
      spine: [degrees(1.5 + 0.8 * lift), degrees(0.8 * gesture), degrees(1.2 * gesture)],
      chest: [degrees(-1.2 + 1.1 * lift), degrees(1.2 * gesture), degrees(-1.3 * gesture)],
      upperChest: [degrees(-1.5 + 1.4 * lift), degrees(1.8 * gesture), degrees(-1.2 * gesture)],
      neck: [degrees(-1 + 1.8 * gesture), degrees(-1.4 * gesture), degrees(0.8 * gesture)],
      head: [degrees(-1.5 + 2.2 * gesture), degrees(-2 * gesture), degrees(1.2 * gesture)],
      leftUpperArm: [degrees(-3 * lift), 0, degrees(-75 + 4 * gesture)],
      leftLowerArm: [degrees(2 * gesture), degrees(-3 * lift), degrees(-10 - 12 * lift)],
      leftHand: [degrees(2 * gesture), degrees(3 * gesture), degrees(-3 * gesture)],
      rightUpperArm: [degrees(-5 * lift), 0, degrees(75 - 12 * lift - 3 * gesture)],
      rightLowerArm: [degrees(-3 * gesture), degrees(4 * lift), degrees(10 - 30 * lift)],
      rightHand: [degrees(-2 * gesture), degrees(-4 * gesture), degrees(7 * gesture)]
    }
  });
}

function singingPose(progress) {
  const phase = progress * Math.PI * 2;
  const sway = Math.sin(phase);
  const breath = 0.5 - 0.5 * Math.cos(phase * 2);
  const musicalNod = Math.sin(phase * 4);
  const gesture = 0.5 - 0.5 * Math.cos(phase * 2);
  const gestureSide = Math.sin(phase * 2);
  const microphonePulse = Math.sin(phase * 2);
  return makePose({
    hips: [0, 1 + 0.004 * breath, 0],
    eulers: {
      hips: [degrees(0.4 * breath), degrees(1.2 * sway), degrees(0.8 * sway)],
      spine: [degrees(1.1 + 0.6 * breath), degrees(0.8 * sway), degrees(0.9 * sway)],
      chest: [degrees(-0.6 + 0.8 * breath), degrees(1.4 * sway), degrees(-1.1 * sway)],
      upperChest: [degrees(-1 + 1.1 * breath), degrees(1.8 * sway), degrees(-1.3 * sway)],
      neck: [degrees(-1.5 + 0.7 * musicalNod), degrees(-1.7 * sway), degrees(0.8 * sway)],
      head: [degrees(-2.5 + 1.5 * musicalNod), degrees(-2.6 * sway), degrees(1.2 * sway)],
      leftShoulder: [degrees(-1.5 * gesture), 0, degrees(-4 - 2 * gesture)],
      leftUpperArm: [degrees(-2 - 5 * gesture), degrees(3 * gestureSide), degrees(-75 + 30 * gesture)],
      leftLowerArm: [degrees(4 * gestureSide), degrees(-7 * gesture), degrees(-10 - 34 * gesture)],
      leftHand: [degrees(2 * gestureSide), degrees(5 * gesture), degrees(-6 * gestureSide)],
      rightShoulder: [degrees(-2), 0, degrees(0)],
      rightUpperArm: [degrees(-11 + 0.8 * microphonePulse), degrees(7), degrees(8 + 1.2 * sway)],
      rightLowerArm: [degrees(6 + 0.8 * microphonePulse), degrees(-10), degrees(-154 - 1.2 * sway)],
      rightHand: [degrees(5 + 0.8 * microphonePulse), degrees(-8), degrees(8 - 1.2 * microphonePulse)]
    }
  });
}

function gentleGesturePose(progress) {
  const liftIn = smoothStep(0, 0.24, progress);
  const liftOut = 1 - smoothStep(0.7, 1, progress);
  const lift = Math.min(liftIn, liftOut);
  const present = Math.sin(progress * Math.PI * 2) * lift;
  const nodProgress = smoothStep(0.32, 0.66, progress);
  const nod = Math.sin(nodProgress * Math.PI) * lift;
  return makePose({
    hips: [0, 1 + 0.003 * lift, 0],
    eulers: {
      hips: [0, degrees(-0.8 * lift), degrees(-0.45 * lift)],
      spine: [degrees(0.8 * lift), degrees(-0.8 * lift), degrees(-0.6 * lift)],
      chest: [degrees(1.1 * lift), degrees(-1.4 * lift), degrees(-0.9 * lift)],
      upperChest: [degrees(1.4 * lift), degrees(-2 * lift), degrees(-1.2 * lift)],
      neck: [degrees(-0.8 * lift + 1.2 * nod), degrees(1.1 * lift), degrees(0.8 * lift)],
      head: [degrees(-1.2 * lift + 3.6 * nod), degrees(2.2 * lift), degrees(1.4 * lift)],
      leftShoulder: [0, 0, degrees(-4 - 1.2 * lift)],
      leftUpperArm: [degrees(-2 - 0.8 * lift), 0, degrees(-75 + 2 * lift)],
      leftLowerArm: [degrees(-1.2 * present), 0, degrees(-10 - 2 * lift)],
      rightShoulder: [degrees(-2.5 * lift), 0, degrees(4 - 5 * lift)],
      rightUpperArm: [degrees(-2 - 10 * lift), degrees(4 * lift), degrees(75 - 32 * lift)],
      rightLowerArm: [degrees(2.5 * present), degrees(-7 * lift), degrees(10 - 52 * lift)],
      rightHand: [degrees(2 * lift), degrees(-12 * lift), degrees(8 * lift + 3 * present)]
    }
  });
}

function curiousTiltPose(progress) {
  const tiltIn = smoothStep(0, 0.2, progress);
  const tiltOut = 1 - smoothStep(0.74, 1, progress);
  const tilt = Math.min(tiltIn, tiltOut);
  const questionProgress = smoothStep(0.34, 0.66, progress);
  const question = Math.sin(questionProgress * Math.PI) * tilt;
  return makePose({
    hips: [0, 1 + 0.002 * tilt, 0],
    eulers: {
      hips: [0, degrees(0.45 * tilt), degrees(0.35 * tilt)],
      spine: [degrees(0.7 * tilt), degrees(0.6 * tilt), degrees(0.8 * tilt)],
      chest: [degrees(1.1 * tilt), degrees(0.9 * tilt), degrees(1.2 * tilt)],
      upperChest: [degrees(1.5 * tilt), degrees(1.2 * tilt), degrees(1.8 * tilt)],
      neck: [degrees(-0.8 * tilt + 0.8 * question), degrees(-2 * tilt), degrees(2.8 * tilt)],
      head: [degrees(-1.8 * tilt + 2.8 * question), degrees(6 * tilt), degrees(-9 * tilt)],
      leftShoulder: [degrees(-0.8 * tilt), 0, degrees(-4 - 1.5 * tilt)],
      leftUpperArm: [degrees(-2 - 0.8 * tilt), 0, degrees(-75 - 1.2 * tilt)],
      rightShoulder: [degrees(0.8 * tilt), 0, degrees(4 + 1.5 * tilt)],
      rightUpperArm: [degrees(-2 + 0.8 * tilt), 0, degrees(75 + 1.2 * tilt)]
    }
  });
}

function nodPose(progress) {
  const nod = Math.sin(progress * Math.PI * 2) ** 2;
  const secondary = Math.sin(progress * Math.PI) ** 2;
  return makePose({
    hips: [0, 1 - 0.004 * secondary, 0],
    eulers: {
      spine: [degrees(1.2 * secondary), 0, 0],
      chest: [degrees(1.8 * secondary), 0, 0],
      upperChest: [degrees(2.2 * secondary), 0, 0],
      neck: [degrees(6 * nod), 0, 0],
      head: [degrees(16 * nod), 0, 0]
    }
  });
}

function wavePose(progress) {
  const liftIn = smoothStep(0, 0.22, progress);
  const liftOut = 1 - smoothStep(0.78, 1, progress);
  const lift = Math.min(liftIn, liftOut);
  const wave = Math.sin(progress * Math.PI * 6) * lift;
  return makePose({
    hips: [0, 1, 0],
    eulers: {
      spine: [degrees(1.5 * lift), degrees(-1.5 * lift), degrees(-1.5 * lift)],
      chest: [degrees(1.5 * lift), degrees(-2 * lift), degrees(-2 * lift)],
      upperChest: [degrees(2 * lift), degrees(-2.5 * lift), degrees(-3 * lift)],
      neck: [degrees(-1.5 * lift), degrees(2 * lift), degrees(2 * lift)],
      head: [degrees(-2 * lift), degrees(3 * lift), degrees(4 * lift)],
      rightShoulder: [degrees(-4 * lift), 0, degrees(-8 * lift)],
      rightUpperArm: [degrees(-10 * lift), degrees(4 * lift), degrees(75 - 125 * lift)],
      rightLowerArm: [degrees(5 * lift), degrees(-8 * lift), degrees(10 - 95 * lift)],
      rightHand: [degrees(5 * lift), degrees(8 * wave), degrees(28 * wave)]
    }
  });
}

function makePose({ hips = [0, 1, 0], eulers = {} }) {
  const relaxedEulers = {
    leftShoulder: [0, 0, degrees(-4)],
    leftUpperArm: [degrees(-2), 0, degrees(-75)],
    leftLowerArm: [0, 0, degrees(-10)],
    leftHand: [0, 0, 0],
    rightShoulder: [0, 0, degrees(4)],
    rightUpperArm: [degrees(-2), 0, degrees(75)],
    rightLowerArm: [0, 0, degrees(10)],
    rightHand: [0, 0, 0]
  };
  const rotations = {};
  for (const bone of skeleton) {
    rotations[bone.name] = quaternionFromEuler(...(eulers[bone.name] ?? relaxedEulers[bone.name] ?? zeroEuler));
  }
  return { hips, rotations };
}

function encodeGlb(document, binaryChunk) {
  const json = Buffer.from(JSON.stringify(document), "utf8");
  const paddedJsonLength = align4(json.length);
  const paddedBinaryLength = align4(binaryChunk.length);
  const totalLength = 12 + 8 + paddedJsonLength + 8 + paddedBinaryLength;
  const output = Buffer.alloc(totalLength);

  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJsonLength, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  json.copy(output, 20);
  output.fill(0x20, 20 + json.length, 20 + paddedJsonLength);

  const binaryHeaderOffset = 20 + paddedJsonLength;
  output.writeUInt32LE(paddedBinaryLength, binaryHeaderOffset);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binaryHeaderOffset + 4);
  binaryChunk.copy(output, binaryHeaderOffset + 8);
  return output;
}

function decodeGlb(bytes) {
  if (bytes.length < 28 || bytes.readUInt32LE(0) !== GLB_MAGIC || bytes.readUInt32LE(4) !== GLB_VERSION) {
    throw new Error("Generated asset is not a GLB 2.0 file");
  }
  if (bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("Generated GLB length header is invalid");
  }
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== JSON_CHUNK_TYPE) {
    throw new Error("Generated GLB is missing its JSON chunk");
  }
  const document = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim());
  const binaryHeaderOffset = 20 + jsonLength;
  if (bytes.readUInt32LE(binaryHeaderOffset + 4) !== BIN_CHUNK_TYPE) {
    throw new Error("Generated GLB is missing its BIN chunk");
  }
  const binaryLength = bytes.readUInt32LE(binaryHeaderOffset);
  if (binaryHeaderOffset + 8 + binaryLength !== bytes.length) {
    throw new Error("Generated GLB BIN chunk length is invalid");
  }
  return { document, binaryChunkOffset: binaryHeaderOffset + 8 };
}

function readAccessor(document, bytes, binaryChunkOffset, accessorIndex) {
  const accessor = document.accessors[accessorIndex];
  const view = document.bufferViews[accessor.bufferView];
  if (accessor.componentType !== FLOAT_COMPONENT_TYPE) {
    throw new Error(`Accessor ${accessorIndex} is not FLOAT`);
  }
  const componentCount = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
  if (!componentCount) {
    throw new Error(`Accessor ${accessorIndex} has unsupported type ${accessor.type}`);
  }
  const stride = view.byteStride ?? componentCount * 4;
  const start = binaryChunkOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, rowIndex) =>
    Array.from({ length: componentCount }, (_, componentIndex) =>
      bytes.readFloatLE(start + rowIndex * stride + componentIndex * 4)));
}

function componentBounds(values, componentCount) {
  const min = Array(componentCount).fill(Number.POSITIVE_INFINITY);
  const max = Array(componentCount).fill(Number.NEGATIVE_INFINITY);
  values.forEach((value, index) => {
    const component = index % componentCount;
    min[component] = Math.min(min[component], value);
    max[component] = Math.max(max[component], value);
  });
  return { min, max };
}

function quaternionFromEuler(x, y, z) {
  const cx = Math.cos(x / 2);
  const cy = Math.cos(y / 2);
  const cz = Math.cos(z / 2);
  const sx = Math.sin(x / 2);
  const sy = Math.sin(y / 2);
  const sz = Math.sin(z / 2);
  return normalizeQuaternion([
    sx * cy * cz + cx * sy * sz,
    cx * sy * cz - sx * cy * sz,
    cx * cy * sz + sx * sy * cz,
    cx * cy * cz - sx * sy * sz
  ]);
}

function normalizeQuaternion(quaternion) {
  const length = Math.hypot(...quaternion) || 1;
  return quaternion.map((value) => value / length);
}

function quaternionAngleDegrees(left, right) {
  const leftLength = Math.hypot(...left) || 1;
  const rightLength = Math.hypot(...right) || 1;
  const dot = Math.abs(left.reduce((sum, value, index) => sum + value * right[index], 0) / (leftLength * rightLength));
  return 2 * Math.acos(Math.min(1, Math.max(-1, dot))) * 180 / Math.PI;
}

function smoothStep(edge0, edge1, value) {
  const normalized = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return normalized * normalized * (3 - 2 * normalized);
}

function requiredNodeIndex(indexByName, name) {
  const index = indexByName.get(name);
  if (index === undefined) {
    throw new Error(`Unknown skeleton bone ${name}`);
  }
  return index;
}

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function degrees(value) {
  return value * Math.PI / 180;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
