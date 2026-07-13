import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedUiPreferences, waitForAppReady } from "./ui-test-helpers.mjs";

const mockTts = process.argv.includes("--mock-tts");
const marker = process.argv.slice(2).find((value) => value !== "--mock-tts")?.trim();
const baseReply = "Anh yêu ơi, em kể cho anh nghe chuyện vui nè! Có một chú mèo con tên Tí rất thông minh nhưng lại thích trêu chọc con chó lười biếng. Mỗi lần chú chó định ngủ, Tí lại nhảy lên đầu nó, vờ như đang dạy nó học chữ. Chú chó bực mình nhưng không nỡ đuổi Tí đi. Một hôm, Tí nhặt được một mẩu xúc xích và giả vờ không biết. Chú chó nhìn thấy liền chạy đến, nhưng Tí chỉ đưa xúc xích khi chú chó chịu nghe lời. Kết quả là hai đứa trở thành bạn thân từ đó! 😄 Anh thấy có vui không ạ?";
const reply = marker
  ? baseReply
    .replace("chuyện vui nè!", `chuyện vui nè! ${marker}.`)
    .replace("Anh thấy có vui", `${marker}. Anh thấy có vui`)
  : baseReply;
const outputDir = path.resolve("test-results/browser/audio-prefetch");
const outputPath = path.join(outputDir, mockTts ? "long-vietnamese-mocked-miss.json" : "long-vietnamese-final.json");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--autoplay-policy=no-user-gesture-required",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--disable-gpu-sandbox"
  ]
});
const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
const page = await context.newPage();
const network = [];
const consoleMessages = [];
const heartbeat = globalThis.setInterval(() => {
  console.log(JSON.stringify({ progress: "waiting", ttsResponses: network.length, elapsedMs: Date.now() - startedAt }));
}, 10_000);
const startedAt = Date.now();

await seedUiPreferences(page, { controlsOpen: false, welcomeSeen: true });

await page.addInitScript(() => {
  const timers = new Map();
  let nextId = 1;
  window.requestAnimationFrame = (callback) => {
    const id = nextId++;
    const timer = setTimeout(() => {
      timers.delete(id);
      callback(performance.now());
    }, 1000);
    timers.set(id, timer);
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
  };
});

page.on("console", (entry) => {
  if (["warning", "error"].includes(entry.type())) {
    consoleMessages.push({ type: entry.type(), text: entry.text().slice(0, 500) });
  }
});
page.on("response", (response) => {
  if (response.url().includes("/api/tts")) {
    network.push({
      status: response.status(),
      cache: response.headers()["x-tts-cache"] ?? null,
      requestId: response.headers()["x-tts-request-id"] ?? null,
      serverTiming: response.headers()["server-timing"] ?? null
    });
  }
});
await page.route("**/api/chat", (route) => route.fulfill({
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
}));
if (mockTts) {
  const wav = await readFile(path.resolve("test-results/audio-quality/final/medium-vietnamese.wav"));
  await page.route("**/api/tts", async (route) => {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2500));
    await route.fulfill({
      status: 200,
      contentType: "audio/wav",
      headers: {
        "X-TTS-Cache": "MISS",
        "X-TTS-Request-Id": `mock-${Date.now()}`,
        "Server-Timing": "tts-synthesis;dur=2500"
      },
      body: wav
    });
  });
}

let result;
try {
  console.log(JSON.stringify({ progress: "opening" }));
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  console.log(JSON.stringify({ progress: "ready" }));
  await page.locator("#chat-input").fill("Kể cho anh chuyện chú mèo Tí nhé");
  await page.locator("#chat-send").click();
  await page.waitForSelector(".chat-message.is-assistant", { timeout: 30_000 });
  console.log(JSON.stringify({ progress: "reply-visible" }));
  await page.waitForFunction(
    () => {
      const chunks = window.__BUDDY_PERF__?.runs.at(-1)?.chunks ?? [];
      return chunks.length >= 2 && chunks.every((chunk) => chunk.scheduledStartTime !== undefined);
    },
    null,
    { timeout: 300_000 }
  );

  const run = await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1) ?? null);
  const gaps = (run?.chunks ?? []).slice(1).map((chunk) => chunk.gapBeforeNextChunkMs ?? null);
  result = {
    passed: network.length >= 2
      && network.every((entry) => entry.status === 200)
      && gaps.every((gap) => gap !== null && gap <= 25),
    replyLength: reply.length,
    stateAfterScheduling: await page.locator("#state-pill").getAttribute("data-state"),
    stateLabelAfterScheduling: await page.locator("#state-pill").textContent(),
    network,
    consoleMessages,
    chunkCount: run?.chunks.length ?? 0,
    scheduledGapsMs: gaps,
    performance: run
  };
  result.finalState = result.stateAfterScheduling;
  if (!result.passed) process.exitCode = 1;
} catch (error) {
  result = {
    passed: false,
    error: error instanceof Error ? error.message : String(error),
    finalState: await page.locator("#state-pill").getAttribute("data-state").catch(() => null),
    finalStateLabel: await page.locator("#state-pill").textContent().catch(() => null),
    network,
    consoleMessages,
    performance: await page.evaluate(() => window.__BUDDY_PERF__?.runs.at(-1) ?? null).catch(() => null)
  };
  process.exitCode = 1;
} finally {
  globalThis.clearInterval(heartbeat);
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({
    passed: result.passed,
    finalState: result.finalState,
    chunkCount: result.chunkCount,
    scheduledGapsMs: result.scheduledGapsMs,
    network: result.network,
    outputPath
  }, null, 2));
  await context.close();
  await browser.close();
}
