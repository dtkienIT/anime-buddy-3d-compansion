import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const assetGroups = {
  models: [
    "8590256991748008892.vrm",
    "8329890252317737768.vrm",
    "sample.vrm",
    "vita.vrm",
    "vivi.vrm",
    "6493143135142452442.vrm",
    "naruto.vrm",
    "Changli.vrm",
    "Yinlin.vrm",
    "Carlotta.vrm"
  ].map((name) => `apps/web/public/models/${name}`),
  animations: [
    "Wave.vrma",
    "Nod.vrma",
    "GentleGesture.vrma",
    "CuriousTilt.vrma",
    "Listening.vrma",
    "Talking.vrma",
    "Singing.vrma",
    "Greeting.vrma",
    "Relax.vrma",
    "Thinking.vrma",
    "ShakeHead.vrma",
    "Dance25.vrma",
    "UiMugibatake.vrma",
    "WelcomePose.vrma",
    "CutePose.vrma",
    "VictoryPose.vrma",
    "PresentationPose.vrma",
    "MotionPose.vrma",
    "Dogeza.vrma",
    "StepExercise.vrma",
    "Hello.vrma",
    "Smartphone.vrma",
    "DrinkWater.vrma",
    "Encourage.vrma",
    "Startled.vrma",
    "LookAround.vrma",
    "Clapping.vrma",
    "Goodbye.vrma",
    "Jump.vrma",
    "Angry.vrma",
    "Blush.vrma",
    "Sad.vrma",
    "Sleepy.vrma",
    "Surprised.vrma",
    "Peace.vrma",
    "Shoot.vrma",
    "Spin.vrma",
    "Pose.vrma",
    "Squat.vrma",
    "vrma_01.vrma",
    "Bling-Bang-Bang-Born.vrma",
    "Aipai-Dance-Hall.vrma",
    "Happy-Synthesizer.vrma"
  ].map((name) => `apps/web/public/animations/${name}`),
  backgrounds: [
    "study-room-sunlit.png",
    "cozy-night.png",
    "cozy-lounge.png",
    "pastel-study.png",
    "forest-path-bright.png",
    "lake-meadow-bright.png",
    "neon-tech.png"
  ].map((name) => `apps/web/public/backgrounds/${name}`),
  audio: [
    "Bling-Bang-Bang-Born.mp3",
    "Aipai-Dance-Hall.mp3",
    "Cham-Vao-Binh-Minh.mp3",
    "Golden-Wheatlight-Original.mp3"
  ].map((name) => `apps/web/public/audio/music/${name}`),
  audioVideos: [
    "Happy-Synthesizer-Stage.mp4"
  ].map((name) => `apps/web/public/audio/music/${name}`),
  audioSources: [
    "hook.wav",
    "countdown.wav",
    "lift.wav"
  ].map((name) => `assets/audio-sources/golden-wheatlight/${name}`)
};

const generatedAnimations = [
  "Relax.vrma",
  "Listening.vrma",
  "Thinking.vrma",
  "Talking.vrma",
  "Singing.vrma",
  "GentleGesture.vrma",
  "CuriousTilt.vrma",
  "Nod.vrma",
  "Wave.vrma"
];
const minimumBytes = {
  models: 16 * 1024,
  animations: 1024,
  backgrounds: 1024,
  audio: 1024,
  audioSources: 1024,
  audioVideos: 1024
};
const canonicalAssets = new Map([
  [
    "animations/UiMugibatake.vrma",
    "8f57fd5257086261650e8c0a3095092ad27ee705142826d0b3ef2350ca425e04"
  ],
  [
    "apps/web/public/animations/UiMugibatake.vrma",
    "8f57fd5257086261650e8c0a3095092ad27ee705142826d0b3ef2350ca425e04"
  ],
  [
    "apps/web/public/audio/music/Cham-Vao-Binh-Minh.mp3",
    "69bdbdca2349e9c4397ab9cd30b3564935c85ecb15c78bc33d1948876292c162"
  ],
  [
    "apps/web/public/audio/music/Golden-Wheatlight-Original.mp3",
    "5eb17984fb058d37350d43d80ccabeed4727a593cda5927b209968e36e244473"
  ],
  [
    "assets/audio-sources/golden-wheatlight/hook.wav",
    "42733e39de4c5543999e6d309d801ad3051b22bddfab9578a9faf8ecc4c1f37a"
  ],
  [
    "assets/audio-sources/golden-wheatlight/countdown.wav",
    "4d69c9fa6b5cb4c1d5685287c0fe30b969e95b79d1a620433e844d42ca57319c"
  ],
  [
    "assets/audio-sources/golden-wheatlight/lift.wav",
    "8243acf27423685e28c087b9e746f3a3ec704271c9e551e4f71bced5f995280c"
  ]
]);
const failures = [];
const checks = [];

