import { useLibrarySettingsStore } from "../store/librarySettingsStore";

/**
 * Money formatting. The currency is an institution-wide setting
 * (library_settings.currency); the numbering locale follows the operator's
 * device preference. IRR is rendered with Persian digit grouping, which is
 * how Iranian libraries write amounts.
 */

function readLocale(): string {
  try {
    const stored = localStorage.getItem("ketabyar-preferences");
    if (stored) {
      const prefs = JSON.parse(stored) as { locale?: string };
      if (prefs.locale) return prefs.locale;
    }
  } catch {
    /* fall through */
  }
  return "fa";
}

export function formatDisplayCurrency(amount: number): string {
  const locale = readLocale();
  let currency = "IRR";
  try {
    const settings = useLibrarySettingsStore.getState().settings;
    if (settings.currency) currency = settings.currency;
  } catch {
    /* defaults below */
  }

  if (currency === "IRR") {
    try {
      return `${amount.toLocaleString("fa-IR")} تومان`;
    } catch {
      return `${amount} تومان`;
    }
  }

  try {
    return new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}
