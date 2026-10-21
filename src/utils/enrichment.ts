import type { Book } from "../types";
import { fetchBookMetadata, enrichMetadataWithGroq, downloadCoverAsBase64 } from "./metadata";
import { updateBook } from "../data/repositories/library";

/**
 * Bulk cataloguing assistant: scans the collection for incomplete records
 * and fills ONLY blank fields (never overwrites librarian-entered data).
 * Books are processed strictly sequentially with a small pause so the
 * public rate limits of Google Books / Open Library are respected.
 */

export interface EnrichProgress {
  book: Book;
  status: "success" | "skipped" | "error";
  message: string;
}

interface EnrichPatch {
  isbn10?: string | null;
  isbn13?: string | null;
  dewey_code?: string | null;
  arabic_title?: string | null;
  cover_path?: string | null;
}

/** Records missing a cover, an ISBN pair, a Dewey number, or an Arabic title. */
export function findEnrichableBooks(allBooks: Book[]): Book[] {
  return allBooks.filter((book) => {
    const missingCover = !book.cover_path && !book.cover_url;
    const missingIsbn = !book.isbn10 || !book.isbn13;
    const missingDewey = !book.dewey_code;
    const missingArabic = !book.arabic_title;
    return missingCover || missingIsbn || missingDewey || missingArabic;
  });
}

export async function enrichBook(
  book: Book,
  opts: { groqApiKey?: string },
): Promise<{ patch: EnrichPatch; notes: string[] }> {
  const query = book.isbn13 || book.isbn10 || [book.title, book.author].filter(Boolean).join(" ");
  let meta;
  try {
    meta = await fetchBookMetadata(query);
  } catch {
    return { patch: {}, notes: ["No metadata match found from any source."] };
  }
  if (opts.groqApiKey) {
    meta = await enrichMetadataWithGroq(query, meta, opts.groqApiKey);
  }

  const patch: EnrichPatch = {};
  const notes: string[] = [];

  if (!book.isbn13 && meta.isbn13) patch.isbn13 = meta.isbn13;
  if (!book.isbn10 && meta.isbn10) patch.isbn10 = meta.isbn10;
  if (!book.dewey_code && meta.dewey_code) {
    patch.dewey_code = meta.dewey_code;
    notes.push("Dewey estimate filled from Open Library");
  }
  if (!book.arabic_title && meta.arabic_title) {
    patch.arabic_title = meta.arabic_title;
    notes.push("Arabic title filled from provider/Groq translation");
  }
  if (!book.cover_path && meta.cover_url) {
    patch.cover_path = await downloadCoverAsBase64(meta.cover_url);
  }
  return { patch, notes };
}

export async function enrichAllBooks(
  targetBooks: Book[],
  opts: { groqApiKey?: string },
  onProgress: (progress: EnrichProgress) => void,
  isCancelled: () => boolean,
): Promise<void> {
  for (const book of targetBooks) {
    if (isCancelled()) return;
    try {
      const { patch, notes } = await enrichBook(book, opts);
      if (Object.keys(patch).length > 0) {
        await updateBook(book.id, patch as Partial<Book>);
        onProgress({ book, status: "success", message: notes.join("; ") || "Record updated" });
      } else {
        onProgress({ book, status: "skipped", message: notes[0] || "Nothing to fill" });
      }
    } catch (error) {
      onProgress({ book, status: "error", message: String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}