for (const [group, relativePaths] of Object.entries(assetGroups)) {
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      failures.push(`${relativePath}: missing`);
      continue;
    }

    const buffer = fs.readFileSync(absolutePath);
    if (buffer.byteLength < minimumBytes[group]) {
      failures.push(`${relativePath}: only ${buffer.byteLength} bytes`);
      continue;
    }

    const signatureError = validateSignature(relativePath, buffer);
    if (signatureError) {
      failures.push(`${relativePath}: ${signatureError}`);
      continue;
    }

    checks.push({ group, relativePath, bytes: buffer.byteLength });
  }
}

for (const [relativePath, expectedHash] of canonicalAssets) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`${relativePath}: missing canonical asset`);
    continue;
  }
  const actualHash = sha256(fs.readFileSync(absolutePath));
  if (actualHash !== expectedHash) {
    failures.push(`${relativePath}: canonical SHA-256 mismatch`);
  }
}

for (const name of generatedAnimations) {
  const sourcePath = path.join(root, "animations", name);
  const publicPath = path.join(root, "apps", "web", "public", "animations", name);
  if (!fs.existsSync(sourcePath) || !fs.existsSync(publicPath)) {
    failures.push(`${name}: generated source/public pair is incomplete`);
    continue;
  }

  const source = fs.readFileSync(sourcePath);
  const published = fs.readFileSync(publicPath);
  const sourceHash = sha256(source);
  const publicHash = sha256(published);
  if (sourceHash !== publicHash) {
    failures.push(`${name}: animations/ and apps/web/public/animations/ differ`);
    continue;
  }

  try {
    const json = readGlbJson(published);
    const extension = json.extensions?.VRMC_vrm_animation;
    if (extension?.specVersion !== "1.0") {
      failures.push(`${name}: VRMC_vrm_animation.specVersion must be 1.0`);
    }
    if (!json.animations?.length) {
      failures.push(`${name}: contains no animation tracks`);
    }
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  console.error(`Asset verification failed (${failures.length}):\n${failures.join("\n")}`);
  process.exit(1);
}

const summary = Object.fromEntries(
  Object.keys(assetGroups).map((group) => [group, checks.filter((item) => item.group === group).length])
);
console.log(`Asset verification passed for ${checks.length} files. ${JSON.stringify(summary)}`);
console.log(`Generated VRMA parity/spec checks passed for ${generatedAnimations.length} files.`);

function validateSignature(relativePath, buffer) {
  if (relativePath.endsWith(".vrm") || relativePath.endsWith(".vrma")) {
    return buffer.subarray(0, 4).toString("ascii") === "glTF" ? null : "invalid GLB signature";
  }
  if (relativePath.endsWith(".png")) {
    return buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a" ? null : "invalid PNG signature";
  }
  if (relativePath.endsWith(".mp3")) {
    const isId3 = buffer.subarray(0, 3).toString("ascii") === "ID3";
    const isMpegFrame = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    return isId3 || isMpegFrame ? null : "invalid MP3 signature";
  }
  if (relativePath.endsWith(".mp4")) {
    return buffer.subarray(4, 8).toString("ascii") === "ftyp" ? null : "invalid MP4 signature";
  }
  if (relativePath.endsWith(".wav")) {
    const isRiff = buffer.subarray(0, 4).toString("ascii") === "RIFF";
    const isWave = buffer.subarray(8, 12).toString("ascii") === "WAVE";
    return isRiff && isWave ? null : "invalid WAV signature";
  }
  return null;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function readGlbJson(buffer) {
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF") {
    throw new Error("invalid GLB signature");
  }
  if (buffer.readUInt32LE(4) !== 2) {
    throw new Error("unsupported GLB version");
  }
  if (buffer.readUInt32LE(8) !== buffer.byteLength) {
    throw new Error("GLB declared length does not match file size");
  }
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || 20 + jsonLength > buffer.byteLength) {
    throw new Error("invalid GLB JSON chunk");
  }
  return JSON.parse(buffer.subarray(20, 20 + jsonLength).toString("utf8").trim());
}
