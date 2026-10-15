/**
 * Backfills `books.cover_url` for catalogue records that have no cover yet.
 *
 * Sources, in order of confidence:
 *   1. Google Books, looked up by a checksum-valid ISBN   (title-checked)
 *   2. Open Library covers, by a checksum-valid ISBN      (title-checked)
 *   3. Google Books, by title + author                    (fuzzy, score-gated)
 *   4. Open Library search, by title                      (fuzzy, score-gated)
 *
 * Fuzzy matches are only accepted when the candidate title clears SIMILARITY_MIN,
 * because a plausible-but-wrong cover is worse than no cover at all — a reader
 * scanning the shelf list would take it as fact.
 *
 * Usage:
 *   node scripts/backfill_covers.mjs --dry-run        # report only, write nothing
 *   node scripts/backfill_covers.mjs --limit 50       # cap how many books are touched
 *   node scripts/backfill_covers.mjs                  # full run
 *
 * Safe to re-run: books that already have a cover are skipped, so once Google Books'
 * daily quota resets a second run picks up only what is still missing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import {
  ISBN_TITLE_MIN,
  openLibraryIsbnRecord,
  similarity,
  titleScore,
  validIsbnOf,
} from "./cover_match.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i !== -1 ? Number(process.argv[i + 1]) : Infinity;
})();

const SIMILARITY_MIN = 0.6;
const CONCURRENCY = 4;
const MIN_IMAGE_BYTES = 1000; // anything smaller is a placeholder pixel, not a cover
const USER_AGENT = "Warraq-Library/1.0 (hospital library catalogue)";

// ---------------------------------------------------------------- env + client

const env = Object.fromEntries(
  readFileSync(new URL("../.env", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

if (!env.VITE_SUPABASE_URL || !env.SECRET_KEY) {
  console.error("Missing VITE_SUPABASE_URL or SECRET_KEY in App/.env");
  process.exit(1);
}

const supabase = createClient(env.VITE_SUPABASE_URL, env.SECRET_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------- http helpers

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": USER_AGENT } });
    const json = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, json };
  } catch {
    return { ok: false, status: 0, json: null };
  } finally {
    clearTimeout(timer);
  }
}

/** Confirms a URL really serves an image — Open Library hands back a blank placeholder
 *  for unknown covers unless `default=false`, and some hosts answer 200 with an error page. */
async function isRealImage(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) return false;
    if (!(res.headers.get("content-type") ?? "").startsWith("image/")) return false;
    const bytes = (await res.arrayBuffer()).byteLength;
    return bytes >= MIN_IMAGE_BYTES;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Google Books enforces a per-day quota; once it is spent every further call 429s.
// Latch it off for the rest of the run instead of burning time on guaranteed failures.
let googleQuotaExhausted = false;

async function google(query) {
  if (googleQuotaExhausted) return null;
  const { ok, status, json } = await fetchJson(
    `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`
  );
  if (status === 429) {
    googleQuotaExhausted = true;
    console.warn("  ! Google Books daily quota exhausted — skipping it for the rest of this run.");
    return null;
  }
  return ok ? json : null;
}

const googleThumb = (info) => {
  const link = info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail;
  // Default thumbnails are ~128px and carry a page-curl overlay; widen and drop it.
  return link ? link.replace("http://", "https://").replace("&edge=curl", "") + "&zoom=1" : null;
};

// ---------------------------------------------------------------- resolution

