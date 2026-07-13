import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultWebUrl,
  seedUiPreferences,
  setStudioOpen,
  waitForAppReady
} from "./ui-test-helpers.mjs";

const outputDir = path.resolve("test-results/browser/responsive");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const consoleErrors = [];
const consoleWarnings = [];
const results = [];

page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
  if (message.type() === "warning") consoleWarnings.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

await seedUiPreferences(page, { controlsOpen: false, welcomeSeen: true });

try {
  await page.goto(defaultWebUrl, { waitUntil: "domcontentloaded" });
  await waitForAppReady(page);

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    if (viewport.width >= 700 && viewport.width <= 1099) {
      await page.waitForFunction(() => window.getComputedStyle(document.querySelector(".stage-toolbar")).transform === "none", null, {
        timeout: 2_000
      });
    }
    await setStudioOpen(page, false);

    const metrics = await collectMetrics(page);
    assertWithinViewport(viewport.name, "chat", metrics.chat, viewport);
    assertWithinViewport(viewport.name, "app bar", metrics.appBar, viewport);
    assertWithinViewport(viewport.name, "stage toolbar", metrics.stageToolbar, viewport, 2);

    if (metrics.chatHeader.top < metrics.chat.top - 1) {
      throw new Error(`${viewport.name}: chat header is outside the chat panel`);
    }
    if (metrics.chatScrollTop !== 0) {
      throw new Error(`${viewport.name}: chat panel retained root scrolling`);
    }
    if (metrics.bodyScrollHeight > viewport.height + 1 || metrics.bodyScrollWidth > viewport.width + 1) {
      throw new Error(`${viewport.name}: document unexpectedly scrolls`);
    }
    if (metrics.controlsOpen || metrics.controlsAriaHidden !== "true") {
      throw new Error(`${viewport.name}: studio drawer should start closed`);
    }
    if (!metrics.welcomeHidden) {
      throw new Error(`${viewport.name}: returning-user preference did not suppress onboarding`);
    }

    if (viewport.width < 700) {
      const visibleStageHeight = metrics.chat.top - metrics.appBar.bottom;
      if (metrics.chat.top < viewport.height * 0.43) {
        throw new Error(`${viewport.name}: chat must stay in the lower half so the 3D companion remains visible`);
      }
      if (visibleStageHeight < viewport.height * 0.35) {
        throw new Error(`${viewport.name}: less than 35% vertical space remains for the companion`);
      }
      if (metrics.stageToolbar.bottom > metrics.chat.top + 2) {
        throw new Error(`${viewport.name}: stage toolbar overlaps the chat sheet`);
      }
    }

    await setStudioOpen(page, true);
    await page.waitForFunction(({ width, height }) => {
      const box = document.querySelector("#controls")?.getBoundingClientRect();
      return box && box.top >= -2 && box.left >= -2 && box.right <= width + 2 && box.bottom <= height + 2;
    }, { width: viewport.width, height: viewport.height }, { timeout: 3_000 });
    const openPanel = await page.locator("#controls").evaluate((element) => {
      const box = element.getBoundingClientRect();
      const round = (value) => Math.round(value * 10) / 10;
      return {
        top: round(box.top), right: round(box.right), bottom: round(box.bottom),
        left: round(box.left), width: round(box.width), height: round(box.height)
      };
    });
    assertWithinViewport(viewport.name, "open studio drawer", openPanel, viewport, 2);

    for (const tabId of [
      "control-tab-models",
      "control-tab-animations",
      "control-tab-performance",
      "control-tab-backgrounds"
    ]) {
      await page.locator(`#${tabId}`).click();
      if (await page.locator(`#${tabId}`).getAttribute("aria-selected") !== "true") {
        throw new Error(`${viewport.name}/${tabId}: aria-selected was not updated`);
      }
      const panelId = await page.locator(`#${tabId}`).getAttribute("aria-controls");
      if (!panelId || await page.locator(`#${panelId}`).isHidden()) {
        throw new Error(`${viewport.name}/${tabId}: owned tab panel is not visible`);
      }
    }
    await setStudioOpen(page, false);

    if (await page.locator("#collapse-chat").getAttribute("aria-expanded") === "false") {
      await page.locator("#collapse-chat").click();
    }
    await page.waitForFunction(() => document.querySelector("#collapse-chat")?.getAttribute("aria-expanded") === "true");
    const expandedHeight = await page.locator("#chat-panel").evaluate((element) => element.getBoundingClientRect().height);
    await page.locator("#collapse-chat").click();
    if (await page.locator("#collapse-chat").getAttribute("aria-expanded") !== "false") {
      throw new Error(`${viewport.name}: collapse button did not expose collapsed state`);
    }
    const collapsedHeight = await page.locator("#chat-panel").evaluate((element) => element.getBoundingClientRect().height);
    if (collapsedHeight >= expandedHeight) {
      throw new Error(`${viewport.name}: collapsed chat did not become shorter`);
    }
    await page.locator("#collapse-chat").click();

    results.push({ viewport, metrics, openPanel, collapsedHeight });
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
  }
} finally {
  const report = { baseUrl: defaultWebUrl, results, consoleErrors, consoleWarnings };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}

if (consoleErrors.length > 0) {
  throw new Error(`Browser console contained ${consoleErrors.length} warning/error message(s)`);
}

console.log(JSON.stringify({ status: "PASS", viewports: results.length }, null, 2));

async function collectMetrics(pageInstance) {
  return pageInstance.evaluate(() => {
    const round = (value) => Math.round(value * 10) / 10;
    const normalize = (box) => ({
      top: round(box.top), right: round(box.right), bottom: round(box.bottom),
      left: round(box.left), width: round(box.width), height: round(box.height)
    });
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing responsive probe target: ${selector}`);
      return normalize(element.getBoundingClientRect());
    };
    const controls = document.querySelector("#controls");
    return {
      appBar: rect(".app-bar"),
      chat: rect("#chat-panel"),
      chatHeader: rect(".chat-header"),
      controls: rect("#controls"),
      stageToolbar: rect(".stage-toolbar"),
      chatScrollTop: document.querySelector("#chat-panel").scrollTop,
      bodyScrollHeight: document.documentElement.scrollHeight,
      bodyScrollWidth: document.documentElement.scrollWidth,
      controlsOpen: controls.classList.contains("is-open"),
      controlsAriaHidden: controls.getAttribute("aria-hidden"),
      welcomeHidden: document.querySelector("#welcome-card").hidden
    };
  });
}

function assertWithinViewport(viewportName, label, rect, viewport, tolerance = 1) {
  if (
    rect.top < -tolerance || rect.left < -tolerance
    || rect.right > viewport.width + tolerance || rect.bottom > viewport.height + tolerance
  ) {
    throw new Error(`${viewportName}: ${label} is outside viewport (${JSON.stringify(rect)})`);
  }
}
