import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import fa from "./fa.json";
import { PREFERENCES_KEY } from "../store/uiStore";

/**
 * KetabYar speaks Persian. The Persian dictionary is the single source of
 * truth; every string ships in it, and any future locale can be added as a
 * sibling resource without touching call sites.
 */

const savedLocale = (() => {
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(PREFERENCES_KEY) : null;
    if (stored) {
      const prefs = JSON.parse(stored) as { locale?: string };
      if (prefs.locale === "fa") return "fa" as const;
    }
  } catch {
    /* unreadable preferences — default below */
  }
  return "fa" as const;
})();

i18n.use(initReactI18next).init({
  resources: { fa: { translation: fa } },
  lng: savedLocale,
  fallbackLng: "fa",
  interpolation: { escapeValue: false },
});

export default i18n;
