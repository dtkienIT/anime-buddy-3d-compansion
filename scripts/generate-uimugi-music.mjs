import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";

const SAMPLE_RATE = 44_100;
const DURATION_SECONDS = 26.8;
const BAR_COUNT = 20;
const TOTAL_BEATS = BAR_COUNT * 4;
const BPM = TOTAL_BEATS * 60 / DURATION_SECONDS;
const BEAT_SECONDS = 60 / BPM;
const VOCAL_DIR = path.join(
  process.cwd(),
  "assets",
  "audio-sources",
  "golden-wheatlight"
);
const OUTPUT_PATH = path.join(
  process.cwd(),
  "apps",
  "web",
  "public",
  "audio",
  "music",
  "Golden-Wheatlight-Original.mp3"
);
const CHECK_ONLY = process.argv.includes("--check");

const sampleCount = Math.round(SAMPLE_RATE * DURATION_SECONDS);
const left = new Float64Array(sampleCount);
const right = new Float64Array(sampleCount);
let randomState = 0x6d2b79f5;

const chordProgression = [
  [62, 66, 69, 73],
  [59, 62, 66, 69],
  [55, 59, 62, 66],
  [57, 62, 64, 69]
];
const bassRoots = [38, 35, 31, 33];
const leadPhrase = [
  74, 78, 81, 76, 83, 81, 78, 76,
  73, 76, 78, 81, 78, 76, 71, 73,
  74, 76, 78, 86, 83, 81, 78, 76,
  71, 74, 76, 78, 81, 78, 76, 73
];

for (let bar = 0; bar < BAR_COUNT; bar += 1) {
  const barStart = bar * 4 * BEAT_SECONDS;
  const chord = chordProgression[bar % chordProgression.length];
  const isBreakdown = bar === 9;
  const isDrop = bar >= 10;
  const sectionGain = bar === 0 ? 0.5 : isBreakdown ? 0.55 : isDrop ? 1 : 0.86;

  for (const [index, midi] of chord.entries()) {
    addPad(barStart, 4.05 * BEAT_SECONDS, midi, 0.032 * sectionGain, (index - 1.5) * 0.27);
  }

  const arpSteps = bar === 0 || isBreakdown ? 8 : 16;
  for (let step = 0; step < arpSteps; step += 1) {
    const note = chord[step % chord.length] + (step % 8 >= 4 ? 12 : 0);
    addPluck(
      barStart + step * 4 * BEAT_SECONDS / arpSteps,
      BEAT_SECONDS * (arpSteps === 16 ? 0.2 : 0.38),
      note,
      0.105 * sectionGain,
      step % 2 === 0 ? -0.42 : 0.42
    );
  }

  if (bar >= 1 && !isBreakdown) {
    for (let beat = 0; beat < 4; beat += 1) {
      const beatStart = barStart + beat * BEAT_SECONDS;
      addKick(beatStart, beat === 0 ? 0.78 : 0.66);
      if (isDrop || (bar >= 4 && beat % 2 === 1)) {
        addKick(beatStart + BEAT_SECONDS * 0.72, isDrop ? 0.43 : 0.32);
      }
      for (let eighth = 0; eighth < 2; eighth += 1) {
        addBass(
          beatStart + eighth * BEAT_SECONDS / 2,
          BEAT_SECONDS * 0.43,
          bassRoots[bar % bassRoots.length] + ((beat + eighth) % 3 === 2 ? 12 : 0),
          isDrop ? 0.235 : 0.205
        );
      }
      if (beat === 1 || beat === 3) {
        addSnare(beatStart, isDrop ? 0.42 : 0.36);
      }
      if (bar >= 2) {
        for (const [index, midi] of chord.entries()) {
          addStab(
            beatStart + BEAT_SECONDS / 2,
            BEAT_SECONDS * 0.28,
            midi + 12,
            0.04 * sectionGain,
            (index - 1.5) * 0.24
          );
        }
      }
    }
  }

  const hatSteps = bar === 0 || isBreakdown ? 16 : isDrop && bar % 2 === 1 ? 32 : 16;
  for (let step = 0; step < hatSteps; step += 1) {
    const stepLength = 4 * BEAT_SECONDS / hatSteps;
    addHat(
      barStart + step * stepLength,
      step % 4 === 2 ? 0.135 : step % 2 === 0 ? 0.09 : 0.065,
      step % 2 === 0 ? -0.55 : 0.55
    );
  }

  if (bar >= 2 && !isBreakdown) {
    const leadSteps = isDrop ? 8 : 6;
    for (let step = 0; step < leadSteps; step += 1) {
      const phraseIndex = ((bar - 2) * 8 + step) % leadPhrase.length;
      const note = leadPhrase[phraseIndex] + (bar >= 16 && step % 7 === 6 ? 12 : 0);
      addLead(
        barStart + step * 4 * BEAT_SECONDS / leadSteps,
        BEAT_SECONDS * (isDrop ? 0.38 : 0.48),
        note,
        isDrop ? 0.165 : 0.13,
        step % 2 === 0 ? -0.24 : 0.24
      );
    }
  }

  if (isBreakdown) {
    addRiser(barStart, 4 * BEAT_SECONDS, 0.24);
  }

  if (bar === 8 || bar === 19) {
    for (let roll = 0; roll < 8; roll += 1) {
      addSnare(
        barStart + (3 + roll / 8) * BEAT_SECONDS,
        0.18 + roll * 0.035
      );
    }
  }
}

