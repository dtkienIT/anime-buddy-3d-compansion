import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  seedUiPreferences,
  setVoiceEnabled,
  waitForAppReady,
  waitForCompanionState
} from "./ui-test-helpers.mjs";

const outputDir = path.resolve("test-results/browser/memory");
const baseUrl = "http://127.0.0.1:3001";
const apiBaseUrl = "http://127.0.0.1:3002";
const anonymousId = `memory-e2e-${Date.now()}`;
const characterId = "mika";
const userDataDir = path.join(outputDir, `profile-${anonymousId}`);
const outputName = process.argv[2] ?? "memory-e2e.json";
const checkpointPath = path.join(outputDir, outputName.replace(/\.json$/i, "-checkpoint.json"));
await mkdir(outputDir, { recursive: true });

const consoleMessages = [];
const network = [];
const progress = [];
const scenarios = [];

function mark(step, detail = {}) {
  const entry = { step, at: new Date().toISOString(), ...detail };
  progress.push(entry);
  try {
    writeFileSync(checkpointPath, JSON.stringify({
      status: "running",
      anonymousId: shortenId(anonymousId),
      progress,
      scenarios,
      network,
      consoleMessages
    }, null, 2));
  } catch {
    // Best-effort probe artifact; keep the browser flow moving.
  }
  console.log(JSON.stringify({ progress: entry }));
}

function attachPageObservers(page) {
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      consoleMessages.push({ type: message.type(), text: message.text().slice(0, 500) });
    }
  });
  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("/api/chat") || url.includes("/api/memories") || url.includes("/api/sessions") || url.includes("/api/conversations")) {
      network.push({
        url: new URL(url).pathname,
        status: response.status(),
        serverTiming: response.headers()["server-timing"] ?? null
      });
    }
  });
}

async function requestJson(pathname, init = {}, timeoutMs = 15_000) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs)
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 500) };
  }
  return { status: response.status, body };
}

async function getMemoryEnabledState() {
  const result = await requestJson(`/api/memories/toggle?anonymousId=${encodeURIComponent(anonymousId)}`);
  return result.status === 200 ? Boolean(result.body?.enabled) : null;
}

async function getActiveMemories() {
  const result = await requestJson(`/api/memories?anonymousId=${encodeURIComponent(anonymousId)}&characterId=${encodeURIComponent(characterId)}`);
  if (result.status !== 200) {
    throw new Error(`Failed to load memories: ${result.status}`);
  }
  return result.body.memories ?? [];
}

