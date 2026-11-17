/**
 * Books and copies: catalog CRUD, metadata hygiene, copy lifecycle.
 */
import type { Book, Copy } from "../../types";
import { cleanAccession, cleanBarcode, cleanText } from "../../utils/isbn";
import { maybeOne, select, sqlExec, uid } from "../localDb";
import { audit, timestamp, upsertByName } from "./librarySqlShared";

export async function books(query = "", itemType = ""): Promise<Book[]> {
  const needle = `%${query.trim()}%`;
  const clauses: string[] = [`archived_at IS NULL`];
  const params: unknown[] = [];
  if (query.trim()) {
    clauses.push(
      `(title LIKE ? OR arabic_title LIKE ? OR subtitle LIKE ? OR isbn13 LIKE ? OR isbn10 LIKE ? OR author LIKE ?)`,
    );
    params.push(needle, needle, needle, needle, needle, needle);
  }
  if (itemType) {
    clauses.push(`item_type = ?`);
    params.push(itemType);
  }
  return select<Book>(
    `SELECT * FROM book_catalog WHERE ${clauses.join(" AND ")} ORDER BY title COLLATE NOCASE ASC`,
    params,
  );
}

export interface SaveBookInput
  extends Partial<Omit<Book, "id" | "created_at">> {
  author?: string;
  barcode?: string;
  accession?: string;
}

export async function saveBook(input: SaveBookInput): Promise<void> {
  const bookId = uid();
  const publisherId = input.publisher
    ? await upsertByName("publishers", input.publisher)
    : "";
  const categoryId = input.category
    ? await upsertByName("categories", input.category)
    : "";

  await sqlExec(
    `INSERT INTO books (id, item_type, title, subtitle, arabic_title, description, language, publication_year,
       isbn10, isbn13, call_number, dewey_code, publisher_id, category_id, tags, cover_path, cover_url, metadata, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'manual', ?, ?)`,
    [
      bookId,
      input.item_type ?? "book",
      cleanText(input.title ?? ""),
      input.subtitle ?? null,
      input.arabic_title ?? null,
      input.description ?? null,
      input.language || "فارسی",
      input.publication_year ?? null,
      input.isbn10 ?? null,
      input.isbn13 ?? null,
      input.call_number ?? null,
      input.dewey_code ?? null,
      publisherId || null,
      categoryId || null,
      input.tags ?? null,
      input.cover_path ?? null,
      input.cover_url ?? null,
      input.metadata ?? null,
      timestamp(),
      timestamp(),
    ],
  );

  if (input.author) {
    const authorId = await upsertByName("authors", input.author);
    if (authorId)
      await sqlExec(
        `INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)`,
        [bookId, authorId],
      );
  }
  if (input.tags) {
    for (const tag of input.tags
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)) {
      const tagId = await upsertByName("tags", tag);
      if (tagId)
        await sqlExec(
          `INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)`,
          [bookId, tagId],
        );
    }
  }

  // Optionally register the first physical copy alongside the title.
  if (input.barcode || input.accession) {
    let accession = cleanAccession(input.accession ?? "");
    let barcode = cleanBarcode(input.barcode ?? "");
    if (!accession) accession = `ACC-${uid().slice(0, 8).toUpperCase()}`;
    if (!barcode) barcode = `BAR-${accession}`;
    await sqlExec(
      `INSERT INTO copies (id, book_id, accession_number, barcode, condition, status, created_at, updated_at)
       VALUES (?,?,?,?, 'good', 'available', ?, ?)`,
      [uid(), bookId, accession, barcode, timestamp(), timestamp()],
    );
  }

  await audit("create", "book", bookId, { title: input.title });
}

export async function updateBook(
  bookId: string,
  input: Partial<Book> & { author?: string | null },
): Promise<void> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    params.push(value);
  };

  if (input.title !== undefined) assign("title", cleanText(input.title));
  if (input.subtitle !== undefined) assign("subtitle", input.subtitle);
  if (input.arabic_title !== undefined)
    assign("arabic_title", input.arabic_title);
  if (input.description !== undefined) assign("description", input.description);
  if (input.language !== undefined) assign("language", input.language);
  if (input.publication_year !== undefined)
    assign("publication_year", input.publication_year);
  if (input.isbn10 !== undefined) assign("isbn10", input.isbn10);
  if (input.isbn13 !== undefined) assign("isbn13", input.isbn13);
  if (input.call_number !== undefined) assign("call_number", input.call_number);
  if (input.dewey_code !== undefined) assign("dewey_code", input.dewey_code);
  if (input.tags !== undefined) assign("tags", input.tags);
  if (input.cover_path !== undefined) assign("cover_path", input.cover_path);
  if (input.cover_url !== undefined) assign("cover_url", input.cover_url);
  if (input.metadata !== undefined) assign("metadata", input.metadata);
  if (input.item_type !== undefined) assign("item_type", input.item_type);
  if (input.publisher !== undefined)
    assign(
      "publisher_id",
      input.publisher
        ? await upsertByName("publishers", input.publisher)
        : null,
    );
  if (input.category !== undefined)
    assign(
      "category_id",
      input.category ? await upsertByName("categories", input.category) : null,
    );

  if (input.author !== undefined) {
    await sqlExec(`DELETE FROM book_authors WHERE book_id = ?`, [bookId]);
    if (input.author) {
      const authorId = await upsertByName("authors", input.author);
      if (authorId)
        await sqlExec(
          `INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?, ?, 0)`,
          [bookId, authorId],
        );
    }
  }

  if (columns.length > 0) {
    columns.push(`updated_at = ?`);
    params.push(timestamp(), bookId);
    await sqlExec(
      `UPDATE books SET ${columns.join(", ")} WHERE id = ?`,
      params,
    );
  }
  await audit("update", "book", bookId, input);
}

