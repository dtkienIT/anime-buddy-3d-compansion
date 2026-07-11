import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("test-results/browser/interactions");
await mkdir(outputDir, { recursive: true });
const outputPath = path.join(outputDir, process.argv[2] ?? "final.json");
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const consoleMessages = [];
const failedRequests = [];
const ttsRequests = [];
const scenarios = [];
let ttsMode = "normal";
let ttsSequence = 0;

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
  }
});
page.on("pageerror", (error) => consoleMessages.push({ type: "pageerror", text: error.message.slice(0, 500) }));
page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));

const longReply = [
  "Đây là đoạn thứ nhất được viết đủ dài để bộ tách câu tạo ra một phần âm thanh độc lập và kiểm tra đúng thứ tự phát trong hàng đợi.",
  "Đây là đoạn thứ hai cũng có độ dài ổn định để việc tổng hợp chạy song song trong lúc đoạn trước đang được phát mà không tạo khoảng lặng lớn.",
  "Đây là đoạn thứ ba tiếp tục bài kiểm tra liên tục với nội dung khác biệt rõ ràng nhằm phát hiện mọi trường hợp lặp hoặc bỏ sót.",
  "Đây là đoạn thứ tư kết thúc kịch bản và xác nhận hàng đợi đóng lại đúng cách trước khi giao diện trở về trạng thái nghỉ hoàn toàn."
].join(" ");

await page.route("**/api/chat", async (route) => {
  const body = route.request().postDataJSON();
  const message = String(body?.message ?? "");
  if (message.includes("old-reply")) await delay(900);
  const reply = message.includes("short") ? `Phản hồi mới ${message}.` : longReply;
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessionId: "00000000-0000-4000-8000-000000000001",
      reply,
      emotion: "happy",
      animation: "relax",
      expression: "happy",
      intensity: 0.6,
      voiceStyle: "friendly",
      warnings: []
    })
  }).catch(() => undefined);
});

await page.route("**/api/tts", async (route) => {
  const request = route.request();
  const body = request.postDataJSON();
  const index = ttsSequence++;
  ttsRequests.push({ index, text: body.text, startedAt: performance.now(), mode: ttsMode });
  if (ttsMode === "unavailable") {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
    return;
  }
  if (ttsMode === "timeout") {
    await delay(31_000);
  } else if (ttsMode === "slow-later" && index % 4 !== 0) {
    await delay(1500);
  } else {
    await delay(35);
  }
  if (ttsMode === "malformed") {
    await route.fulfill({ status: 200, contentType: "application/octet-stream", body: Buffer.alloc(32) });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "audio/wav",
    headers: {
      "x-tts-cache": "MOCK",
      "x-tts-request-id": request.headers()["x-buddy-tts-request-id"] ?? `mock-${index}`,
      "server-timing": "tts-queue;dur=0, tts-synthesis;dur=35, tts-total;dur=35"
    },
    body: makeWav(0.75, 330 + index * 20)
  }).catch(() => undefined);
});

async function run(name, action) {
  const startedAt = performance.now();
  try {
    const detail = await action();
    scenarios.push({ name, status: "PASS", durationMs: performance.now() - startedAt, detail });
  } catch (error) {
    scenarios.push({ name, status: "FAIL", durationMs: performance.now() - startedAt, error: String(error) });
    throw error;
  }
}

async function submit(message) {
  await page.locator("#chat-input").fill(message);
  await page.locator("#chat-send").click();
}

async function waitIdle(timeout = 30_000) {
  await page.waitForFunction(() => document.querySelector("#state-pill")?.textContent === "IDLE", null, { timeout });
}

