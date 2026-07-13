import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultWebUrl,
  seedUiPreferences,
  setStudioOpen,
  setVoiceEnabled,
  uiPreferencesKey,
  waitForAppReady
} from "./ui-test-helpers.mjs";

const outputDir = path.resolve("test-results/browser/experience");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
const page = await context.newPage();
const consoleErrors = [];
const checks = [];

page.on("pageerror", (error) => consoleErrors.push({ type: "pageerror", text: error.message }));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push({ type: "console", text: message.text() });
});

await seedUiPreferences(page, { controlsOpen: false, reducedMotion: false, welcomeSeen: false });

try {
  await page.goto(defaultWebUrl, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);
  await setVoiceEnabled(page, false);

  await check("onboarding is dismissible and remembered", async () => {
    const welcome = page.locator("#welcome-card");
    if (await welcome.isHidden()) throw new Error("first-visit onboarding was not shown");
    await page.locator("#welcome-explore").click();
    await welcome.waitFor({ state: "hidden" });
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), uiPreferencesKey);
    if (stored.welcomeSeen !== true) throw new Error("onboarding dismissal was not persisted");
  });

  await check("help dialog exposes modal state and Escape close", async () => {
    await page.locator("#help-toggle").click();
    await page.locator("#help-dialog").waitFor({ state: "visible" });
    if (await page.locator("#help-toggle").getAttribute("aria-expanded") !== "true") {
      throw new Error("help trigger aria-expanded was not set");
    }
    await page.keyboard.press("f");
    await page.keyboard.press("c");
    await page.keyboard.press("/");
    const modalOwnership = await page.evaluate(() => ({
      focusMode: document.body.classList.contains("is-focus-mode"),
      studioExpanded: document.querySelector("#studio-toggle")?.getAttribute("aria-expanded"),
      activeId: document.activeElement?.id
    }));
    if (modalOwnership.focusMode || modalOwnership.studioExpanded !== "false" || modalOwnership.activeId !== "help-close") {
      throw new Error("background shortcuts escaped the open help modal");
    }
    await page.keyboard.press("Escape");
    await page.locator("#help-dialog").waitFor({ state: "hidden" });
    if (await page.locator("#help-toggle").getAttribute("aria-expanded") !== "false") {
      throw new Error("help trigger aria-expanded was not reset");
    }
  });

  await check("keyboard shortcuts focus chat, open studio and toggle focus mode", async () => {
    await page.keyboard.press("/");
    if (await page.evaluate(() => document.activeElement?.id) !== "chat-input") {
      throw new Error("/ shortcut did not focus the composer");
    }
    await page.locator("#stage").click({ position: { x: 20, y: 20 } });
    await page.keyboard.press("c");
    await page.waitForFunction(() => document.querySelector("#studio-toggle")?.getAttribute("aria-expanded") === "true");
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector("#studio-toggle")?.getAttribute("aria-expanded") === "false");
    await page.keyboard.press("f");
    if (!await page.locator("body").evaluate((body) => body.classList.contains("is-focus-mode"))) {
      throw new Error("F shortcut did not enable focus mode");
    }
    if (await page.locator("#focus-toggle").getAttribute("aria-pressed") !== "true") {
      throw new Error("focus trigger aria-pressed was not set");
    }
    await page.keyboard.press("f");
  });

  await check("direct canvas tap reaches the companion without raycast errors", async () => {
    await page.mouse.click(640, 300);
    await page.waitForFunction(() => (
      document.querySelector("#state-pill")?.getAttribute("data-state") === "REACTING"
      && document.querySelector("#stage-dialogue")?.hidden === false
    ), null, { timeout: 5_000 });
    await page.waitForFunction(() => (
      document.querySelector("#state-pill")?.getAttribute("data-state") === "IDLE"
    ), null, { timeout: 10_000 });
  });

  await check("experience setting applies and persists reduced motion", async () => {
    await page.locator("#toggle-menu").click();
    await page.locator("#tab-experience-btn").click();
    const checkbox = page.locator("#reduced-motion-checkbox");
    await checkbox.check();
    if (!await page.locator("body").evaluate((body) => body.classList.contains("is-reduced-motion"))) {
      throw new Error("reduced-motion class was not applied");
    }
    const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "{}"), uiPreferencesKey);
    if (stored.reducedMotion !== true) throw new Error("reduced-motion preference was not persisted");
    await checkbox.uncheck();
    await page.locator("#toggle-menu").click();
  });

  await check("performance overlay always offers a visible stop path", async () => {
    await setStudioOpen(page, true);
    await page.locator("#control-tab-performance").click();
    const start = page.locator("#bling-performance");
    await page.waitForFunction(() => !document.querySelector("#bling-performance")?.disabled, null, {
      timeout: 30_000
    });
    await start.click();
    await page.waitForFunction(() => (
      document.body.classList.contains("is-performing")
      && !document.querySelector("#performance-live")?.hidden
    ), null, { timeout: 15_000 });
    await page.locator("#stop-performance-live").click();
    await page.waitForFunction(() => (
      !document.body.classList.contains("is-performing")
      && document.querySelector("#performance-live")?.hidden === true
      && document.querySelector("#state-pill")?.getAttribute("data-state") === "IDLE"
    ), null, { timeout: 15_000 });
  });

  await check("stage actions remain keyboard-accessible", async () => {
    for (const selector of ["#camera-zoom-out", "#camera-reset", "#camera-zoom-in", "#stage-wave"]) {
      const button = page.locator(selector);
      await button.focus();
      await page.keyboard.press("Enter");
    }
    if (await page.locator("#stage-wave").getAttribute("type") !== "button") {
      throw new Error("stage wave action can submit an unrelated form");
    }
  });

  await check("studio drawer supports explicit open and close", async () => {
    await setStudioOpen(page, true);
    await setStudioOpen(page, false);
  });

  await page.screenshot({ path: path.join(outputDir, "final.png") });
} catch (error) {
  await page.screenshot({ path: path.join(outputDir, "failure.png") }).catch(() => undefined);
  checks.push({ name: "probe", status: "FAIL", error: String(error) });
  process.exitCode = 1;
} finally {
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl: defaultWebUrl,
    checks,
    consoleErrors,
    finalUiPreferences: await page.evaluate((key) => localStorage.getItem(key), uiPreferencesKey).catch(() => null)
  };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks, consoleErrors: consoleErrors.length }, null, 2));
  await context.close();
  await browser.close();
}

if (checks.some((item) => item.status === "FAIL") || consoleErrors.length > 0) {
  process.exitCode = 1;
}

async function check(name, action) {
  const startedAt = performance.now();
  try {
    await action();
    checks.push({ name, status: "PASS", durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    checks.push({
      name,
      status: "FAIL",
      durationMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
