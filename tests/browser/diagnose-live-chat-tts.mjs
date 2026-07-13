import { chromium } from "@playwright/test";
import { seedUiPreferences, waitForAppReady } from "./ui-test-helpers.mjs";

const message = process.argv[2] ?? `Kiểm tra TTS cache miss ${Date.now()}. Hãy trả lời đúng một câu ngắn.`;
const browser = await chromium.launch({
  channel: "chrome",
  headless: false,
  args: ["--autoplay-policy=no-user-gesture-required"]
});
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();
const startedAt = Date.now();
const network = [];
const consoleMessages = [];

await seedUiPreferences(page, { controlsOpen: false, welcomeSeen: true });

page.on("console", (entry) => {
  if (["warning", "error"].includes(entry.type())) {
    consoleMessages.push({ atMs: Date.now() - startedAt, type: entry.type(), text: entry.text().slice(0, 500) });
  }
});
page.on("requestfailed", (request) => {
  if (/\/api\/(chat|tts)/.test(request.url())) {
    network.push({ atMs: Date.now() - startedAt, kind: "failed", url: request.url(), error: request.failure()?.errorText ?? null });
  }
});
page.on("response", (response) => {
  if (/\/api\/(chat|tts)/.test(response.url())) {
    network.push({
      atMs: Date.now() - startedAt,
      kind: "response",
      url: new URL(response.url()).pathname,
      status: response.status(),
      ttsCache: response.headers()["x-tts-cache"] ?? null,
      serverTiming: response.headers()["server-timing"] ?? null
    });
  }
});

let result;
try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await page.locator("#chat-input").fill(message);
  await page.locator("#chat-send").click();

  await page.waitForSelector(".chat-message.is-assistant", { timeout: 90_000 });
  const textVisibleAtMs = Date.now() - startedAt;
  const assistantText = await page.locator(".chat-message.is-assistant").last().textContent();

  await page.waitForFunction(
    () => ["IDLE", "ERROR"].includes(document.querySelector("#state-pill")?.getAttribute("data-state") ?? ""),
    null,
    { timeout: 150_000 }
  );
  result = {
    message,
    textVisibleAtMs,
    assistantText,
    finalState: await page.locator("#state-pill").getAttribute("data-state"),
    finalStateLabel: await page.locator("#state-pill").textContent(),
    finalStatus: await page.locator("#chat-status").textContent(),
    network,
    consoleMessages,
    performance: await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1) ?? null)
  };
} catch (error) {
  result = {
    message,
    error: error instanceof Error ? error.message : String(error),
    finalState: await page.locator("#state-pill").getAttribute("data-state").catch(() => null),
    finalStateLabel: await page.locator("#state-pill").textContent().catch(() => null),
    assistantText: await page.locator(".chat-message.is-assistant").last().textContent().catch(() => null),
    network,
    consoleMessages
  };
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(result, null, 2));
  await context.close();
  await browser.close();
}
