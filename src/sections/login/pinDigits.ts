/** Persian-digit glyphs in keypad order (۱..۹, ۰). */
export const PERSIAN_DIGITS = [
  "۱",
  "۲",
  "۳",
  "۴",
  "۵",
  "۶",
  "۷",
  "۸",
  "۹",
  "۰",
];

/** Persian (۰-۹) and Arabic-Indic (٠-٩) digits → ASCII, so every layout works. */
export function toAsciiDigits(value: string): string {
  return value.replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Normalise any raw input (paste, soft keyboard) to ≤8 ASCII digits. */
export function normalizePinInput(raw: string): string {
  return toAsciiDigits(raw).replace(/\D/g, "").slice(0, 8);
}
