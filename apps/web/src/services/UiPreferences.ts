import { safeGetLocalStorage, safeSetLocalStorage } from "./storageService.js";

const preferencesKey = "animeBuddy.uiPreferences.v2";

export interface UiPreferences {
  characterId?: string;
  backgroundId?: string;
  controlsOpen: boolean;
  chatCollapsed: boolean;
  reducedMotion: boolean;
  welcomeSeen: boolean;
  bloomEnabled: boolean;
  lightingMode: "auto" | "day" | "sunset" | "night";
}

const defaultPreferences = (): UiPreferences => ({
  // Start in immersive mode: the 3D stage is the first thing users see.
  controlsOpen: false,
  chatCollapsed: true,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  welcomeSeen: false,
  bloomEnabled: true,
  lightingMode: "auto"
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
        chatCollapsed: typeof parsed.chatCollapsed === "boolean" ? parsed.chatCollapsed : defaults.chatCollapsed,
        reducedMotion: typeof parsed.reducedMotion === "boolean" ? parsed.reducedMotion : defaults.reducedMotion,
        welcomeSeen: parsed.welcomeSeen === true,
        bloomEnabled: typeof parsed.bloomEnabled === "boolean" ? parsed.bloomEnabled : defaults.bloomEnabled,
        lightingMode: (parsed.lightingMode === "day" || parsed.lightingMode === "sunset" || parsed.lightingMode === "night")
          ? parsed.lightingMode
          : "auto"
      };
    } catch {
      return defaults;
    }
  }
}
