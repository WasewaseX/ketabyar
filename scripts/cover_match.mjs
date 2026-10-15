/**
 * Matching helpers shared by the cover scripts (backfill_covers, find_covers, audit_covers).
 *
 * The lesson behind this module: a checksum-valid ISBN is not proof of identity. The
 * catalogue was transcribed by hand, and some ISBNs pass their check digit while belonging
 * to a different book entirely ("Allergologie" carried 1852334754, which is Springer's
 * "Turing's Connectionism"). An ISBN lookup is only accepted once the record it returns
 * also shares its title with the catalogue entry.
 */

export const cleanIsbn = (v) => (v ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();

function isValidIsbn10(s) {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (s[i] === "X" ? 10 : Number(s[i])) * (10 - i);
  return sum % 11 === 0;
}

function isValidIsbn13(s) {
  if (!/^\d{13}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return sum % 10 === 0;
}

/** Only checksum-valid ISBNs are worth looking up: a large share of the stored ISBNs fail
 *  their check digit, and querying those returns confident matches for the wrong book. */
export function validIsbnOf(book) {
  for (const raw of [book.isbn13, book.isbn10]) {
    const s = cleanIsbn(raw);
    if (s.length === 13 && isValidIsbn13(s)) return s;
    if (s.length === 10 && isValidIsbn10(s)) return s;
  }
  return null;
}

const STOPWORDS = new Set([
  "de","la","le","les","des","du","et","en","au","aux","the","of","and","in","to","el","y","por","para",
]);

const normalize = (s) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s) => normalize(s).split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t));

/** Sørensen–Dice over significant tokens. */
export function similarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let shared = 0;
  for (const t of A) if (B.has(t)) shared++;
  return (2 * shared) / (A.size + B.size);
}

/** Catalogue titles are often just the main title while the source record splits
 *  title and subtitle (or the reverse), so score against both forms and keep the better. */
export function titleScore(catalogueTitle, record) {
  const main = record?.title ?? "";
  const full = record?.subtitle ? `${main} ${record.subtitle}` : main;
  return Math.max(similarity(catalogueTitle, main), similarity(catalogueTitle, full));
}

/** An ISBN hit needs far less title overlap than a title search does (the ISBN already
 *  narrows it to one record), but it must share at least some significant words; zero
 *  overlap means the stored ISBN belongs to another book. */
export const ISBN_TITLE_MIN = 0.3;

async function getJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok ? await res.json().catch(() => null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Title of the Open Library edition filed under an ISBN, or null if it has none. */
export async function openLibraryIsbnRecord(isbn) {
  const json = await getJson(`https://openlibrary.org/isbn/${isbn}.json`);
  return json?.title ? { title: json.title, subtitle: json.subtitle ?? null } : null;
}

/** Title of the Open Library work whose chosen cover is this cover id, if any. Edition-only
 *  covers are not indexed this way, so a null here means "unknown", not "mismatch". */
export async function openLibraryCoverRecord(coverId) {
  const json = await getJson(
    `https://openlibrary.org/search.json?q=cover_i:${coverId}&fields=title,subtitle,cover_i&limit=1`
  );
  const doc = json?.docs?.[0];
  return doc?.title ? { title: doc.title, subtitle: doc.subtitle ?? null } : null;
}

/** Title of a Google Books volume by its id. */
export async function googleVolumeRecord(volumeId) {
  const json = await getJson(`https://www.googleapis.com/books/v1/volumes/${volumeId}`);
  const info = json?.volumeInfo;
  return info?.title ? { title: info.title, subtitle: info.subtitle ?? null } : null;
}
