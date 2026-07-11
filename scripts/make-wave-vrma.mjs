import fs from "node:fs";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/make-wave-vrma.mjs <input.vrma> <output.vrma>");
  process.exit(1);
}

const bytes = fs.readFileSync(inputPath);
const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).replace(/\0+$/, ""));
const binOffset = 28 + jsonLength;
const animation = json.animations?.[0];
if (!animation) throw new Error("VRMA has no animation");

const inputAccessorIndex = animation.samplers[0].input;
const inputAccessor = json.accessors[inputAccessorIndex];
const inputView = json.bufferViews[inputAccessor.bufferView];
const inputStart = binOffset + (inputView.byteOffset ?? 0) + (inputAccessor.byteOffset ?? 0);
const inputStride = inputView.byteStride ?? 4;
let originalDuration = 0;
for (let index = 0; index < inputAccessor.count; index += 1) {
  originalDuration = Math.max(originalDuration, bytes.readFloatLE(inputStart + index * inputStride));
}
const duration = 3.2;
for (let index = 0; index < inputAccessor.count; index += 1) {
  const normalized = originalDuration > 0 ? bytes.readFloatLE(inputStart + index * inputStride) / originalDuration : 0;
  bytes.writeFloatLE(normalized * duration, inputStart + index * inputStride);
}

const channelsByName = new Map();
for (const channel of animation.channels) {
  const nodeName = json.nodes[channel.target.node]?.name;
  if (nodeName) channelsByName.set(`${nodeName}:${channel.target.path}`, channel);
  freezeAccessor(channel);
}

const hips = getAccessor("Hips", "rotation");
forEachQuaternion(hips, (q, time) => multiplyQuaternions(
  multiplyQuaternions(fromEuler(0, Math.PI, 0), q),
  fromEuler(0, 0.03 * Math.sin(time * Math.PI), 0)
));

const upperArm = getAccessor("RightUpperArm", "rotation");
forEachQuaternion(upperArm, () => fromEuler(-0.12, 0.12, -0.95));

const lowerArm = getAccessor("RightLowerArm", "rotation");
forEachQuaternion(lowerArm, () => fromEuler(0.05, -0.1, -2.0));

const hand = getAccessor("RightHand", "rotation");
forEachQuaternion(hand, (_q, time) => {
  const envelope = Math.sin(Math.min(1, time / 0.35) * Math.PI / 2) * Math.sin(Math.min(1, (duration - time) / 0.35) * Math.PI / 2);
  return fromEuler(0, 0, envelope * 0.45 * Math.sin(time * Math.PI * 4));
});

for (const nodeName of [
  "RightThumbProximal", "RightThumbIntermediate", "RightThumbDistal",
  "RightIndexProximal", "RightIndexIntermediate", "RightIndexDistal",
  "RightMiddleProximal", "RightMiddleIntermediate", "RightMiddleDistal",
  "RightRingProximal", "RightRingIntermediate", "RightRingDistal",
  "RightLittleProximal", "RightLittleIntermediate", "RightLittleDistal"
]) {
  forEachQuaternion(getAccessor(nodeName, "rotation"), () => [0, 0, 0, 1]);
}

fs.writeFileSync(outputPath, bytes);
console.log(`Created ${duration}s waving VRMA at ${outputPath}`);

function freezeAccessor(channel) {
  const accessor = json.accessors[animation.samplers[channel.sampler].output];
  const view = json.bufferViews[accessor.bufferView];
  const size = channel.target.path === "translation" ? 3 : 4;
  const stride = view.byteStride ?? size * 4;
  const start = binOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const first = Array.from({ length: size }, (_, component) => bytes.readFloatLE(start + component * 4));
  for (let index = 1; index < accessor.count; index += 1) {
    first.forEach((value, component) => bytes.writeFloatLE(value, start + index * stride + component * 4));
  }
}

function getAccessor(nodeName, targetPath) {
  const channel = channelsByName.get(`${nodeName}:${targetPath}`);
  if (!channel) throw new Error(`Missing ${nodeName} ${targetPath} channel`);
  return json.accessors[animation.samplers[channel.sampler].output];
}

function forEachQuaternion(accessor, createQuaternion) {
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 16;
  const start = binOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  for (let index = 0; index < accessor.count; index += 1) {
    const offset = start + index * stride;
    const current = Array.from({ length: 4 }, (_, component) => bytes.readFloatLE(offset + component * 4));
    const q = createQuaternion(current, index / Math.max(1, accessor.count - 1) * duration);
    const length = Math.hypot(...q) || 1;
    q.forEach((value, component) => bytes.writeFloatLE(value / length, offset + component * 4));
  }
}

function fromEuler(x, y, z) {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3
  ];
}

function multiplyQuaternions(left, right) {
  const [ax, ay, az, aw] = left;
  const [bx, by, bz, bw] = right;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}
