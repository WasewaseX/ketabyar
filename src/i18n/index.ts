import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import fr from "./fr.json";
import ar from "./ar.json";
import fa from "./fa.json";

const VALID_LOCALES = ["fa", "en", "fr", "ar"] as const;
type Locale = (typeof VALID_LOCALES)[number];

let savedLocale: Locale = "fa";
try {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem("warraq-preferences") : null;
  if (stored) {
    const prefs = JSON.parse(stored);
    if (prefs && VALID_LOCALES.includes(prefs.locale)) {
      savedLocale = prefs.locale as Locale;
    }
  }
} catch (e) {
  console.error("Failed to load saved locale", e);
}

i18n.use(initReactI18next).init({
  resources: {
    fa: { translation: fa },
    en: { translation: en },
    fr: { translation: fr },
    ar: { translation: ar },
  },
  lng: savedLocale,
  fallbackLng: "en",
  interpolation: { escapeValue: false }
});

export default i18n;
