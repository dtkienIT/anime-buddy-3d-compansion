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
let resizeTransition = null;

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
    { name: "small-mobile", width: 320, height: 568 },
    { name: "mobile", width: 390, height: 844 },
    { name: "mobile-landscape", width: 667, height: 375 },
    { name: "breakpoint-700", width: 700, height: 900 },
    { name: "breakpoint-754", width: 754, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "short-tablet-landscape", width: 844, height: 390 },
    { name: "tablet-landscape", width: 1024, height: 768 },
    { name: "desktop", width: 1440, height: 900 }
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(250);
    if (viewport.width >= 760 && viewport.width <= 1099) {
      await page.waitForFunction(() => window.getComputedStyle(document.querySelector(".stage-toolbar")).transform === "none", null, {
        timeout: 2_000
      });
    }
    await setStudioOpen(page, false);
    await setChatExpanded(page, true);

    const metrics = await collectMetrics(page);
    assertWithinViewport(viewport.name, "chat", metrics.chat, viewport);
    assertWithinViewport(viewport.name, "app bar", metrics.appBar, viewport);
    assertWithinViewport(viewport.name, "stage toolbar", metrics.stageToolbar, viewport, 2);

    if (metrics.chatHeader.top < metrics.chat.top - 1) {
      throw new Error(`${viewport.name}: chat header is outside the chat panel`);
    }
    if (metrics.chatContent.height < 1) {
      throw new Error(`${viewport.name}: chat content collapsed to ${metrics.chatContent.height}px`);
    }
    assertContained(viewport.name, "chat form", metrics.chatForm, metrics.chat, 1.5);
    if (rectanglesOverlap(metrics.chat, metrics.stageToolbar, 1)) {
      throw new Error(`${viewport.name}: stage toolbar overlaps the expanded chat panel`);
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

    if (viewport.width < 760) {
      const visibleStageHeight = metrics.chat.top - metrics.appBar.bottom;
      if (viewport.height >= viewport.width) {
        if (metrics.chat.top < viewport.height * 0.43) {
          throw new Error(`${viewport.name}: chat must stay in the lower half so the 3D companion remains visible`);
        }
        if (visibleStageHeight < viewport.height * 0.35) {
          throw new Error(`${viewport.name}: less than 35% vertical space remains for the companion`);
        }
      } else if (visibleStageHeight < Math.max(64, viewport.height * 0.18)) {
        throw new Error(`${viewport.name}: landscape layout leaves no usable companion area above chat`);
      }
      if (metrics.stageToolbar.bottom > metrics.chat.top + 2) {
        throw new Error(`${viewport.name}: stage toolbar overlaps the chat sheet`);
      }
      if (Number.parseFloat(metrics.chatInputFontSize) < 16) {
        throw new Error(`${viewport.name}: mobile chat input must remain at least 16px`);
      }
      for (const target of metrics.touchTargets) {
        if (target.width < 44 || target.height < 44) {
          throw new Error(`${viewport.name}: ${target.selector} touch target is ${target.width}x${target.height}`);
        }
      }
    }

    await setStudioOpen(page, true);
    await page.waitForFunction(({ width, height }) => {
      const box = document.querySelector("#controls")?.getBoundingClientRect();
      return box && box.top >= -2 && box.left >= -2 && box.right <= width + 2 && box.bottom <= height + 2;
    }, { width: viewport.width, height: viewport.height }, { timeout: 3_000 });
    const openState = await page.locator("#controls").evaluate((element) => {
      const round = (value) => Math.round(value * 10) / 10;
      const normalize = (box) => ({
        top: round(box.top), right: round(box.right), bottom: round(box.bottom),
        left: round(box.left), width: round(box.width), height: round(box.height)
      });
      return {
        controls: normalize(element.getBoundingClientRect()),
        chat: normalize(document.querySelector("#chat-panel").getBoundingClientRect()),
        chatCollapsed: document.querySelector("#chat-panel").classList.contains("is-collapsed")
      };
    });
    const openPanel = openState.controls;
    assertWithinViewport(viewport.name, "open studio drawer", openPanel, viewport, 2);
    if (viewport.width < 760) {
      if (!openState.chatCollapsed) {
        throw new Error(`${viewport.name}: opening Studio must collapse chat below the 760px breakpoint`);
      }
    } else if (rectanglesOverlap(openState.controls, openState.chat, 1)) {
      throw new Error(`${viewport.name}: Studio drawer overlaps expanded chat`);
    }

    for (const tabId of [
      "control-tab-models",
      "control-tab-animations",
      "control-tab-performance",
      "control-tab-backgrounds"
    ]) {
      await page.locator(`#${tabId}`).click();
      await page.waitForFunction(
        (id) => document.querySelector(`#${id}`)?.getAttribute("aria-selected") === "true",
        tabId,
        { timeout: 2_000 }
      );
      const panelId = await page.locator(`#${tabId}`).getAttribute("aria-controls");
      if (!panelId || await page.locator(`#${panelId}`).isHidden()) {
        throw new Error(`${viewport.name}/${tabId}: owned tab panel is not visible`);
      }
    }
    await setStudioOpen(page, false);
    if (await page.locator("#collapse-chat").getAttribute("aria-expanded") !== "true") {
      throw new Error(`${viewport.name}: closing Studio did not restore the previously expanded chat`);
    }

    await setChatExpanded(page, true);
    const expandedHeight = await page.locator("#chat-panel").evaluate((element) => element.getBoundingClientRect().height);
    await page.locator("#collapse-chat").click();
    if (await page.locator("#collapse-chat").getAttribute("aria-expanded") !== "false") {
      throw new Error(`${viewport.name}: collapse button did not expose collapsed state`);
    }
    await page.waitForFunction(
      (previousHeight) => document.querySelector("#chat-panel")?.getBoundingClientRect().height < previousHeight - 1,
      expandedHeight
    );
    const collapsedHeight = await page.locator("#chat-panel").evaluate((element) => element.getBoundingClientRect().height);
    if (collapsedHeight >= expandedHeight) {
      throw new Error(`${viewport.name}: collapsed chat did not become shorter`);
    }
    await page.locator("#collapse-chat").click();

    results.push({ viewport, metrics, openState, collapsedHeight });
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await setStudioOpen(page, false);
  await setChatExpanded(page, true);
  await setStudioOpen(page, true);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => document.querySelector("#chat-panel")?.classList.contains("is-collapsed"));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => !document.querySelector("#chat-panel")?.classList.contains("is-collapsed"));
  resizeTransition = { desktopToCompactCollapsed: true, compactToDesktopRestored: true };
  await setStudioOpen(page, false);
} finally {
  const report = { baseUrl: defaultWebUrl, results, resizeTransition, consoleErrors, consoleWarnings };
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
      chatContent: rect("#chat-content"),
      chatForm: rect("#chat-form"),
      controls: rect("#controls"),
      stageToolbar: rect(".stage-toolbar"),
      chatInputFontSize: window.getComputedStyle(document.querySelector("#chat-input")).fontSize,
      touchTargets: [
        "#studio-toggle", "#focus-toggle", "#help-toggle",
        "#camera-zoom-out", "#camera-reset", "#camera-zoom-in", "#stage-wave", "#interaction-menu-toggle", "#fullscreen-toggle",
        "#voice-toggle", "#toggle-menu", "#collapse-chat", "#record-message", "#chat-send",
        ".prompt-grid button"
      ].map((selector) => ({ selector, ...rect(selector) })),
      chatScrollTop: document.querySelector("#chat-panel").scrollTop,
      bodyScrollHeight: document.documentElement.scrollHeight,
      bodyScrollWidth: document.documentElement.scrollWidth,
      controlsOpen: controls.classList.contains("is-open"),
      controlsAriaHidden: controls.getAttribute("aria-hidden"),
      welcomeHidden: document.querySelector("#welcome-card").hidden
    };
  });
}