addImpact(0, 0.25);
addImpact(4 * BEAT_SECONDS, 0.3);
addImpact(10 * 4 * BEAT_SECONDS, 0.36);
addImpact(16 * 4 * BEAT_SECONDS, 0.4);
addVocalClip("hook.wav", 1.15 * 4 * BEAT_SECONDS, 0.38, -0.08, 1.08);
addVocalClip("lift.wav", 8.55 * 4 * BEAT_SECONDS, 0.34, 0.28, 1.16);
addVocalClip("countdown.wav", 8.82 * 4 * BEAT_SECONDS, 0.46, 0, 1.3);
addVocalClip("hook.wav", 10 * 4 * BEAT_SECONDS, 0.5, 0.08, 1.12);
addVocalClip("lift.wav", 13.45 * 4 * BEAT_SECONDS, 0.32, -0.32, 1.24);
addVocalClip("lift.wav", 16 * 4 * BEAT_SECONDS, 0.38, 0.32, 1.18);
addVocalClip("lift.wav", 18.55 * 4 * BEAT_SECONDS, 0.42, -0.2, 1.28);
renderMaster();

const mp3 = encodeMp3(left, right);
const digest = sha256(mp3);

if (CHECK_ONLY) {
  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(`Missing generated music: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
    process.exit(1);
  }
  const current = fs.readFileSync(OUTPUT_PATH);
  if (!current.equals(mp3)) {
    console.error(
      `Generated music differs: expected ${digest}, found ${sha256(current)}`
    );
    process.exit(1);
  }
  console.log(JSON.stringify({
    file: path.basename(OUTPUT_PATH),
    mode: "checked",
    bytes: mp3.byteLength,
    durationSeconds: DURATION_SECONDS,
    bpm: Number(BPM.toFixed(3)),
    sampleRate: SAMPLE_RATE,
    channels: 2,
    kbps: 192,
    sha256: digest
  }));
} else {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  const existing = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH) : null;
  const mode = existing?.equals(mp3) ? "unchanged" : "written";
  if (mode === "written") fs.writeFileSync(OUTPUT_PATH, mp3);
  console.log(JSON.stringify({
    file: path.relative(process.cwd(), OUTPUT_PATH).replaceAll("\\", "/"),
    mode,
    bytes: mp3.byteLength,
    durationSeconds: DURATION_SECONDS,
    bpm: Number(BPM.toFixed(3)),
    sampleRate: SAMPLE_RATE,
    channels: 2,
    kbps: 192,
    sha256: digest
  }));
}

function addPad(startSeconds, durationSeconds, midi, amplitude, pan) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  const frequency = midiToFrequency(midi);
  const [leftGain, rightGain] = panGains(pan);
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const attack = Math.min(1, localTime / 0.18);
    const release = Math.min(1, (durationSeconds - localTime) / 0.24);
    const envelope = smooth(attack) * smooth(release);
    const phase = 2 * Math.PI * frequency * localTime;
    const value = amplitude * envelope * (
      Math.sin(phase) +
      0.3 * Math.sin(phase * 2.002) +
      0.14 * Math.sin(phase * 3.001)
    );
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

function addPluck(startSeconds, durationSeconds, midi, amplitude, pan) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  const frequency = midiToFrequency(midi);
  const [leftGain, rightGain] = panGains(pan);
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const envelope = Math.min(1, localTime / 0.006) * Math.exp(-localTime * 7.2);
    const phase = 2 * Math.PI * frequency * localTime;
    const value = amplitude * envelope * (
      Math.sin(phase) +
      0.48 * Math.sin(phase * 2) +
      0.2 * Math.sin(phase * 3) +
      0.08 * Math.sin(phase * 5)
    );
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

function addLead(startSeconds, durationSeconds, midi, amplitude, pan) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  const frequency = midiToFrequency(midi);
  const [leftGain, rightGain] = panGains(pan);
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const attack = Math.min(1, localTime / 0.006);
    const release = Math.min(1, (durationSeconds - localTime) / 0.045);
    const envelope = smooth(attack) * smooth(release);
    const vibrato = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * localTime);
    const phase = 2 * Math.PI * frequency * localTime * vibrato;
    const value = amplitude * envelope * (
      0.7 * Math.sin(phase) +
      0.32 * Math.sin(phase * 2) +
      0.13 * Math.sin(phase * 3) +
      0.07 * Math.sin(phase * 5)
    );
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

function addStab(startSeconds, durationSeconds, midi, amplitude, pan) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  const frequency = midiToFrequency(midi);
  const [leftGain, rightGain] = panGains(pan);
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const envelope = Math.min(1, localTime / 0.004) * Math.exp(-localTime * 13);
    const phase = 2 * Math.PI * frequency * localTime;
    const value = amplitude * envelope * (
      Math.sin(phase) +
      0.55 * Math.sin(phase * 2.01) +
      0.3 * Math.sin(phase * 3.02) +
      0.16 * Math.sin(phase * 4.03)
    );
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

function addBass(startSeconds, durationSeconds, midi, amplitude) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  const frequency = midiToFrequency(midi);
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const envelope = Math.min(1, localTime / 0.006) * Math.exp(-localTime * 5.2);
    const phase = 2 * Math.PI * frequency * localTime;
    const value = amplitude * envelope * (
      0.7 * Math.sin(phase) +
      0.25 * Math.sin(phase * 2) +
      0.08 * Math.sin(phase * 3)
    );
    left[index] += value * 0.72;
    right[index] += value * 0.72;
  }
}

function addKick(startSeconds, amplitude) {
  const durationSeconds = 0.24;
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const envelope = Math.exp(-localTime * 18);
    const phase = 2 * Math.PI * (
      43 * localTime +
      102 * (1 - Math.exp(-localTime * 27)) / 27
    );
    const click = localTime < 0.012 ? (1 - localTime / 0.012) * (random() * 2 - 1) : 0;
    const value = amplitude * (Math.sin(phase) * envelope + click * 0.16);
    left[index] += value * 0.72;
    right[index] += value * 0.72;
  }
}

function addSnare(startSeconds, amplitude) {
  const durationSeconds = 0.22;
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  let previousNoise = 0;
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const envelope = Math.exp(-localTime * 18);
    const noise = random() * 2 - 1;
    const highNoise = noise - previousNoise * 0.72;
    previousNoise = noise;
    const body = Math.sin(2 * Math.PI * 185 * localTime);
    const value = amplitude * envelope * (highNoise * 0.7 + body * 0.3);
    left[index] += value * 0.66;
    right[index] += value * 0.72;
  }
}

function addHat(startSeconds, amplitude, pan) {
  const durationSeconds = 0.065;
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  let previousNoise = 0;
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const noise = random() * 2 - 1;
    const highNoise = noise - previousNoise;
    previousNoise = noise;
    const value = amplitude * Math.exp(-localTime * 55) * highNoise;
    left[index] += value * leftGain;
    right[index] += value * rightGain;
  }
}

function addRiser(startSeconds, durationSeconds, amplitude) {
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  let previousNoise = 0;
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const progress = Math.min(1, localTime / durationSeconds);
    const noise = random() * 2 - 1;
    const highNoise = noise - previousNoise * (0.92 - progress * 0.45);
    previousNoise = noise;
    const value = amplitude * progress * progress * highNoise * (0.55 + 0.45 * Math.sin(Math.PI * progress));
    left[index] += value * 0.48;
    right[index] += value * 0.62;
  }
}

function addImpact(startSeconds, amplitude) {
  const durationSeconds = 0.7;
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const end = Math.min(sampleCount, Math.ceil((startSeconds + durationSeconds) * SAMPLE_RATE));
  for (let index = start; index < end; index += 1) {
    const localTime = index / SAMPLE_RATE - startSeconds;
    const envelope = Math.exp(-localTime * 5.5);
    const value = amplitude * envelope * (
      Math.sin(2 * Math.PI * 62 * localTime) +
      0.35 * (random() * 2 - 1)
    );
    left[index] += value * 0.68;
    right[index] += value * 0.68;
  }
}

function addVocalClip(filename, startSeconds, amplitude, pan, speed) {
  const { samples, sampleRate } = readMonoPcm16Wav(path.join(VOCAL_DIR, filename));
  const trimmed = trimSilence(samples, sampleRate);
  const outputLength = Math.ceil(trimmed.length * SAMPLE_RATE / (sampleRate * speed));
  const start = Math.max(0, Math.floor(startSeconds * SAMPLE_RATE));
  const [leftGain, rightGain] = panGains(pan);
  const delaySamples = Math.round(0.065 * SAMPLE_RATE);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const targetIndex = start + outputIndex;
    if (targetIndex >= sampleCount) break;
    const sourcePosition = outputIndex * sampleRate * speed / SAMPLE_RATE;
    const sourceIndex = Math.floor(sourcePosition);
    const fraction = sourcePosition - sourceIndex;
    const first = trimmed[sourceIndex] ?? 0;
    const second = trimmed[Math.min(trimmed.length - 1, sourceIndex + 1)] ?? first;
    const sample = first + (second - first) * fraction;
    const attack = Math.min(1, outputIndex / (0.012 * SAMPLE_RATE));
    const release = Math.min(1, (outputLength - 1 - outputIndex) / (0.055 * SAMPLE_RATE));
    const envelope = smooth(attack) * smooth(release);
    const gate = 0.9 + 0.1 * Math.sin(2 * Math.PI * outputIndex / (SAMPLE_RATE * BEAT_SECONDS / 2));
    const vocal = Math.tanh(sample * 1.7) * amplitude * envelope * gate;
    left[targetIndex] += vocal * leftGain;
    right[targetIndex] += vocal * rightGain;

    const delayedIndex = targetIndex + delaySamples;
    if (delayedIndex < sampleCount) {
      left[delayedIndex] += vocal * rightGain * 0.2;
      right[delayedIndex] += vocal * leftGain * 0.2;
    }
  }
}

function readMonoPcm16Wav(filename) {
  const buffer = fs.readFileSync(filename);
  if (
    buffer.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buffer.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    throw new Error(`${filename}: expected a RIFF/WAVE file`);
  }

  let format = null;
  let data = null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkLength = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    if (chunkId === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14)
      };
    } else if (chunkId === "data") {
      data = buffer.subarray(chunkStart, chunkStart + chunkLength);
    }
    offset = chunkStart + chunkLength + (chunkLength % 2);
  }

  if (
    !format ||
    format.audioFormat !== 1 ||
    format.channels !== 1 ||
    format.bitsPerSample !== 16 ||
    !data
  ) {
    throw new Error(`${filename}: expected mono PCM16 WAV`);
  }

  const samples = new Float64Array(data.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = data.readInt16LE(index * 2) / 32768;
  }
  return { samples, sampleRate: format.sampleRate };
}

function trimSilence(samples, sampleRate) {
  const threshold = 0.012;
  const padding = Math.round(sampleRate * 0.025);
  let first = 0;
  let last = samples.length - 1;
  while (first < samples.length && Math.abs(samples[first]) < threshold) first += 1;
  while (last > first && Math.abs(samples[last]) < threshold) last -= 1;
  return samples.subarray(
    Math.max(0, first - padding),
    Math.min(samples.length, last + padding + 1)
  );
}

function renderMaster() {
  const fadeInSamples = Math.round(0.025 * SAMPLE_RATE);
  const fadeOutSamples = Math.round(0.24 * SAMPLE_RATE);
  let peak = 0;

  for (let index = 0; index < sampleCount; index += 1) {
    const fadeIn = Math.min(1, index / fadeInSamples);
    const fadeOut = Math.min(1, (sampleCount - 1 - index) / fadeOutSamples);
    const masterEnvelope = smooth(fadeIn) * smooth(fadeOut);
    left[index] = Math.tanh(left[index] * 1.48) * masterEnvelope;
    right[index] = Math.tanh(right[index] * 1.48) * masterEnvelope;
    peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index]));
  }

  const gain = peak > 0 ? 0.94 / peak : 1;
  for (let index = 0; index < sampleCount; index += 1) {
    left[index] *= gain;
    right[index] *= gain;
  }
}

function encodeMp3(leftChannel, rightChannel) {
  const require = createRequire(import.meta.url);
  const bundlePath = require.resolve("lamejs/lame.min.js");
  const context = {};
  vm.createContext(context);
  vm.runInContext(
    `${fs.readFileSync(bundlePath, "utf8")};globalThis.__lamejs = lamejs;`,
    context,
    { filename: bundlePath }
  );

  const encoder = new context.__lamejs.Mp3Encoder(2, SAMPLE_RATE, 192);
  const blockSize = 1152;
  const chunks = [];
  const pcmLeft = toInt16(leftChannel);
  const pcmRight = toInt16(rightChannel);

  for (let offset = 0; offset < sampleCount; offset += blockSize) {
    const chunk = encoder.encodeBuffer(
      pcmLeft.subarray(offset, offset + blockSize),
      pcmRight.subarray(offset, offset + blockSize)
    );
    if (chunk.length > 0) chunks.push(Buffer.from(chunk));
  }
  const tail = encoder.flush();
  if (tail.length > 0) chunks.push(Buffer.from(tail));
  return Buffer.concat(chunks);
}

function toInt16(channel) {
  const pcm = new Int16Array(channel.length);
  for (let index = 0; index < channel.length; index += 1) {
    const value = Math.max(-1, Math.min(1, channel[index]));
    pcm[index] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return pcm;
}

function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function panGains(pan) {
  const angle = (Math.max(-1, Math.min(1, pan)) + 1) * Math.PI / 4;
  return [Math.cos(angle), Math.sin(angle)];
}

function smooth(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function random() {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  return (randomState >>> 0) / 4_294_967_296;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