try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), null, { timeout: 60_000 });

  await run("deterministic-multi-chunk", async () => {
    ttsMode = "normal";
    const before = ttsRequests.length;
    await submit("multi chunk deterministic");
    await page.waitForFunction(() => (window.__BUDDY_PERF__?.runs.at(-1)?.chunks.length ?? 0) >= 3, null, { timeout: 15_000 });
    await page.screenshot({ path: path.join(outputDir, "multi-chunk-playing.png"), fullPage: true });
    await waitIdle();
    const run = await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1));
    const requests = ttsRequests.slice(before);
    if (requests.length < 3) throw new Error(`expected >=3 TTS requests, got ${requests.length}`);
    if ((run?.metrics.maxGapBeforeNextChunkMs ?? 999) > 120) throw new Error("inter-chunk gap exceeded 120ms");
    if (run?.metrics.lipSyncNeutralAfterPlayback !== 1) throw new Error("lip sync did not reset");
    return { chunkCount: requests.length, run };
  });

  await run("stop-first-chunk", async () => {
    ttsMode = "normal";
    await submit("stop first chunk");
    await page.waitForFunction(() => window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt, null, { timeout: 15_000 });
    await page.locator("#stop-speaking").click();
    await waitIdle();
    await page.screenshot({ path: path.join(outputDir, "stopped.png"), fullPage: true });
    return await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1));
  });

  await run("stop-later-synthesis", async () => {
    ttsMode = "slow-later";
    await submit("stop later synthesis");
    await page.waitForFunction(() => window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt, null, { timeout: 15_000 });
    await delay(150);
    await page.locator("#stop-speaking").click();
    await waitIdle();
    return await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1));
  });

  await run("rapid-replacement", async () => {
    ttsMode = "normal";
    await submit("old-reply should be cancelled");
    await delay(80);
    await submit("short replacement-reply");
    await waitIdle();
    const messages = await page.locator("#chat-log .chat-message.is-assistant").allTextContents();
    if (messages.some((text) => text.includes("đoạn thứ nhất")) && !messages.at(-1)?.includes("replacement-reply")) {
      throw new Error("stale assistant reply survived replacement");
    }
    return { lastAssistant: messages.at(-1), runs: await page.evaluate(() => window.__BUDDY_PERF__?.runs.slice(-2)) };
  });

  await run("voice-toggle", async () => {
    if ((await page.locator("#voice-toggle").textContent()) !== "On") await page.locator("#voice-toggle").click();
    await page.locator("#voice-toggle").click();
    const before = ttsRequests.length;
    await submit("short voice-off-before-send");
    await waitIdle();
    if (ttsRequests.length !== before) throw new Error("TTS called while voice was off");
    await page.locator("#voice-toggle").click();
    await submit("voice on during playback");
    await page.waitForFunction(() => window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt, null, { timeout: 15_000 });
    await page.locator("#voice-toggle").click();
    await waitIdle();
    await page.locator("#voice-toggle").click();
    return { requestDelta: ttsRequests.length - before };
  });

  for (const mode of ["unavailable", "malformed", "timeout"]) {
    await run(`tts-${mode}`, async () => {
      ttsMode = mode;
      await submit(`short tts ${mode}`);
      await waitIdle(mode === "timeout" ? 45_000 : 30_000);
      if ((await page.locator("#state-pill").textContent()) !== "IDLE") throw new Error("state not IDLE");
      return { toasts: await page.locator(".toast").allTextContents() };
    });
  }

  await page.screenshot({ path: path.join(outputDir, "final-idle.png"), fullPage: true });
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => undefined);
  scenarios.push({ name: "probe", status: "FAIL", error: String(error) });
  process.exitCode = 1;
} finally {
  const result = {
    browser: await browser.version(),
    viewport: { width: 1440, height: 960 },
    scenarios,
    ttsRequests,
    consoleMessages,
    failedRequests,
    finalState: await page.locator("#state-pill").textContent().catch(() => null),
    appPerformance: await page.evaluate(() => window.__BUDDY_PERF__).catch(() => null)
  };
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  await context.close();
  await browser.close();
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function makeWav(durationSeconds, frequency) {
  const sampleRate = 48000;
  const frames = Math.floor(sampleRate * durationSeconds);
  const buffer = Buffer.alloc(44 + frames * 2);
  buffer.write("RIFF", 0); buffer.writeUInt32LE(36 + frames * 2, 4); buffer.write("WAVE", 8);
  buffer.write("fmt ", 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write("data", 36); buffer.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i += 1) {
    const envelope = Math.min(1, i / 240) * Math.min(1, (frames - i) / 240);
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * frequency * i / sampleRate) * 5000 * envelope), 44 + i * 2);
  }
  return buffer;
}
