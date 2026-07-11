import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDir = path.resolve("test-results/browser/responsive");
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
const consoleErrors = [];
const results = [];

page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) consoleErrors.push(message.text());
});
page.on("pageerror", (error) => consoleErrors.push(error.message));

try {
  await page.goto("http://127.0.0.1:3001", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), null, { timeout: 60_000 });

  for (const viewport of [
    { name: "mobile", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    const metrics = await page.evaluate(() => {
      const rect = (selector) => {
        const element = document.querySelector(selector);
        const box = element.getBoundingClientRect();
        return { top: box.top, right: box.right, bottom: box.bottom, left: box.left, width: box.width, height: box.height };
      };
      return {
        chat: rect("#chat-panel"),
        chatHeader: rect(".chat-header"),
        controls: rect("#controls"),
        chatScrollTop: document.querySelector("#chat-panel").scrollTop,
        bodyScrollHeight: document.body.scrollHeight,
        viewportHeight: window.innerHeight
      };
    });

    if (metrics.chatHeader.top < 0) throw new Error(`${viewport.name}: chat header is outside viewport`);
    if (metrics.chatScrollTop !== 0) throw new Error(`${viewport.name}: chat panel retained root scrolling`);
    if (metrics.bodyScrollHeight > metrics.viewportHeight) throw new Error(`${viewport.name}: body unexpectedly scrolls`);
    if (viewport.width <= 840 && metrics.controls.top - metrics.chat.bottom < viewport.height * 0.3) {
      throw new Error(`${viewport.name}: 3D stage gap is smaller than 30% of the viewport`);
    }

    results.push({ viewport, metrics });
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
  }

  for (const tabId of ["control-tab-models", "control-tab-animations", "control-tab-backgrounds"]) {
    await page.locator(`#${tabId}`).click();
    if (await page.locator(`#${tabId}`).getAttribute("aria-selected") !== "true") {
      throw new Error(`${tabId}: aria-selected was not updated`);
    }
  }

  await page.locator("#collapse-chat").click();
  if (await page.locator("#collapse-chat").getAttribute("aria-expanded") !== "false") {
    throw new Error("collapse button did not expose collapsed state");
  }
  await page.locator("#collapse-chat").click();
} finally {
  const report = { results, consoleErrors };
  await writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  await context.close();
  await browser.close();
}

if (consoleErrors.length > 0) {
  throw new Error(`Browser console contained ${consoleErrors.length} warning/error message(s)`);
}

console.log(JSON.stringify({ status: "PASS", viewports: results.length }, null, 2));
