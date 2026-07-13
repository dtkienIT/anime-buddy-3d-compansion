import { safeGetLocalStorage, safeSetLocalStorage } from "./storageService.js";

const preferencesKey = "animeBuddy.uiPreferences.v2";

export interface UiPreferences {
  characterId?: string;
  backgroundId?: string;
  controlsOpen: boolean;
  reducedMotion: boolean;
  welcomeSeen: boolean;
}

const defaultPreferences = (): UiPreferences => ({
  controlsOpen: window.innerWidth >= 1200,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  welcomeSeen: false
});

export class UiPreferencesStore {
  private value: UiPreferences;

  constructor() {
    this.value = this.read();
  }

  get current(): UiPreferences {
    return { ...this.value };
  }

  update(patch: Partial<UiPreferences>): UiPreferences {
    this.value = { ...this.value, ...patch };
    safeSetLocalStorage(preferencesKey, JSON.stringify(this.value));
    return this.current;
  }

  reset(): UiPreferences {
    this.value = { ...defaultPreferences(), welcomeSeen: true };
    safeSetLocalStorage(preferencesKey, JSON.stringify(this.value));
    return this.current;
  }

  private read(): UiPreferences {
    const defaults = defaultPreferences();
    const raw = safeGetLocalStorage(preferencesKey);
    if (!raw) {
      return defaults;
    }

    try {
      const parsed = JSON.parse(raw) as Partial<UiPreferences>;
      return {
        characterId: typeof parsed.characterId === "string" ? parsed.characterId : undefined,
        backgroundId: typeof parsed.backgroundId === "string" ? parsed.backgroundId : undefined,
        controlsOpen: typeof parsed.controlsOpen === "boolean" ? parsed.controlsOpen : defaults.controlsOpen,
        reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : defaults.reducedMotion,
        welcomeSeen: parsed.welcomeSeen === true
      };
    } catch {
      return defaults;
    }
  }
}
