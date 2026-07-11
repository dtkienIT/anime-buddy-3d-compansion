import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const count = Math.max(5, Number(process.argv[2] ?? 5));
const outputDir = path.resolve("test-results/browser/tts-benchmark");
await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const consoleMessages = [];
const network = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
});
page.on("response", (response) => {
  if (response.url().includes("/api/tts")) network.push({ status: response.status(), cache: response.headers()["x-tts-cache"], serverTiming: response.headers()["server-timing"] });
});
await page.route("**/api/chat", async (route) => {
  const message = String(route.request().postDataJSON()?.message ?? "");
  const index = Number(message.match(/(\d+)$/)?.[1] ?? 0);
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    sessionId: "00000000-0000-4000-8000-000000000001",
    reply: `Chào bạn, mã đo tốc độ ${index} z0711.`,
    emotion: "happy", animation: "relax", expression: "happy", intensity: 0.5, voiceStyle: "friendly", warnings: []
  }) });
});

async function send(index) {
  const before = await page.evaluate(() => window.__BUDDY_PERF__?.runs.length ?? 0);
  await page.locator("#chat-input").fill(`benchmark ${index}`);
  await page.locator("#chat-send").click();
  await page.waitForFunction((n) => (window.__BUDDY_PERF__?.runs.length ?? 0) > n && window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt, before, { timeout: 60_000 });
  await page.waitForFunction(() => document.querySelector("#state-pill")?.textContent === "IDLE", null, { timeout: 90_000 });
  return await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1));
}

const missRuns = [];
const hitRuns = [];
try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), null, { timeout: 60_000 });
  const seed = Date.now() % 100000;
  for (let i = 0; i < count; i += 1) missRuns.push(await send(seed + i));
  for (let i = 0; i < count; i += 1) hitRuns.push(await send(seed + i));
  await page.screenshot({ path: path.join(outputDir, "final-idle.png"), fullPage: true });
} finally {
  const result = {
    browser: await browser.version(), count,
    missRuns, hitRuns,
    missStats: summarize(missRuns), hitStats: summarize(hitRuns),
    network, consoleMessages,
    finalState: await page.locator("#state-pill").textContent().catch(() => null)
  };
  await writeFile(path.join(outputDir, process.argv[3] ?? "final.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ missStats: result.missStats, hitStats: result.hitStats, finalState: result.finalState }, null, 2));
  await context.close();
  await browser.close();
}

function summarize(runs) {
  return Object.fromEntries(["firstVisibleTextLatency", "replyToAudioLatency", "ttsBackendLatency", "ttsDownloadLatency", "audioDecodeLatency"]
    .map((name) => [name, stats(runs.map((run) => run?.metrics?.[name]).filter(Number.isFinite))]));
}
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  return { min: sorted[0], p50: pct(sorted, .5), p95: pct(sorted, .95), max: sorted.at(-1) };
}
function pct(values, fraction) {
  const index = (values.length - 1) * fraction, lo = Math.floor(index), hi = Math.ceil(index);
  return lo === hi ? values[lo] : values[lo] + (values[hi] - values[lo]) * (index - lo);
}
