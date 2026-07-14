import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  defaultWebUrl,
  seedUiPreferences,
  setStudioOpen,
  waitForAppReady,
  waitForCompanionState
} from "./ui-test-helpers.mjs";

const exhaustive = process.argv.includes("--all");
const outputDir = path.resolve("test-results/browser/animations");
const modelIds = ["mika", "sam", "naruto", "carlotta"];
const generatedAnimationIds = [
  "relax",
  "listening",
  "thinking",
  "talking",
  "gentle-gesture",
  "curious-tilt",
  "nod",
  "wave"
];
const legacyAnimationByModel = {
  mika: "greeting",
  sam: "hello",
  naruto: "shake-head",
  carlotta: "clapping"
};
const loopAnimationIds = new Set(["relax", "listening", "thinking", "talking", "smartphone", "step-exercise"]);
const screenshotAnimationIds = exhaustive
  ? new Set([...generatedAnimationIds, ...Object.values(legacyAnimationByModel), "dogeza", "drink-water", "dance-25"])
  : new Set(["relax", "wave"]);

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--disable-gpu-sandbox"]
});
const issues = [];
const abortedAssetRequests = [];
const results = [];
let registryAnimations = null;
let activeContext;
let activePage;

try {
  for (const modelId of modelIds) {
    activeContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    activePage = await activeContext.newPage();
    attachObservers(activePage, modelId);
    await seedUiPreferences(activePage, {
      characterId: modelId,
      controlsOpen: true,
      reducedMotion: true,
      welcomeSeen: true
    });

    await activePage.goto(defaultWebUrl, { waitUntil: "domcontentloaded" });
    await waitForAppReady(activePage);
    await activePage.waitForFunction(() => (
      !document.querySelector("#bling-performance")?.disabled
      && !document.querySelector("#aipai-performance")?.disabled
    ), null, { timeout: 30_000 });
    await setStudioOpen(activePage, true);
    await activePage.locator("#control-tab-models").click();
    await activePage.waitForFunction((id) => (
      document.querySelector(`[data-model-id='${id}']`)?.getAttribute("aria-pressed") === "true"
    ), modelId, { timeout: 60_000 });
    await activePage.locator("#control-tab-animations").click();

    const animations = await readAnimations(activePage);
    if (!registryAnimations) {
      registryAnimations = animations;
      const ids = new Set(animations.map((animation) => animation.id));
      const missing = generatedAnimationIds.filter((id) => !ids.has(id));
      if (missing.length > 0) throw new Error(`Missing generated companion animations: ${missing.join(", ")}`);
    } else if (animations.map((item) => item.id).join("|") !== registryAnimations.map((item) => item.id).join("|")) {
      throw new Error(`${modelId}: animation registry changed between isolated model contexts`);
    }

    const animationById = new Map(animations.map((animation) => [animation.id, animation]));
    const animationIds = exhaustive
      ? animations.map((animation) => animation.id)
      : [...generatedAnimationIds, legacyAnimationByModel[modelId]];

    for (const animationId of animationIds) {
      const animation = animationById.get(animationId);
      if (!animation) {
        issues.push({ type: "registry", modelId, animationId, message: "animation is not registered" });
        continue;
      }
      await prepareAnimationPanel(activePage);
      await waitForCompanionState(activePage, "IDLE", 12_000);
      const issueStart = issues.length;
      const button = activePage.locator(`[data-animation-id='${animationId}']`);
      await button.evaluate((element) => element.scrollIntoView({ block: "center", inline: "nearest" }));
      await button.waitFor({ state: "visible", timeout: 3_000 });
      if (await button.isDisabled()) {
        issues.push({ type: "ui", modelId, animationId, message: "animation button is disabled" });
        continue;
      }

      const animationResponse = animationId === "relax"
        ? null
        : activePage.waitForResponse((response) => (
          response.url().includes("/animations/")
          && !response.url().includes("Bling-Bang-Bang-Born")
          && !response.url().includes("Aipai-Dance-Hall")
        ), { timeout: 10_000 });
      await button.click();
      await activePage.waitForFunction((id) => {
        const requested = document.querySelector(`[data-animation-id='${id}']`);
        return requested?.getAttribute("aria-pressed") === "true"
          || document.querySelector("#state-pill")?.getAttribute("data-state") === "REACTING";
      }, animationId, { timeout: 10_000 });
      if (animationResponse) {
        const response = await animationResponse;
        await response.finished();
      }
      await activePage.waitForTimeout(180);

      const snapshot = await activePage.evaluate((id) => ({
        requestedPressed: document.querySelector(`[data-animation-id='${id}']`)?.getAttribute("aria-pressed"),
        selectedAnimationId: document.querySelector("[data-animation-id][aria-pressed='true']")?.dataset.animationId ?? null,
        state: document.querySelector("#state-pill")?.getAttribute("data-state") ?? null
      }), animationId);

      if (screenshotAnimationIds.has(animationId)) {
        await activePage.screenshot({ path: path.join(outputDir, `${modelId}-${animationId}.png`) });
      }
      if (!loopAnimationIds.has(animationId)) {
        await waitForCompanionState(activePage, "IDLE", 12_000);
      } else {
        await activePage.waitForTimeout(300);
      }

      results.push({
        modelId,
        animationId,
        label: animation.label,
        ...snapshot,
        issues: issues.slice(issueStart)
      });
    }

    await activeContext.close();
    activeContext = undefined;
    activePage = undefined;
  }

  const failedChecks = results.filter((result) => result.issues.length > 0);
  const generatedChecks = results.filter((result) => generatedAnimationIds.includes(result.animationId));
  const report = {
    createdAt: new Date().toISOString(),
    baseUrl: defaultWebUrl,
    mode: exhaustive ? "exhaustive" : "generated-plus-smoke",
    models: modelIds,
    registryAnimationCount: registryAnimations?.length ?? 0,
    checks: results.length,
    generatedAnimationChecks: generatedChecks.length,
    failedChecks,
    issues,
    abortedAssetRequests,
    results
  };
  await fs.writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    mode: report.mode,
    checks: report.checks,
    generatedAnimationChecks: report.generatedAnimationChecks,
    issues: issues.length,
    report: path.join(outputDir, "report.json")
  }));
  if (issues.length > 0) process.exitCode = 1;
} catch (error) {
  await activePage?.screenshot({ path: path.join(outputDir, "failure.png") }).catch(() => undefined);
  await fs.writeFile(path.join(outputDir, "failure.json"), JSON.stringify({
    error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error),
    issues,
    abortedAssetRequests,
    results
  }, null, 2)).catch(() => undefined);
  throw error;
} finally {
  await activeContext?.close().catch(() => undefined);
  await browser.close();
}

