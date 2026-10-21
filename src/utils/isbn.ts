/**
 * ISBN / identifier helpers for KetabYar.
 *
 * ISBN validation here is real checksum validation, not just shape checking:
 *   • ISBN-10  → weighted mod-11 check digit (0–9 or X for ten).
 *   • ISBN-13  → alternating 1/3 weighted mod-10 check digit, restricted to
 *                the 978 / 979 Bookland prefixes.
 * The module also converts between the two forms and hyphenates them for
 * display using the common registrant-group heuristics.
 */

const DIGITS_ONLY = /[^0-9Xx]/g;

/** Strips separators and uppercases — keeps only 0-9 and a trailing X. */
export function normalizeIsbn(value: string): string {
  return (value || "").replace(DIGITS_ONLY, "").toUpperCase();
}

/** ISBN-10 checksum: Σ (10 − i) × digit_i  ≡ 0 (mod 11), X counts as 10. */
function isbn10Checksum(body9: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(body9[i]);
  const remainder = (11 - (sum % 11)) % 11;
  return remainder === 10 ? "X" : String(remainder);
}

/** ISBN-13 checksum: Σ digit × (1 or 3 alternating) ≡ 0 (mod 10). */
function isbn13Checksum(body12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(body12[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/** True when the value is a checksum-valid ISBN-13 in the 978/979 Bookland space. */
export function isValidIsbn13(value: string): boolean {
  const raw = normalizeIsbn(value);
  if (!/^(978|979)\d{10}$/.test(raw)) return false;
  return isbn13Checksum(raw.slice(0, 12)) === raw[12];
}

/** True when the value is a checksum-valid ISBN-10. */
export function isValidIsbn10(value: string): boolean {
  const raw = normalizeIsbn(value);
  if (!/^\d{9}[\dX]$/.test(raw)) return false;
  return isbn10Checksum(raw.slice(0, 9)) === raw[9];
}

/** Validates either ISBN flavour (checksum included). Empty input is not valid. */
export function isValidIsbn(value: string): boolean {
  const raw = normalizeIsbn(value);
  if (raw.length === 10) return isValidIsbn10(raw);
  if (raw.length === 13) return isValidIsbn13(raw);
  return false;
}

/** Converts a valid ISBN-10 into its ISBN-13 form (978 Bookland prefix). */
export function toIsbn13(value: string): string | null {
  const raw = normalizeIsbn(value);
  if (raw.length !== 10 || !isValidIsbn10(raw)) return null;
  const body = "978" + raw.slice(0, 9);
  return body + isbn13Checksum(body);
}

/** Converts a 978-prefixed ISBN-13 back into ISBN-10 where possible. */
export function toIsbn10(value: string): string | null {
  const raw = normalizeIsbn(value);
  if (raw.length !== 13 || !raw.startsWith("978") || !isValidIsbn13(raw)) return null;
  const body = raw.slice(3, 12);
  return body + isbn10Checksum(body);
}

/**
 * Splits a validated ISBN into display groups.
 * ISBN-10:  group 1-3-5-1.  ISBN-13:  3-1-3-5-1 when the registrant block
 * starts with 0-5 or 7 (English / common groups), otherwise 3-2-4-3-1.
 * Unknown shapes are returned unchanged so junk input still round-trips.
 */
export function formatIsbn(value: string | null | undefined): string {
  const raw = normalizeIsbn(value ?? "");
  if (raw.length === 10) {
    const g1 = raw.slice(0, 1);
    const g2 = raw.slice(1, 4);
    const g3 = raw.slice(4, 9);
    return `${g1}-${g2}-${g3}-${raw[9]}`;
  }
  if (raw.length === 13) {
    const rest = raw.slice(3);
    if (/^[0-57]/.test(rest)) {
      return `${raw.slice(0, 3)}-${rest.slice(0, 1)}-${rest.slice(1, 4)}-${rest.slice(4, 9)}-${raw[12]}`;
    }
    return `${raw.slice(0, 3)}-${rest.slice(0, 2)}-${rest.slice(2, 6)}-${rest.slice(6, 9)}-${raw[12]}`;
  }
  return value ?? "";
}

/** Barcode normalisation: trimmed, uppercase — scanner-friendly. */
export function cleanBarcode(value: string): string {
  return (value ?? "").trim().toUpperCase();
}

/** Accession-number normalisation: trimmed, uppercase. */
export function cleanAccession(value: string): string {
  return (value ?? "").trim().toUpperCase();
}

/** Keeps digits, allowing a single leading "+" for international phones. */
export function cleanPhone(value: string): string {
  const trimmed = (value ?? "").trim();
  const plus = trimmed.startsWith("+") ? "+" : "";
  return plus + trimmed.slice(plus.length).replace(/\D/g, "");
}

/** Member numbers keep digits only; falls back to the trimmed input. */
export function cleanMemberNumber(value: string): string {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits || (value ?? "").trim();
}

/** Renders "MB-123456" for cards and badges. */
export function formatMemberNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const digits = String(value).replace(/\D/g, "");
  return digits ? `MB-${digits}` : String(value);
}

/** Random n-digit member number (no leading zeros). */
export function generateRandomMemberNumber(digitsCount = 6): string {
  const floor = 10 ** (digitsCount - 1);
  return String(floor + Math.floor(Math.random() * (9 * floor)));
}

export function cleanText(value: string): string {
  return (value ?? "").trim();
}

export function cleanLastName(value: string): string {
  return (value ?? "").trim().toUpperCase();
}