async function waitForMemory(predicate, timeoutMs = 90_000) {
  const startedAt = Date.now();
  let latest = [];
  while (Date.now() - startedAt < timeoutMs) {
    latest = await getActiveMemories();
    if (predicate(latest)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(`Timed out waiting for memory condition. Latest count=${latest.length}`);
}

async function runStep(step, fn, expectedResult = null) {
  mark(`${step}:start`);
  const startedAt = performance.now();
  const networkStart = network.length;
  try {
    const value = await fn();
    const durationMs = Math.round(performance.now() - startedAt);
    await recordScenario(step, {
      durationMs,
      requestEvents: network.slice(networkStart),
      expectedResult,
      actualResult: sanitizeResult(value)
    });
    mark(`${step}:done`, { durationMs });
    return value;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    await recordScenario(step, {
      durationMs,
      requestEvents: network.slice(networkStart),
      expectedResult,
      actualResult: null,
      error: error instanceof Error ? error.message : String(error)
    });
    mark(`${step}:failed`, {
      durationMs,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function openContext() {
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    viewport: { width: 1440, height: 960 },
    args: ["--autoplay-policy=no-user-gesture-required"]
  });
  await context.addInitScript((id) => {
    localStorage.setItem("animeBuddy.anonymousId", id);
  }, anonymousId);
  const page = await context.newPage();
  await seedUiPreferences(page, { controlsOpen: false, welcomeSeen: true });
  attachPageObservers(page);
  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await page.waitForSelector("#chat-input", { timeout: 30_000 });
  await disableVoice(page);
  return { context, page };
}

async function disableVoice(page) {
  await setVoiceEnabled(page, false);
}

async function waitIdle(page, timeout = 120_000) {
  await waitForCompanionState(page, "IDLE", timeout);
}

async function sendChat(page, message) {
  const previousAssistantCount = await page.locator("#chat-log .chat-message.is-assistant").count();
  await page.locator("#chat-input").fill(message);
  await page.locator("#chat-send").click();
  await page.waitForFunction(
    (count) => document.querySelectorAll("#chat-log .chat-message.is-assistant").length > count,
    previousAssistantCount,
    { timeout: 120_000 }
  );
  await waitIdle(page);
  return page.locator("#chat-log .chat-message.is-assistant").last().textContent();
}

async function setMenuOpen(page, open) {
  const visible = await page.locator("#chat-menu").evaluate((node) => {
    const view = node.ownerDocument.defaultView;
    return view ? view.getComputedStyle(node).display !== "none" : false;
  });
  if (visible !== open) {
    await page.locator("#toggle-menu").click();
  }
}

async function createNewChat(page) {
  await setMenuOpen(page, true);
  await page.locator("#new-session-btn").click();
  await page.waitForFunction(() => document.querySelectorAll("#chat-log .chat-message").length === 0, null, { timeout: 30_000 });
  await setMenuOpen(page, false);
}

async function setMemoryEnabled(page, enabled) {
  await setMenuOpen(page, true);
  await page.locator("#tab-memory-btn").click();
  const checkbox = page.locator("#toggle-memory-checkbox");
  await page.waitForFunction(() => !document.querySelector("#toggle-memory-checkbox")?.disabled, null, {
    timeout: 30_000
  });
  const checked = await checkbox.isChecked();
  if (checked !== enabled) {
    await checkbox.click();
  }
  await setMenuOpen(page, false);
}

function hasMemory(memories, key, expectedContent) {
  return memories.some((memory) => {
    const keyMatches = memory.normalized_key === key;
    const content = String(memory.content ?? "").toLowerCase();
    return keyMatches && (!expectedContent || content.includes(expectedContent));
  });
}

function summarizeMemories(memories) {
  return memories.map((memory) => ({
    id: shortenId(memory.id),
    kind: memory.kind,
    normalizedKey: memory.normalized_key,
    status: memory.status,
    content: String(memory.content ?? "").slice(0, 240)
  }));
}

function summarizeMemoryStatus(memories) {
  const statusCounts = { active: 0, superseded: 0, deleted: 0, other: 0 };
  for (const memory of memories) {
    if (memory.status === "active") statusCounts.active += 1;
    else if (memory.status === "superseded") statusCounts.superseded += 1;
    else if (memory.status === "deleted") statusCounts.deleted += 1;
    else statusCounts.other += 1;
  }
  return statusCounts;
}

function summarizeRequests(events) {
  return events.map((event) => ({
    url: event.url,
    status: event.status,
    serverTiming: event.serverTiming
  }));
}

async function recordScenario(scenario, details) {
  let activeMemories = null;
  let memoryEnabledState = null;
  let sessionId = null;
  try {
    activeMemories = await getActiveMemories();
  } catch {
    activeMemories = null;
  }
  try {
    memoryEnabledState = await getMemoryEnabledState();
  } catch {
    memoryEnabledState = null;
  }
  if (page) {
    try {
      sessionId = await page.evaluate(() => localStorage.getItem("animeBuddy.sessionId"));
    } catch {
      sessionId = null;
    }
  }

  scenarios.push({
    scenario,
    sessionId: shortenId(sessionId),
    requestStatus: summarizeRequests(details.requestEvents),
    expectedResult: details.expectedResult,
    actualResult: details.actualResult,
    memoryRecordsCount: activeMemories?.length ?? null,
    memoryStatus: activeMemories ? summarizeMemoryStatus(activeMemories) : null,
    activeMemories: activeMemories ? summarizeMemories(activeMemories) : null,
    memoryEnabledState,
    serverTiming: details.requestEvents.map((event) => event.serverTiming).filter(Boolean),
    durationMs: details.durationMs,
    error: details.error ?? null
  });
}

function sanitizeResult(value) {
  if (typeof value === "string") {
    return value.slice(0, 500);
  }
  if (Array.isArray(value)) {
    return summarizeMemories(value);
  }
  if (value && typeof value === "object") {
    if ("context" in value && "page" in value) {
      return { opened: true };
    }
    if ("status" in value && "body" in value) {
      return {
        status: value.status,
        body: sanitizePlainObject(value.body)
      };
    }
    return sanitizePlainObject(value);
  }
  return value ?? null;
}

function sanitizePlainObject(value) {
  if (!value || typeof value !== "object") {
    return value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|authorization|api[-_]?key/i.test(key)) {
      result[key] = "[redacted]";
    } else if (typeof item === "string") {
      result[key] = key.toLowerCase().includes("id") ? shortenId(item) : item.slice(0, 500);
    } else if (Array.isArray(item)) {
      result[key] = item.slice(0, 20).map((entry) => sanitizePlainObject(entry));
    } else if (item && typeof item === "object") {
      result[key] = sanitizePlainObject(item);
    } else {
      result[key] = item;
    }
  }
  return result;
}

function shortenId(value) {
  if (!value || typeof value !== "string") return null;
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

let context;
let page;

try {
  await runStep("enable-memory", () => requestJson("/api/memories/toggle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousId, enabled: true })
  }), { memoryEnabled: true });

  ({ context, page } = await runStep("open-context", () => openContext()));
  await runStep("create-initial-chat", () => createNewChat(page));

  const nameReply = await runStep("send-name", () => sendChat(page, "Tên mình là Nam. Hãy nhớ tên mình."));
  const colorReply = await runStep("send-color", () => sendChat(page, "Màu yêu thích của mình là màu xanh dương (blue). Hãy nhớ điều này."));

  const initialMemories = await runStep("wait-initial-memories", () => waitForMemory((memories) => (
    hasMemory(memories, "userName", "nam") &&
    hasMemory(memories, "favoriteColor", "blue")
  )));

  await runStep("refresh-history", async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForAppReady(page);
    await disableVoice(page);
    await page.waitForFunction(() => document.querySelectorAll("#chat-log .chat-message").length >= 4, null, { timeout: 60_000 });
  });
  const restoredCount = await page.locator("#chat-log .chat-message").count();

  const recallReply = await runStep("refresh-recall", () => sendChat(page, "Tên mình là gì và mình thích màu gì?"));
  const recallOk = /nam/i.test(recallReply ?? "") && /xanh|blue/i.test(recallReply ?? "");

  await runStep("browser-restart", async () => {
    await context.close();
    ({ context, page } = await openContext());
    await page.waitForFunction(() => document.querySelectorAll("#chat-log .chat-message").length >= 6, null, { timeout: 60_000 });
  });
  const browserRestartCount = await page.locator("#chat-log .chat-message").count();

  await runStep("new-chat", () => createNewChat(page));
  const newChatRecall = await runStep("new-chat-recall", () => sendChat(page, "Bạn còn nhớ tên và màu yêu thích của mình không?"));
  const newChatRecallOk = /nam/i.test(newChatRecall ?? "") && /xanh|blue/i.test(newChatRecall ?? "");

  await runStep("send-contradiction", () => sendChat(page, "Màu yêu thích của mình đổi thành màu đỏ."));
  const redMemories = await runStep("wait-red-memory", () => waitForMemory((memories) => (
    hasMemory(memories, "favoriteColor", "red") &&
    !hasMemory(memories, "favoriteColor", "blue")
  ), 120_000));
  const redRecall = await runStep("red-recall", () => sendChat(page, "Bây giờ mình thích màu gì?"));
  const redRecallOk = /đỏ|do|red/i.test(redRecall ?? "");

  await runStep("send-forget", () => sendChat(page, "Hãy quên màu yêu thích/favoriteColor của mình."));
  const afterForgetMemories = await runStep("wait-forget-memory", () => waitForMemory((memories) => !hasMemory(memories, "favoriteColor"), 120_000));
  await runStep("new-chat-after-forget", () => createNewChat(page));
  const forgetRecall = await runStep("forget-recall", () => sendChat(page, "Mình thích màu gì?"));
  const forgetOk = !/xanh|blue|đỏ|do|red/i.test(forgetRecall ?? "");

  await runStep("disable-memory", () => setMemoryEnabled(page, false));
  await runStep("send-disabled-fact", () => sendChat(page, "Mình thích chơi đàn guitar."));
  await new Promise((resolve) => setTimeout(resolve, 10_000));
  const afterDisabledMemories = await getActiveMemories();
  const disabledOk = !hasMemory(afterDisabledMemories, "favoriteInstrument", "guitar") &&
    !afterDisabledMemories.some((memory) => String(memory.content ?? "").toLowerCase().includes("guitar"));
  const finalUserNameOk = hasMemory(afterDisabledMemories, "userName", "nam");
  const finalFavoriteColorDeleted = !hasMemory(afterDisabledMemories, "favoriteColor");

  await runStep("confirm-disabled-memory-state", async () => ({
    guitarNotStored: disabledOk,
    userNameRemains: finalUserNameOk,
    favoriteColorDeleted: finalFavoriteColorDeleted
  }), {
    guitarNotStored: true,
    userNameRemains: true,
    favoriteColorDeleted: true
  });

  await runStep("re-enable-memory", () => setMemoryEnabled(page, true), { memoryEnabled: true });
  const finalMemoryEnabled = await getMemoryEnabledState();

  await page.screenshot({ path: path.join(outputDir, "memory-e2e-final.png"), fullPage: true });

  const result = {
    browser: await context.browser()?.version(),
    anonymousId: shortenId(anonymousId),
    sessionId: shortenId(await page.evaluate(() => localStorage.getItem("animeBuddy.sessionId")).catch(() => null)),
    nameReply,
    colorReply,
    restoredCount,
    browserRestartCount,
    recallReply,
    recallOk,
    newChatRecall,
    newChatRecallOk,
    redRecall,
    redRecallOk,
    forgetRecall,
    forgetOk,
    disabledOk,
    finalUserNameOk,
    finalFavoriteColorDeleted,
    finalMemoryEnabled,
    memories: {
      initial: summarizeMemories(initialMemories),
      afterRed: summarizeMemories(redMemories),
      afterForget: summarizeMemories(afterForgetMemories),
      afterDisabled: summarizeMemories(afterDisabledMemories)
    },
    scenarios,
    progress,
    network,
    consoleMessages
  };
  const failedExpectations = [];
  if (!recallOk) failedExpectations.push("refresh recall did not mention Nam and blue");
  if (!newChatRecallOk) failedExpectations.push("new chat recall did not mention Nam and blue");
  if (!redRecallOk) failedExpectations.push("red recall did not mention red");
  if (!forgetOk) failedExpectations.push("forgotten color was recalled");
  if (!disabledOk) failedExpectations.push("guitar fact was stored while memory was disabled");
  if (!finalUserNameOk) failedExpectations.push("userName did not remain active");
  if (!finalFavoriteColorDeleted) failedExpectations.push("favoriteColor remained active after forget");
  if (finalMemoryEnabled !== true) failedExpectations.push("memory was not re-enabled at the end");
  result.failedExpectations = failedExpectations;

  await writeFile(path.join(outputDir, outputName), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  if (failedExpectations.length > 0) {
    throw new Error(`Memory E2E expectations failed: ${failedExpectations.join("; ")}`);
  }
} catch (error) {
  const diagnostics = page ? await page.evaluate(() => ({
    state: document.querySelector("#state-pill")?.getAttribute("data-state") ?? null,
    stateLabel: document.querySelector("#state-pill")?.textContent ?? null,
    chatStatus: document.querySelector("#chat-status")?.textContent ?? null,
    messages: Array.from(document.querySelectorAll("#chat-log .chat-message")).map((node) => ({
      className: node.className,
      text: node.textContent?.slice(0, 200)
    }))
  })).catch((diagnosticError) => ({ diagnosticError: String(diagnosticError) })) : null;

  if (page) {
    await page.screenshot({ path: path.join(outputDir, "memory-e2e-failure.png"), fullPage: true }).catch(() => undefined);
  }

  await writeFile(path.join(outputDir, "memory-e2e-failure.json"), JSON.stringify({
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) },
    diagnostics,
    progress,
    scenarios,
    network,
    consoleMessages
  }, null, 2)).catch(() => undefined);
  console.error(error);
  throw error;
} finally {
  await context?.close().catch(() => undefined);
}