async function findCover(book) {
  const authors = book.book_authors.map((ba) => ba.authors.name).join(" ");
  const isbn = validIsbnOf(book);

  // A checksum-valid ISBN can still belong to another book, so each ISBN hit must also
  // share its title with the catalogue entry (see cover_match.mjs).
  if (isbn) {
    const data = await google(`isbn:${isbn}`);
    const info = data?.items?.[0]?.volumeInfo;
    const googleScore = titleScore(book.title, info);
    const url = googleThumb(info);
    if (url && googleScore >= ISBN_TITLE_MIN && (await isRealImage(url))) {
      return { url, via: "google:isbn", score: +googleScore.toFixed(2), matched: info.title };
    }

    const record = await openLibraryIsbnRecord(isbn);
    const olScore = titleScore(book.title, record);
    const ol = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
    if (olScore >= ISBN_TITLE_MIN && (await isRealImage(ol))) {
      return { url: ol, via: "openlibrary:isbn", score: +olScore.toFixed(2), matched: record.title };
    }
  }

  const data = await google(`${book.title} ${authors}`.trim());
  for (const item of data?.items ?? []) {
    const info = item.volumeInfo ?? {};
    const score = similarity(book.title, info.title ?? "");
    if (score < SIMILARITY_MIN) continue;
    const url = googleThumb(info);
    if (url && (await isRealImage(url))) {
      return { url, via: "google:title", score: +score.toFixed(2), matched: info.title };
    }
  }

  const { json } = await fetchJson(
    `https://openlibrary.org/search.json?title=${encodeURIComponent(book.title)}&limit=5&fields=title,cover_i`
  );
  for (const doc of json?.docs ?? []) {
    const score = similarity(book.title, doc.title ?? "");
    if (!doc.cover_i || score < SIMILARITY_MIN) continue;
    const url = `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`;
    if (await isRealImage(url)) {
      return { url, via: "openlibrary:title", score: +score.toFixed(2), matched: doc.title };
    }
  }

  return null;
}

// ---------------------------------------------------------------- main

const { data: books, error } = await supabase
  .from("books")
  .select("id, title, isbn13, isbn10, cover_url, book_authors ( authors ( name ) )")
  .is("archived_at", null)
  .order("title");

if (error) {
  console.error("Could not load books:", error.message);
  process.exit(1);
}

const pending = books.filter((b) => !b.cover_url?.trim()).slice(0, LIMIT);

console.log(
  `${books.length} catalogue records, ${books.length - books.filter((b) => !b.cover_url?.trim()).length} already have covers.`
);
console.log(`Resolving ${pending.length}${DRY_RUN ? " (dry run — nothing will be written)" : ""}...\n`);

const stats = { found: 0, missed: 0, written: 0, failed: 0, byVia: {} };
let cursor = 0;

async function worker() {
  while (cursor < pending.length) {
    const book = pending[cursor++];
    const n = String(cursor).padStart(3);
    let hit = null;
    try {
      hit = await findCover(book);
    } catch (err) {
      console.warn(`${n} !! ${book.title.slice(0, 45)} — ${String(err).slice(0, 60)}`);
    }

    if (!hit) {
      stats.missed++;
      console.log(`${n} ·  ${book.title.slice(0, 60)}`);
      continue;
    }

    stats.found++;
    stats.byVia[hit.via] = (stats.byVia[hit.via] ?? 0) + 1;
    console.log(`${n} ✓  [${hit.via} ${hit.score}] ${book.title.slice(0, 50)}`);
    if (hit.matched && hit.score < 1) console.log(`        ↳ matched "${hit.matched.slice(0, 55)}"`);

    if (!DRY_RUN) {
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_url: hit.url })
        .eq("id", book.id);
      if (updateError) {
        stats.failed++;
        console.warn(`        !! write failed: ${updateError.message}`);
      } else {
        stats.written++;
      }
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const pct = pending.length ? Math.round((stats.found / pending.length) * 100) : 0;
console.log(`\n─────────────────────────────────────────────`);
console.log(`found ${stats.found}/${pending.length} (${pct}%)   missed ${stats.missed}`);
if (!DRY_RUN) console.log(`written ${stats.written}   failed ${stats.failed}`);
console.log(stats.byVia);
if (googleQuotaExhausted) {
  console.log("\nGoogle Books quota was exhausted during this run.");
  console.log("Re-run tomorrow to pick up the remainder — completed books are skipped automatically.");
}