export async function deleteBook(bookId: string): Promise<void> {
  const openLoans = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM loans l JOIN copies c ON c.id = l.copy_id
     WHERE c.book_id = ? AND l.returned_at IS NULL`,
    [bookId],
  );
  if ((openLoans?.n ?? 0) > 0) {
    throw new Error(
      "این عنوان نسخهٔ امانت‌داده‌شده دارد؛ ابتدا بازگشت آن را ثبت کنید.",
    );
  }
  await sqlExec(
    `UPDATE books SET archived_at = ?, updated_at = ? WHERE id = ?`,
    [timestamp(), timestamp(), bookId],
  );
  await sqlExec(
    `UPDATE copies SET status = 'archived', updated_at = ? WHERE book_id = ? AND status != 'archived'`,
    [timestamp(), bookId],
  );
  await audit("archive_book", "book", bookId, null);
}

/* ── Copies ──────────────────────────────────────────────────────────── */

export async function getCopiesForBook(bookId: string): Promise<Copy[]> {
  return select<Copy>(
    `SELECT * FROM copy_catalog WHERE book_id = ? AND status != 'archived' ORDER BY accession_number ASC`,
    [bookId],
  );
}

export async function copies(query = ""): Promise<
  (Copy & {
    title: string;
    item_type?: string;
    cover_path?: string | null;
    author?: string | null;
  })[]
> {
  const needle = `%${query.trim()}%`;
  if (query.trim()) {
    return select(
      `SELECT * FROM copy_catalog WHERE status != 'archived' AND (barcode LIKE ? OR accession_number LIKE ? OR title LIKE ?) ORDER BY barcode`,
      [needle, needle, needle],
    );
  }
  return select(
    `SELECT * FROM copy_catalog WHERE status != 'archived' ORDER BY barcode`,
  );
}

export async function addCopy(
  bookId: string,
  barcode: string,
  accessionNumber: string,
  condition: string,
  shelfId: string | null = null,
): Promise<void> {
  let accession = cleanAccession(accessionNumber);
  let code = cleanBarcode(barcode);

  if (!accession) accession = `ACC-${uid().slice(0, 8).toUpperCase()}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const clash = await maybeOne(
      `SELECT id FROM copies WHERE accession_number = ?`,
      [accession],
    );
    if (!clash) break;
    accession = `ACC-${uid().slice(0, 8).toUpperCase()}`;
  }
  if (!code) code = `BAR-${accession}`;
  const barcodeClash = await maybeOne(
    `SELECT id FROM copies WHERE barcode = ?`,
    [code],
  );
  if (barcodeClash) throw new Error("این بارکد قبلاً ثبت شده است.");

  await sqlExec(
    `INSERT INTO copies (id, book_id, accession_number, barcode, shelf_id, condition, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'available',?,?)`,
    [
      uid(),
      bookId,
      accession,
      code,
      shelfId,
      condition,
      timestamp(),
      timestamp(),
    ],
  );
  await audit("add_copy", "copy", bookId, { barcode: code, accession });
}

export async function updateCopy(
  copyId: string,
  updates: Partial<Copy> & { shelfId?: string | null },
): Promise<void> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    params.push(value);
  };

  if (updates.barcode !== undefined) {
    const code = cleanBarcode(updates.barcode);
    const clash = await maybeOne(
      `SELECT id FROM copies WHERE barcode = ? AND id != ?`,
      [code, copyId],
    );
    if (clash) throw new Error("این بارکد قبلاً ثبت شده است.");
    assign("barcode", code);
  }
  if (updates.accession_number !== undefined) {
    const accession = cleanAccession(updates.accession_number);
    const clash = await maybeOne(
      `SELECT id FROM copies WHERE accession_number = ? AND id != ?`,
      [accession, copyId],
    );
    if (clash) throw new Error("این شمارهٔ رجیستر قبلاً ثبت شده است.");
    assign("accession_number", accession);
  }
  if (updates.condition !== undefined) assign("condition", updates.condition);
  if (updates.status !== undefined) assign("status", updates.status);
  if (updates.shelfId !== undefined) assign("shelf_id", updates.shelfId);

  if (columns.length > 0) {
    columns.push(`updated_at = ?`);
    params.push(timestamp(), copyId);
    await sqlExec(
      `UPDATE copies SET ${columns.join(", ")} WHERE id = ?`,
      params,
    );
    await audit("update_copy", "copy", copyId, updates);
  }
}

export async function deleteCopy(copyId: string): Promise<void> {
  const openLoan = await maybeOne(
    `SELECT id FROM loans WHERE copy_id = ? AND returned_at IS NULL`,
    [copyId],
  );
  if (openLoan)
    throw new Error("این نسخه امانت است؛ ابتدا بازگشت آن را ثبت کنید.");
  await sqlExec(
    `UPDATE copies SET status = 'archived', updated_at = ? WHERE id = ?`,
    [timestamp(), copyId],
  );
  await audit("delete_copy", "copy", copyId, null);
}

/* ═════════════════════════════ Members ═══════════════════════════════ */