function attachObservers(page, modelId) {
  page.on("pageerror", (error) => issues.push({ type: "pageerror", modelId, message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") issues.push({ type: "console", modelId, message: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.url().includes("/animations/")) {
      issues.push({ type: "asset", modelId, status: response.status(), url: response.url() });
    }
  });
  page.on("requestfailed", (request) => {
    if (request.url().includes("/animations/")) {
      const message = request.failure()?.errorText ?? "failed";
      const event = { type: "asset-request", modelId, url: request.url(), message };
      if (message.includes("ERR_ABORTED")) abortedAssetRequests.push(event);
      else issues.push(event);
    }
  });
}

async function readAnimations(page) {
  return page.locator("#animation-buttons [data-animation-id]").evaluateAll((buttons) => (
    buttons.map((button) => ({
      id: button.dataset.animationId,
      label: button.querySelector(".option-label")?.textContent?.trim() || button.textContent?.trim() || button.dataset.animationId
    }))
  ));
}

async function prepareAnimationPanel(page) {
  await waitForAppReady(page);
  await setStudioOpen(page, true);
  await page.locator("#controls").evaluate((element) => element.scrollTop = 0);
  if (await page.locator("#control-tab-animations").getAttribute("aria-selected") !== "true") {
    await page.locator("#control-tab-animations").click();
  }
}
