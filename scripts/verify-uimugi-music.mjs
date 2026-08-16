import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const relativePath = "apps/web/public/audio/music/Golden-Wheatlight-Original.mp3";
const expectedHash = "5eb17984fb058d37350d43d80ccabeed4727a593cda5927b209968e36e244473";
const minimumBytes = 1024;
const absolutePath = path.join(process.cwd(), relativePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`Missing Uimugi soundtrack: ${relativePath}`);
  process.exit(1);
}

const buffer = fs.readFileSync(absolutePath);
if (buffer.byteLength < minimumBytes) {
  console.error(`Uimugi soundtrack is unexpectedly small: ${buffer.byteLength} bytes`);
  process.exit(1);
}

const isId3 = buffer.subarray(0, 3).toString("ascii") === "ID3";
const isMpegFrame = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
if (!isId3 && !isMpegFrame) {
  console.error("Uimugi soundtrack does not have a valid MP3 signature");
  process.exit(1);
}

const actualHash = createHash("sha256").update(buffer).digest("hex");
if (actualHash !== expectedHash) {
  console.error(`Uimugi soundtrack SHA-256 mismatch: expected ${expectedHash}, found ${actualHash}`);
  process.exit(1);
}

console.log(JSON.stringify({
  file: relativePath,
  mode: "checked",
  bytes: buffer.byteLength,
  expectedDurationSeconds: 150,
  sha256: actualHash
}));
