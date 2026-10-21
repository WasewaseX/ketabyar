import { create } from "zustand";
import type { Preferences } from "../types";

/**
 * Per-device UI preferences (theme, accent, density…). Everything an entire
 * library shares lives in LibrarySettings instead. Persisted to localStorage
 * under a KetabYar key so the pre-release branding never leaks in.
 */

export const PREFERENCES_KEY = "ketabyar-preferences";

const defaults: Preferences = {
  onboardingComplete: false,
  locale: "fa",
  theme: "light",
  accentColor: "#1a4d40",
  fontSize: "medium",
  googleBooksEnabled: true,
  openLibraryEnabled: true,
  groqEnabled: false,
  groqApiKey: "",
  closeToTray: true,
  launchOnBoot: false,
  autosaveEnabled: true,
  autosaveInterval: 60,
  pageSize: 10,
  titlePreference: "original",
};

function loadPreferences(): Preferences {
  if (typeof localStorage === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Preferences>) } : defaults;
  } catch {
    return defaults;
  }
}

interface UiState {
  preferences: Preferences;
  sidebarOpen: boolean;
  paletteOpen: boolean;
  updatePreferences: (values: Partial<Preferences>) => void;
  setPaletteOpen: (value: boolean) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  preferences: loadPreferences(),
  sidebarOpen: true,
  paletteOpen: false,
  updatePreferences: (values) =>
    set((state) => {
      const preferences = { ...state.preferences, ...values };
      try {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      } catch {
        /* storage unavailable */
      }
      if (values.closeToTray !== undefined) {
        import("@tauri-apps/api/core")
          .then(({ invoke }) => invoke("set_close_to_tray", { enabled: values.closeToTray }).catch(console.error))
          .catch(console.error);
      }
      return { preferences };
    }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
}));
