/**
 * Read-only audit: for every catalogue cover, find the record the image was taken from and
 * check that record's title against the catalogue title. Flags covers that belong to some
 * other book, the way "Allergologie" ended up showing "Turing's Connectionism".
 *
 * Writes nothing. It connects with the public anon key and prints, for review, the SQL that
 * would clear the flagged covers; applying it is a separate, deliberate step.
 *
 * How each cover is traced back to a title:
 *   covers.openlibrary.org/b/isbn/<isbn>   → the Open Library edition filed under that ISBN
 *   covers.openlibrary.org/b/id/<id>       → the Open Library work that uses that cover id
 *   books.google.com/...?id=<volume>       → the Google Books volume
 * Anything else (web-search covers confirmed by find_covers' vision check, data: URIs) has no
 * record to compare against and is listed as untraceable.
 *
 * Usage:
 *   node scripts/audit_covers.mjs              # report mismatches
 *   node scripts/audit_covers.mjs --verbose    # also list every matched and untraceable cover
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  ISBN_TITLE_MIN,
  googleVolumeRecord,
  openLibraryCoverRecord,
  openLibraryIsbnRecord,
  titleScore,
} from "./cover_match.mjs";

const VERBOSE = process.argv.includes("--verbose");
const CONCURRENCY = 4;

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
  console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in App/.env");
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

/** Which record a cover URL came from, or null when it can't be traced. */
async function sourceRecord(url) {
  let m = url.match(/covers\.openlibrary\.org\/b\/isbn\/([0-9Xx]+)/);
  if (m) return { via: `openlibrary isbn ${m[1]}`, record: await openLibraryIsbnRecord(m[1]) };
  m = url.match(/covers\.openlibrary\.org\/b\/id\/(\d+)/);
  if (m) return { via: `openlibrary cover ${m[1]}`, record: await openLibraryCoverRecord(m[1]) };
  m = url.match(/books\.google(?:usercontent)?\.com\/.*[?&]id=([\w-]+)/);
  if (m) return { via: `google volume ${m[1]}`, record: await googleVolumeRecord(m[1]) };
  return null;
}

const { data: books, error } = await supabase
  .from("books")
  .select("id, title, isbn13, isbn10, cover_url, cover_path")
  .is("archived_at", null)
  .order("title");

if (error) {
  console.error("Could not load books:", error.message);
  process.exit(1);
}

// The desktop app shows cover_path when set and falls back to cover_url (migration 0006);
// the public site reads cover_url. Audit both so neither surface keeps a wrong cover.
const covers = books.flatMap((b) =>
  ["cover_url", "cover_path"]
    .filter((column) => /^https?:\/\//.test(b[column] ?? ""))
    .filter((column) => !(column === "cover_path" && b.cover_path === b.cover_url))
    .map((column) => ({ book: b, column, url: b[column] }))
);

console.log(`${books.length} catalogue records, ${covers.length} cover URLs to trace.\n`);

const results = [];
let cursor = 0;
async function worker() {
  while (cursor < covers.length) {
    const cover = covers[cursor++];
    const source = await sourceRecord(cover.url);
    results.push({
      ...cover,
      via: source?.via ?? null,
      sourceTitle: source?.record?.title ?? null,
      score: source?.record ? titleScore(cover.book.title, source.record) : null,
    });
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const mismatched = results.filter((r) => r.score !== null && r.score < ISBN_TITLE_MIN);
const partial = results.filter((r) => r.score !== null && r.score >= ISBN_TITLE_MIN && r.score < 1);
const matched = results.filter((r) => r.score === 1);
const untraceable = results.filter((r) => r.score === null);

const line = (r) =>
  `  ${r.book.id}  ${r.column.padEnd(10)}  [${r.score === null ? " -- " : r.score.toFixed(2)}]  ` +
  `"${r.book.title.slice(0, 50)}"` +
  (r.sourceTitle ? `  ←  "${r.sourceTitle.slice(0, 50)}"` : "") +
  (r.via ? `  (${r.via})` : `  (${r.url.slice(0, 60)})`);

console.log(`Mismatched (${mismatched.length}) — the cover's source record has a different title:`);
for (const r of mismatched) console.log(line(r));

// Title-search covers were accepted at a similarity threshold, so a near-title from a
// different book ("Précis de physiologie" ← "Précis de physiologie microbienne") lands here.
// Too ambiguous to clear automatically (translations and subtitles land here too), so these
// are listed for a person to eyeball and left out of the proposed SQL.
console.log(`\nPartial title match (${partial.length}) — worth checking by eye:`);
for (const r of partial) console.log(line(r));

if (VERBOSE) {
  console.log(`\nExact title match (${matched.length}):`);
  for (const r of matched) console.log(line(r));
  console.log(`\nUntraceable (${untraceable.length}) — no source record to compare against:`);
  for (const r of untraceable) console.log(line(r));
} else {
  console.log(`\n${matched.length} exact, ${untraceable.length} untraceable (--verbose to list them).`);
}

if (mismatched.length) {
  console.log("\nProposed fix, for review only (this script does not run it):\n");
  for (const column of ["cover_url", "cover_path"]) {
    const ids = mismatched.filter((r) => r.column === column).map((r) => `'${r.book.id}'`);
    if (ids.length) console.log(`update books set ${column} = null where id in (${ids.join(", ")});`);
  }
}
