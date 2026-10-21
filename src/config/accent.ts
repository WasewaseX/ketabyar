/** KetabYar accent presets — the light value, its dark-mode pair, and the label key. */
export interface AccentPreset {
  value: string;
  dark: string;
  labelKey: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { value: "#1a4d40", dark: "#1b9277", labelKey: "settings.appearance.accentSabz" },
  { value: "#c06b3e", dark: "#d98d5f", labelKey: "settings.appearance.accentMesr" },
  { value: "#2f5d8a", dark: "#4d7fb3", labelKey: "settings.appearance.accentKabud" },
  { value: "#6d3fa8", dark: "#9058f3", labelKey: "settings.appearance.accentBanafsh" },
  { value: "#b23244", dark: "#e35353", labelKey: "settings.appearance.accentAnar" },
  { value: "#0f6e9c", dark: "#38a4db", labelKey: "settings.appearance.accentNilufar" },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0];

export function accentDarkPair(value: string): string {
  return ACCENT_PRESETS.find((preset) => preset.value === value)?.dark ?? value;
}

export function applyAccent(value: string): void {
  document.documentElement.style.setProperty("--color-accent", value);
  document.documentElement.style.setProperty("--color-accent-dark", accentDarkPair(value));
}
