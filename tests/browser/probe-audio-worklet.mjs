import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("test-results/browser/audio-worklet");
const replyText = process.argv[2] ?? `Chao ban ${Date.now()}.`;
const outputName = process.argv[3] ?? "result.json";
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

page.on("pageerror", (error) => {
  consoleMessages.push({ type: "pageerror", text: error.message.slice(0, 500) });
});

page.on("response", (response) => {
  const url = response.url();
  if (url.includes("/api/tts")) {
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

await page.route("**/api/chat", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      sessionId: "00000000-0000-4000-8000-000000000001",
      reply: replyText,
      emotion: "happy",
      animation: "relax",
      expression: "happy",
      intensity: 0.6,
      voiceStyle: "friendly",
      warnings: []
    })
  });
});

let result;
try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), null, { timeout: 60_000 });
  await page.locator("#chat-input").fill("1+3=?");
  await page.locator("#chat-send").click();
  await page.waitForSelector(".chat-message.is-assistant", { timeout: 60_000 });
  await page.waitForFunction(
    () => Boolean(window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt),
    null,
    { timeout: 45_000 }
  );
  await page.screenshot({ path: path.join(outputDir, "audio-playing.png"), fullPage: true });
  await page.waitForFunction(
    () => document.querySelector("#state-pill")?.textContent === "IDLE",
    null,
    { timeout: 90_000 }
  );

  result = {
    browser: await browser.version(),
    replyText,
    appPerformance: await page.evaluate(() => window.__BUDDY_PERF__),
    state: await page.locator("#state-pill").textContent(),
    chatStatus: await page.locator("#chat-status").textContent(),
    toasts: await page.locator(".toast").allTextContents().catch(() => []),
    network,
    consoleMessages
  };
  await writeFile(path.join(outputDir, outputName), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  result = {
    failed: true,
    error: error instanceof Error ? error.message : String(error),
    browser: browser.version(),
    replyText,
    appPerformance: await page.evaluate(() => window.__BUDDY_PERF__).catch(() => null),
    state: await page.locator("#state-pill").textContent().catch(() => null),
    chatStatus: await page.locator("#chat-status").textContent().catch(() => null),
    toasts: await page.locator(".toast").allTextContents().catch(() => []),
    network,
    consoleMessages
  };
  await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => undefined);
  await writeFile(path.join(outputDir, `failure-${outputName}`), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
