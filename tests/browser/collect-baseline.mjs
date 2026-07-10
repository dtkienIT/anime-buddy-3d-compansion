import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("test-results/browser/baseline");
const message = process.argv[2] ?? "1+3=?";
const outputName = process.argv[3] ?? "cold-short.json";
const replay = process.argv[4] === "replay";
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const consoleMessages = [];
const network = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
  }
});
page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/chat") || url.includes("/api/tts")) {
    network.push({
      url: new URL(url).pathname,
      status: response.status(),
      cache: response.headers()["x-tts-cache"] ?? null,
      format: response.headers()["x-audio-format"] ?? null,
      sampleRate: response.headers()["x-audio-sample-rate"] ?? null,
      channels: response.headers()["x-audio-channels"] ?? null,
      bytesPerSample: response.headers()["x-audio-bytes-per-sample"] ?? null,
      serverTiming: response.headers()["server-timing"] ?? null
    });
  }
});

await page.addInitScript(() => {
  const data = { marks: {}, requests: [] };
  window.__BASELINE_PERF__ = data;
  const mark = (name) => { data.marks[name] = performance.now(); };

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const url = String(args[0] instanceof Request ? args[0].url : args[0]);
    const kind = url.includes("/api/chat") ? "chat" : url.includes("/api/tts") ? "tts" : null;
    if (!kind) return originalFetch(...args);
    const entry = { kind, startedAt: performance.now() };
    if (kind === "tts" && typeof args[1]?.body === "string") {
      try { entry.textLength = JSON.parse(args[1].body).text?.length ?? null; } catch { entry.textLength = null; }
    }
    data.requests.push(entry);
    const response = await originalFetch(...args);
    entry.headersAt = performance.now();
    entry.status = response.status;
    return response;
  };

  const originalBlob = Response.prototype.blob;
  Response.prototype.blob = async function (...args) {
    const result = await originalBlob.apply(this, args);
    if (this.url.includes("/api/tts")) mark("ttsResponseCompletedAt");
    return result;
  };

  const originalDecode = AudioContext.prototype.decodeAudioData;
  AudioContext.prototype.decodeAudioData = async function (...args) {
    mark("audioDecodeStartedAt");
    const result = await originalDecode.apply(this, args);
    mark("audioDecodeCompletedAt");
    return result;
  };

  const originalStart = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    if (!data.marks.audioPlayingAt) {
      mark("audioPlayingAt");
      window.dispatchEvent(new Event("baseline-audio-playing"));
    }
    return originalStart.apply(this, args);
  };

  document.addEventListener("DOMContentLoaded", () => {
    const observer = new MutationObserver(() => {
      if (!data.marks.replyRenderedAt && document.querySelector(".chat-message.is-assistant")) {
        mark("replyRenderedAt");
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
});

try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), null, { timeout: 60_000 });
  const canvas = await page.locator("#stage").evaluate((element) => ({
    width: element.clientWidth,
    height: element.clientHeight,
    pixels: [element.width, element.height]
  }));
  await page.screenshot({ path: path.join(outputDir, "boot.png"), fullPage: true });

  await page.locator("#chat-input").fill(message);
  await page.locator("#chat-send").click();
  await page.waitForSelector(".chat-message.is-assistant", { timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(
      window.__BASELINE_PERF__.marks.audioPlayingAt ||
      window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt
    ),
    null,
    { timeout: 90_000 }
  );
  await page.screenshot({ path: path.join(outputDir, "audio-playing.png"), fullPage: true });
  await page.waitForFunction(
    () => document.querySelector("#state-pill")?.textContent === "IDLE",
    null,
    { timeout: 60_000 }
  );

  if (replay) {
    const previousRuns = await page.evaluate(() => window.__BUDDY_PERF__?.runs.length ?? 0);
    await page.locator("#replay-reply").click();
    await page.waitForFunction(
      (runCount) => {
        const runs = window.__BUDDY_PERF__?.runs ?? [];
        return runs.length > runCount && runs.at(-1)?.marks.audioPlayingAt !== undefined;
      },
      previousRuns,
      { timeout: 60_000 }
    );
    await page.screenshot({ path: path.join(outputDir, "cache-replay-playing.png"), fullPage: true });
    await page.waitForFunction(
      () => document.querySelector("#state-pill")?.textContent === "IDLE",
      null,
      { timeout: 60_000 }
    );
  }

  const performanceData = await page.evaluate(() => window.__BASELINE_PERF__);
  const appPerformance = await page.evaluate(() => window.__BUDDY_PERF__);
  const latencyRun = appPerformance?.runs.find((run) => run.marks.chatRequestStartedAt) ?? appPerformance?.runs.at(-1);
  const result = {
    browser: await browser.version(),
    canvas,
    performance: performanceData,
    appPerformance,
    replyToAudioLatency: latencyRun?.metrics.replyToAudioLatency ?? (
      performanceData.marks.audioPlayingAt - performanceData.marks.replyRenderedAt
    ),
    network,
    consoleMessages
  };
  await writeFile(path.join(outputDir, outputName), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
}
