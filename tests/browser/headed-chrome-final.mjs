import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedUiPreferences, waitForAppReady, waitForCompanionState } from "./ui-test-helpers.mjs";

const outputDir = path.resolve("test-results/browser/headed-chrome");
await mkdir(outputDir, { recursive: true });
const replyText = "This is the first deterministic real service sentence with enough words to make a separate audio section for ordering checks. This is the second deterministic real service sentence with enough words to overlap synthesis and current playback. This is the third deterministic real service sentence with enough words to verify continuity without duplicated sound. This is the fourth deterministic real service sentence with enough words to close the queue and return to idle.";
const browser = await chromium.launch({ channel: "chrome", headless: false, args: ["--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const consoleMessages = [];
const failedRequests = [];
const network = [];
await seedUiPreferences(page, { controlsOpen: false, welcomeSeen: true });
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
});
page.on("pageerror", (error) => consoleMessages.push({ type: "pageerror", text: error.message.slice(0, 500) }));
page.on("requestfailed", (request) => failedRequests.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
page.on("response", (response) => {
  if (response.url().includes("/api/tts")) network.push({ status: response.status(), cache: response.headers()["x-tts-cache"], serverTiming: response.headers()["server-timing"] });
});
await page.route("**/api/chat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
  sessionId: "00000000-0000-4000-8000-000000000001", reply: replyText,
  emotion: "happy", animation: "relax", expression: "happy", intensity: 0.6, voiceStyle: "friendly", warnings: []
}) }));

let failure;
try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await page.screenshot({ path: path.join(outputDir, "boot.png"), fullPage: true });
  await page.locator("#chat-input").fill("headed chrome multi chunk");
  await page.locator("#chat-send").click();
  await page.waitForFunction(() => (window.__BUDDY_PERF__?.runs.at(-1)?.chunks.length ?? 0) >= 3 && window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt, null, { timeout: 60_000 });
  await page.screenshot({ path: path.join(outputDir, "multi-chunk-playing.png"), fullPage: true });
  await page.locator("#stop-speaking").click();
  await waitForCompanionState(page, "IDLE", 30_000);
  await page.screenshot({ path: path.join(outputDir, "stopped-idle.png"), fullPage: true });
  await page.locator("#toggle-menu").click();
  await page.locator("#tab-memory-btn").click();
  await page.screenshot({ path: path.join(outputDir, "memory-ui.png"), fullPage: true });
  await page.locator("#toggle-menu").click();
  await page.locator("#replay-reply").click();
  await page.waitForFunction(() => window.__BUDDY_PERF__?.runs.at(-1)?.marks.audioPlayingAt, null, { timeout: 30_000 });
  await page.screenshot({ path: path.join(outputDir, "replay-playing.png"), fullPage: true });
  await page.locator("#stop-speaking").click();
  await waitForCompanionState(page, "IDLE", 30_000);
  await page.screenshot({ path: path.join(outputDir, "final-idle.png"), fullPage: true });
} catch (error) {
  failure = String(error);
  await page.screenshot({ path: path.join(outputDir, "failure.png"), fullPage: true }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  const result = {
    browser: await browser.version(), channel: "chrome", headed: true,
    viewport: { width: 1440, height: 960 }, failure,
    finalState: await page.locator("#state-pill").getAttribute("data-state").catch(() => null),
    finalStateLabel: await page.locator("#state-pill").textContent().catch(() => null),
    canvas: await page.locator("#stage").evaluate((node) => ({ width: node.clientWidth, height: node.clientHeight })).catch(() => null),
    performance: await page.evaluate(() => window.__BUDDY_PERF__).catch(() => null),
    network, consoleMessages, failedRequests
  };
  await writeFile(path.join(outputDir, "final.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ browser: result.browser, headed: true, finalState: result.finalState, failure, networkCount: network.length }, null, 2));
  await context.close();
  await browser.close();
}