async function setChatExpanded(pageInstance, expanded) {
  const button = pageInstance.locator("#collapse-chat");
  const current = await button.getAttribute("aria-expanded") === "true";
  if (current !== expanded) await button.click();
  await pageInstance.waitForFunction(
    (expected) => document.querySelector("#collapse-chat")?.getAttribute("aria-expanded") === String(expected),
    expanded
  );
  await pageInstance.waitForTimeout(280);
}

function assertContained(viewportName, label, inner, outer, tolerance = 1) {
  if (
    inner.top < outer.top - tolerance || inner.left < outer.left - tolerance
    || inner.right > outer.right + tolerance || inner.bottom > outer.bottom + tolerance
  ) {
    throw new Error(`${viewportName}: ${label} is outside its container (${JSON.stringify({ inner, outer })})`);
  }
}

function rectanglesOverlap(first, second, tolerance = 0) {
  const overlapWidth = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const overlapHeight = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);
  return overlapWidth > tolerance && overlapHeight > tolerance;
}

function assertWithinViewport(viewportName, label, rect, viewport, tolerance = 1) {
  if (
    rect.top < -tolerance || rect.left < -tolerance
    || rect.right > viewport.width + tolerance || rect.bottom > viewport.height + tolerance
  ) {
    throw new Error(`${viewportName}: ${label} is outside viewport (${JSON.stringify(rect)})`);
  }
}
