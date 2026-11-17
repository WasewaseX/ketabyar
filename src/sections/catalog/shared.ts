import { z } from "zod";
import type { Book } from "../../types";

/**
 * The bibliographic catalog: titles with their physical copies, saved views,
 * metadata autofill from Google Books / Open Library (+ optional Groq), and
 * full add / edit / archive flows.
 */

/* ── Form schema ─────────────────────────────────────────────────────── */

const optionalString = z.string().optional().nullable();

export const bookSchema = z.object({
  item_type: z.string(),
  title: z.string().min(2, "یک عنوان وارد کنید"),
  subtitle: optionalString,
  arabic_title: optionalString,
  tags: optionalString,
  author: optionalString,
  isbn: optionalString,
  publisher: optionalString,
  category: optionalString,
  language: z.string().min(2),
  publication_year: z.union([z.string(), z.number()]).optional().nullable(),
  call_number: optionalString,
  dewey_code: optionalString,
  barcode: optionalString,
  accession: optionalString,
  description: optionalString,
  cover_path: optionalString,
  // item-type specific metadata:
  issue_number: optionalString,
  frequency: optionalString,
  issn: optionalString,
  pub_date: optionalString,
  issue_date: optionalString,
  press: optionalString,
  region: optionalString,
  editor: optionalString,
  ruling_type: optionalString,
  page_count: optionalString,
  paper_size: optionalString,
  brand: optionalString,
  media_format: optionalString,
  duration: optionalString,
  model_number: optionalString,
  specifications: optionalString,
  artist: optionalString,
  studio: optionalString,
  owner: optionalString,
});

/** Stable empty array — keeps the filter memos from re-running every render. */
export const EMPTY_BOOKS: Book[] = [];

export type BookForm = z.infer<typeof bookSchema>;

export const METADATA_KEYS = [
  "issue_number",
  "frequency",
  "issn",
  "pub_date",
  "issue_date",
  "press",
  "region",
  "editor",
  "ruling_type",
  "page_count",
  "paper_size",
  "brand",
  "media_format",
  "duration",
  "model_number",
  "specifications",
  "artist",
  "studio",
  "owner",
] as const;

export const EMPTY_FORM: BookForm = {
  item_type: "book",
  title: "",
  subtitle: "",
  arabic_title: "",
  tags: "",
  author: "",
  isbn: "",
  publisher: "",
  category: "",
  language: "فارسی",
  publication_year: "",
  call_number: "",
  dewey_code: "",
  barcode: "",
  accession: "",
  description: "",
  cover_path: "",
  issue_number: "",
  frequency: "",
  issn: "",
  pub_date: "",
  issue_date: "",
  press: "",
  region: "",
  editor: "",
  ruling_type: "",
  page_count: "",
  paper_size: "",
  brand: "",
  media_format: "",
  duration: "",
  model_number: "",
  specifications: "",
  artist: "",
  studio: "",
  owner: "",
};

export function metadataFromForm(form: BookForm): string | null {
  const entries = METADATA_KEYS.map(
    (key) => [key, (form[key] as string | undefined)?.trim() ?? ""] as const,
  ).filter(([, value]) => value.length > 0);
  return entries.length > 0
    ? JSON.stringify(Object.fromEntries(entries))
    : null;
}

export function metadataToForm(
  metadata: string | null | undefined,
): Partial<BookForm> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const patch: Record<string, string> = {};
    for (const key of METADATA_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" || typeof value === "number")
        patch[key] = String(value);
    }
    return patch as Partial<BookForm>;
  } catch {
    return {};
  }
}

export const SAVED_VIEWS = [
  "allBooks",
  "recentAdditions",
  "availableNow",
  "lowStock",
  "outOfStock",
  "noCopies",
  "missingCover",
  "missingIsbn",
] as const;
export type SavedView = (typeof SAVED_VIEWS)[number];

export function matchesView(view: SavedView, book: Book): boolean {
  const total = book.total_copies ?? 0;
  const available = book.available_copies ?? 0;
  switch (view) {
    case "allBooks":
      return true;
    case "recentAdditions":
      return Date.now() - new Date(book.created_at).getTime() <= 7 * 86_400_000;
    case "availableNow":
      return available > 0;
    case "lowStock":
      return available > 0 && available <= 2;
    case "outOfStock":
      return total > 0 && available === 0;
    case "noCopies":
      return total === 0;
    case "missingCover":
      return !book.cover_path && !book.cover_url;
    case "missingIsbn":
      return !book.isbn13 && !book.isbn10;
  }
}
