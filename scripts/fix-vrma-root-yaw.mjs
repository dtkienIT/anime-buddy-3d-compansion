import fs from "node:fs";
import path from "node:path";

const [, , inputPath, outputPath = inputPath, degreesText = "180"] = process.argv;
if (!inputPath) {
  console.error("Usage: node scripts/fix-vrma-root-yaw.mjs <input.vrma> [output.vrma] [degrees]");
  process.exit(1);
}

const degrees = Number(degreesText);
if (!Number.isFinite(degrees)) throw new Error(`Invalid yaw: ${degreesText}`);
const bytes = fs.readFileSync(inputPath);
if (bytes.toString("ascii", 0, 4) !== "glTF") throw new Error("VRMA is not a binary glTF file");

const jsonLength = bytes.readUInt32LE(12);
const json = JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).replace(/\0+$/, ""));
const binHeaderOffset = 20 + jsonLength;
if (bytes.toString("ascii", binHeaderOffset + 4, binHeaderOffset + 8) !== "BIN\0") {
  throw new Error("VRMA has no BIN chunk");
}
const binOffset = binHeaderOffset + 8;
const animation = json.animations?.[0];
const hipsIndex = json.nodes?.findIndex((node) => node.name === "Hips");
if (!animation || hipsIndex < 0) throw new Error("VRMA has no animation or Hips node");

const yaw = degrees * Math.PI / 180;
const yawHalf = yaw / 2;
const yawQuaternion = [0, Math.sin(yawHalf), 0, Math.cos(yawHalf)];

for (const channel of animation.channels) {
  if (channel.target.node !== hipsIndex) continue;
  const sampler = animation.samplers[channel.sampler];
  const accessor = json.accessors[sampler.output];
  const view = json.bufferViews[accessor.bufferView];
  if (accessor.componentType !== 5126) throw new Error("Expected FLOAT Hips accessor");
  if (channel.target.path !== "rotation") continue;
  const elementSize = 4;
  const stride = view.byteStride ?? elementSize * 4;
  const start = binOffset + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);

  for (let index = 0; index < accessor.count; index += 1) {
    const offset = start + index * stride;
    const q = Array.from({ length: 4 }, (_, component) => bytes.readFloatLE(offset + component * 4));
    const rotated = multiplyQuaternions(yawQuaternion, q);
    const length = Math.hypot(...rotated) || 1;
    rotated.forEach((value, component) => bytes.writeFloatLE(value / length, offset + component * 4));
  }
}

fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
fs.writeFileSync(outputPath, bytes);
console.log(`Applied ${degrees} degree Hips yaw to ${outputPath}`);

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
