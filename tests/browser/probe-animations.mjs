import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const baseUrl = process.env.WEB_URL || "http://127.0.0.1:3001";
const outputDir = path.resolve("test-results/browser/animations");
const modelLabels = ["Mika", "Sam", "Naruto", "Carlotta"];
const screenshotAnimations = new Set(["Hello", "Dogeza", "Smartphone", "Drink Water", "Dance 25"]);

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
const issues = [];

page.on("pageerror", (error) => issues.push({ type: "pageerror", message: error.message }));
page.on("console", (message) => {
  if (message.type() === "error") issues.push({ type: "console", message: message.text() });
});
page.on("response", (response) => {
  if (response.status() >= 400 && response.url().includes("/animations/")) {
    issues.push({ type: "asset", status: response.status(), url: response.url() });
  }
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.click("#control-tab-animations");
  const animationLabels = await page.locator("#animation-buttons [data-animation-id]").allTextContents();
  const results = [];

  for (const model of modelLabels) {
    await page.click("#control-tab-models");
    await page.getByRole("button", { name: model, exact: true }).click();
    await page.waitForFunction(() => !document.querySelector(".control-panel")?.classList.contains("is-busy"));
    await page.click("#control-tab-animations");

    for (const animation of animationLabels) {
      const issueStart = issues.length;
      const button = page.getByRole("button", { name: animation, exact: true });
      await button.click();
      await page.waitForTimeout(450);
      const pressed = await button.getAttribute("aria-pressed");
      results.push({ model, animation, pressed, issues: issues.slice(issueStart) });

      if (screenshotAnimations.has(animation)) {
        await page.screenshot({
          path: path.join(outputDir, `${model}-${animation}`.replaceAll(" ", "-") + ".png")
        });
      }
    }
  }

  const report = {
    createdAt: new Date().toISOString(),
    baseUrl,
    models: modelLabels,
    animationCount: animationLabels.length,
    checks: results.length,
    failedChecks: results.filter((result) => result.issues.length > 0),
    issues
  };
  await fs.writeFile(path.join(outputDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, issues: issues.length, report: path.join(outputDir, "report.json") }));
  if (issues.length > 0) process.exitCode = 1;
} finally {
  await browser.close();
}
