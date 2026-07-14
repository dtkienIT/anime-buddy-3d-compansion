export const defaultWebUrl = process.env.WEB_URL || "http://127.0.0.1:3001";
export const uiPreferencesKey = "animeBuddy.uiPreferences.v2";

export async function seedUiPreferences(page, overrides = {}) {
  await page.addInitScript(({ key, preferences }) => {
    try {
      let current = {};
      try {
        current = JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        current = {};
      }
      localStorage.setItem(key, JSON.stringify({ ...current, ...preferences }));
    } catch {
      // Storage can be unavailable in a transient/opaque document. The script
      // runs again in the app document where localStorage is available.
    }
  }, {
    key: uiPreferencesKey,
    preferences: {
      controlsOpen: false,
      chatCollapsed: false,
      reducedMotion: false,
      welcomeSeen: true,
      ...overrides
    }
  });
}

export async function waitForAppReady(page, timeout = 60_000) {
  await page.waitForFunction(() => document.body.classList.contains("is-ready"), null, { timeout });
  await page.locator("#state-pill[data-state='IDLE']").waitFor({ timeout });
}

export async function waitForCompanionState(page, state, timeout = 30_000) {
  await page.locator(`#state-pill[data-state='${state}']`).waitFor({ timeout });
}

export async function setVoiceEnabled(page, enabled) {
  const button = page.locator("#voice-toggle");
  const desired = String(enabled);
  if (await button.getAttribute("aria-pressed") !== desired) {
    await button.click();
  }
  await page.waitForFunction(
    ({ selector, pressed }) => document.querySelector(selector)?.getAttribute("aria-pressed") === pressed,
    { selector: "#voice-toggle", pressed: desired }
  );
}

export async function setStudioOpen(page, open) {
  const toggle = page.locator("#studio-toggle");
  const desired = String(open);
  if (await toggle.getAttribute("aria-expanded") !== desired) {
    if (open) {
      await toggle.click();
    } else {
      await page.locator("#close-controls").click();
    }
  }
  await page.waitForFunction(
    ({ expanded, hidden }) => {
      const toggleElement = document.querySelector("#studio-toggle");
      const panel = document.querySelector("#controls");
      return toggleElement?.getAttribute("aria-expanded") === expanded
        && panel?.getAttribute("aria-hidden") === hidden;
    },
    { expanded: desired, hidden: String(!open) }
  );
  if (open) {
    await page.waitForFunction(() => {
      const panel = document.querySelector("#controls");
      if (!panel) return false;
      const box = panel.getBoundingClientRect();
      return Number.parseFloat(window.getComputedStyle(panel).opacity) > 0.95
        && box.right > 0 && box.bottom > 0 && box.left < window.innerWidth && box.top < window.innerHeight;
    }, null, { timeout: 3_000 });
  }
}
