import { currentActor } from "../../store/authStore";
import { select, exec, maybeOne, one, uid, nowIso } from "../localDb";
import type {
  Book, Copy, DashboardMetrics, Loan, Member, Reservation, Room, Column, Shelf,
  ReservationScope, AppNotification, LibrarySettings,
} from "../../types";
import {
  normalizeIsbn, cleanBarcode, cleanAccession,
  cleanPhone, cleanText, cleanMemberNumber, generateRandomMemberNumber,
} from "../../utils/isbn";

/**
 * KetabYar repository — the SAME public API Warraq exposed over Supabase/Postgres,
 * re-implemented on top of the fully-offline SQLite database (localDb + schema.ts).
 * All business rules were ported 1:1 from migrations 0003/0017/0019/0022, with
 * Koha-style overdue fines added on return, and the "single-copy items cannot
 * leave the building" rule relaxed for university circulation (theses circulate).
 */

const timestamp = nowIso;

async function audit(action: string, entityType: string, entityId: string, after: unknown) {
  await exec(
    `INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, after_json, created_at) VALUES (?,?,?,?,?,?,?)`,
    [uid(), currentActor(), action, entityType, entityId, after === null ? null : JSON.stringify(after), timestamp()],
  );
}

/** Finds a row by its unique `name` column, inserting one if it doesn't exist yet. */
async function upsertByName(table: "publishers" | "categories" | "authors" | "tags", name: string, extra: Record<string, unknown> = {}): Promise<string> {
  const existing = await maybeOne<{ id: string }>(`SELECT id FROM ${table} WHERE name = ?`, [name]);
  if (existing) return existing.id;
  const id = uid();
  await exec(`INSERT INTO ${table} (id, name, ${table === "authors" ? "normalized_name, " : ""}${Object.keys(extra).join(", ")}) VALUES (${["?", "?", ...Object.keys(extra).map(() => "?")].join(", ")})`,
    table === "authors" ? [id, name, name.toLocaleLowerCase(), ...Object.values(extra)] : [id, name, ...Object.values(extra)]);
  return id;
}

// ─────────────────────────────── Dashboard ───────────────────────────────

export async function dashboard(): Promise<DashboardMetrics> {
  const settings = await getLibrarySettings();
  const graceDays = settings.grace_period_enabled ? settings.grace_period_days : 0;
  const graceMs = graceDays * 86400000;
  const nowMs = Date.now();
  const overdueBefore = new Date(nowMs - graceMs).toISOString();
  const dueBefore = new Date(nowMs + settings.notify_due_soon_days * 86400000).toISOString();

  const [titles, copiesN, onLoan, membersN, overdue, ready, dueSoon] = await Promise.all([
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM books WHERE archived_at IS NULL`),
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE status != 'archived'`),
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE returned_at IS NULL`),
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM members WHERE status = 'active' AND archived_at IS NULL`),
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE returned_at IS NULL AND due_at < ?`, [overdueBefore]),
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'ready'`),
    maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ?`, [overdueBefore, dueBefore]),
  ]);

  const [recentLoans, overdueLoans, dueSoonLoans, departments] = await Promise.all([
    select<Loan>(`SELECT * FROM loan_details ORDER BY borrowed_at DESC LIMIT 5`),
    select<Loan>(`SELECT * FROM loan_details WHERE returned_at IS NULL AND due_at < ? ORDER BY due_at ASC LIMIT 5`, [overdueBefore]),
    select<Loan>(`SELECT * FROM loan_details WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ? ORDER BY due_at ASC LIMIT 10`, [overdueBefore, dueBefore]),
    select<{ name: string; count: number }>(
      `SELECT m.department AS name, COUNT(l.id) AS count FROM loans l JOIN members m ON m.id = l.member_id
       WHERE m.department IS NOT NULL AND m.department != '' GROUP BY m.department ORDER BY count DESC LIMIT 5`),
  ]);

  // Last 7 days of checkouts, one bucket per day (UTC day boundaries like the original).
  const activityRows = await select<{ day: string; count: number }>(
    `SELECT SUBSTR(borrowed_at, 1, 10) AS day, COUNT(*) AS count FROM loans
     WHERE borrowed_at >= ? GROUP BY SUBSTR(borrowed_at, 1, 10)`,
    [new Date(nowMs - 6 * 86400000).toISOString()]);
  const activityMap = new Map(activityRows.map((r) => [r.day, r.count]));
  const activity = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(nowMs - (6 - i) * 86400000);
    const day = d.toISOString().slice(0, 10);
    return { date: day, count: activityMap.get(day) ?? 0 };
  });

  // Today's circulation rhythm in 2-hour slots from 8:00 to 18:00.
  const todayLocal = new Date();
  const rhythmRows = await select<{ hour: number; checkouts: number; returns: number }>(
    `WITH b AS (SELECT CAST(SUBSTR(borrowed_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n FROM loans
                 WHERE borrowed_at >= ? GROUP BY hour),
          r AS (SELECT CAST(SUBSTR(returned_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n FROM loans
                 WHERE returned_at IS NOT NULL AND returned_at >= ? GROUP BY hour)
     SELECT 8 AS hour UNION ALL SELECT 10 UNION ALL SELECT 12 UNION ALL SELECT 14 UNION ALL SELECT 16 UNION ALL SELECT 18`,
    [todayLocal.toISOString().slice(0, 10), todayLocal.toISOString().slice(0, 10)]);
  const bMap = new Map<number, number>();
  const rMap = new Map<number, number>();
  for (const row of await select<{ hour: number; n: number }>(`SELECT CAST(SUBSTR(borrowed_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n FROM loans WHERE SUBSTR(borrowed_at, 1, 10) = ? GROUP BY hour`, [todayLocal.toISOString().slice(0, 10)])) bMap.set(row.hour, row.n);
  for (const row of await select<{ hour: number; n: number }>(`SELECT CAST(SUBSTR(returned_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n FROM loans WHERE returned_at IS NOT NULL AND SUBSTR(returned_at, 1, 10) = ? GROUP BY hour`, [todayLocal.toISOString().slice(0, 10)])) rMap.set(row.hour, row.n);
  void rhythmRows;
  const circulationRhythm = [8, 10, 12, 14, 16, 18].map((h) => ({
    time: `${h}:00`,
    checkouts: bMap.get(h) ?? 0,
    returns: rMap.get(h) ?? 0,
  }));

  return {
    titles: titles?.n ?? 0,
    copies: copiesN?.n ?? 0,
    onLoan: onLoan?.n ?? 0,
    members: membersN?.n ?? 0,
    overdue: overdue?.n ?? 0,
    readyReservations: ready?.n ?? 0,
    dueSoon: dueSoon?.n ?? 0,
    recentLoans,
    overdueLoans,
    dueSoonLoans,
    activity,
    activeDepartments: departments,
    circulationRhythm,
  };
}

// ─────────────────────────────── Books ───────────────────────────────

export async function books(query = "", itemType = ""): Promise<Book[]> {
  const filterType = itemType && itemType !== "All Items" && itemType !== "All" ? itemType : "";
  const term = query.trim();
  const clauses: string[] = [`archived_at IS NULL`];
  const params: unknown[] = [];
  if (filterType) { clauses.push(`item_type = ?`); params.push(filterType); }
  if (term) {
    clauses.push(`(title LIKE ? OR arabic_title LIKE ? OR subtitle LIKE ? OR isbn13 LIKE ? OR isbn10 LIKE ? OR author LIKE ?)`);
    const like = `%${term}%`;
    params.push(like, like, like, like, like, like);
  }
  const rows = await select<Book & { tag_list?: string | null }>(
    `SELECT * FROM book_catalog WHERE ${clauses.join(" AND ")} ORDER BY title COLLATE NOCASE`, params);
  return rows.map((r) => ({ ...r, tags: r.tag_list ?? null }));
}

export async function saveBook(input: Omit<Book, "id" | "created_at"> & { author?: string; barcode?: string; accession?: string }): Promise<void> {
  const title = cleanText(input.title);
  const itemType = input.item_type ? cleanText(String(input.item_type)) : "book";
  const subtitle = input.subtitle ? cleanText(input.subtitle) : null;
  const arabicTitle = input.arabic_title ? cleanText(input.arabic_title) : null;
  const author = input.author ? cleanText(input.author) : null;
  const publisher = input.publisher ? cleanText(input.publisher) : null;
  const category = input.category ? cleanText(input.category) : null;
  const barcode = input.barcode ? cleanBarcode(input.barcode) : null;
  const accession = input.accession ? cleanAccession(input.accession) : null;
  const description = input.description ? cleanText(input.description) : null;
  const tags = input.tags ? cleanText(input.tags) : null;
  const isbn10 = input.isbn10 ? normalizeIsbn(input.isbn10) : null;
  const isbn13 = input.isbn13 ? normalizeIsbn(input.isbn13) : null;
  const language = cleanText(input.language);
  const callNumber = input.call_number ? cleanText(input.call_number) : null;
  const deweyCode = input.dewey_code ? cleanText(input.dewey_code) : null;

  const publisherId = publisher ? await upsertByName("publishers", publisher) : null;
  const categoryId = category ? await upsertByName("categories", category) : null;

  const bookId = uid();
  await exec(
    `INSERT INTO books (id, item_type, isbn10, isbn13, title, subtitle, arabic_title, description, language,
       publisher_id, category_id, call_number, dewey_code, cover_path, cover_url, source, metadata, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [bookId, itemType, isbn10, isbn13, title, subtitle, arabicTitle, description, language,
      publisherId, categoryId, callNumber, deweyCode, input.cover_path ?? null, input.cover_url ?? null, "manual",
      input.metadata ? (typeof input.metadata === "string" ? input.metadata : JSON.stringify(input.metadata)) : null, timestamp(), timestamp()]);
  void bookId;

  if (author) {
    const authorId = await upsertByName("authors", author, { normalized_name: author.toLocaleLowerCase() });
    await exec(`INSERT OR IGNORE INTO book_authors (book_id, author_id, author_order) VALUES (?,?,0)`, [bookId, authorId]);
  }

  if (barcode || accession) {
    const finalAccession = await ensureUniqueAccession(accession);
    const finalBarcode = await ensureUniqueBarcode(barcode, finalAccession);
    await exec(`INSERT INTO copies (id, book_id, accession_number, barcode, status, condition, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      [uid(), bookId, finalAccession, finalBarcode, "available", "good", timestamp(), timestamp()]);
  }

  if (tags) {
    const tagNames = [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))];
    const colors = ["#FEE2E2", "#FEF3C7", "#D1FAE5", "#DBEAFE", "#E0E7FF", "#F3E8FF", "#FCE7F3"];
    for (const tagName of tagNames) {
      const tagId = await upsertByName("tags", tagName, { color: colors[Math.floor(Math.random() * colors.length)] });
      await exec(`INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?,?)`, [bookId, tagId]);
    }
  }

  await audit("create", "book", bookId, { title });
}

export async function updateBook(bookId: string, input: Partial<Book> & { author?: string }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (input.title !== undefined) patch.title = cleanText(input.title);
  if (input.item_type !== undefined) patch.item_type = cleanText(String(input.item_type));
  if (input.subtitle !== undefined) patch.subtitle = input.subtitle ? cleanText(input.subtitle) : null;
  if (input.arabic_title !== undefined) patch.arabic_title = input.arabic_title ? cleanText(input.arabic_title) : null;
  if (input.description !== undefined) patch.description = input.description ? cleanText(input.description) : null;
  if (input.language !== undefined) patch.language = cleanText(input.language);
  if (input.publication_year !== undefined) patch.publication_year = input.publication_year;
  if (input.call_number !== undefined) patch.call_number = input.call_number ? cleanText(input.call_number) : null;
  if (input.dewey_code !== undefined) patch.dewey_code = input.dewey_code ? cleanText(input.dewey_code) : null;
  if (input.isbn10 !== undefined) patch.isbn10 = input.isbn10 ? normalizeIsbn(input.isbn10) : null;
  if (input.isbn13 !== undefined) patch.isbn13 = input.isbn13 ? normalizeIsbn(input.isbn13) : null;
  if (input.cover_path !== undefined) patch.cover_path = input.cover_path;
  if (input.cover_url !== undefined) patch.cover_url = input.cover_url;
  if (input.metadata !== undefined) patch.metadata = typeof input.metadata === "string" ? input.metadata : JSON.stringify(input.metadata);
  if (input.publisher !== undefined) patch.publisher_id = input.publisher?.trim() ? await upsertByName("publishers", cleanText(input.publisher)) : null;
  if (input.category !== undefined) patch.category_id = input.category?.trim() ? await upsertByName("categories", cleanText(input.category)) : null;

  if (Object.keys(patch).length > 0) {
    const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
    await exec(`UPDATE books SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(patch), timestamp(), bookId]);
  }

  if (input.author !== undefined) {
    await exec(`DELETE FROM book_authors WHERE book_id = ?`, [bookId]);
    if (input.author.trim()) {
      const cleanAuth = cleanText(input.author);
      const authorId = await upsertByName("authors", cleanAuth, { normalized_name: cleanAuth.toLowerCase() });
      await exec(`INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?,?,0)`, [bookId, authorId]);
    }
  }

  if (input.tags !== undefined) {
    await exec(`DELETE FROM book_tags WHERE book_id = ?`, [bookId]);
    if (input.tags?.trim()) {
      const tagNames = [...new Set(cleanText(input.tags).split(",").map((t) => t.trim()).filter(Boolean))];
      const colors = ["#FEE2E2", "#FEF3C7", "#D1FAE5", "#DBEAFE", "#E0E7FF", "#F3E8FF", "#FCE7F3"];
      for (const tagName of tagNames) {
        const tagId = await upsertByName("tags", tagName, { color: colors[Math.floor(Math.random() * colors.length)] });
        await exec(`INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?,?)`, [bookId, tagId]);
      }
    }
  }

  await audit("update", "book", bookId, input);
}

export async function deleteBook(bookId: string): Promise<void> {
  const book = await one<{ title: string }>(`SELECT title FROM books WHERE id = ?`, [bookId]);
  const open = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM loans l JOIN copies c ON c.id = l.copy_id
     WHERE c.book_id = ? AND l.returned_at IS NULL`, [bookId]);
  if ((open?.n ?? 0) > 0) {
    throw new Error("این عنوان نسخه‌های امانت‌داری‌شده دارد. پیش از بایگانی، همهٔ نسخه‌ها باید بازگردانده شوند.");
  }
  await exec(`UPDATE books SET archived_at = ?, updated_at = ? WHERE id = ?`, [timestamp(), timestamp(), bookId]);
  await exec(`UPDATE copies SET status = 'archived', updated_at = ? WHERE book_id = ? AND status != 'archived'`, [timestamp(), bookId]);
  await audit("archive_book", "book", bookId, { title: book.title });
}

export async function getCopiesForBook(bookId: string): Promise<Copy[]> {
  return select<Copy>(`SELECT * FROM copy_catalog WHERE book_id = ? AND status != 'archived'`, [bookId]);
}

async function ensureUniqueBarcode(inputBarcode?: string | null, accessionNumber?: string | null, excludeCopyId?: string): Promise<string> {
  const cleanB = inputBarcode ? cleanBarcode(inputBarcode) : "";
  if (cleanB) {
    const row = excludeCopyId
      ? await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE barcode = ? AND id != ?`, [cleanB, excludeCopyId])
      : await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE barcode = ?`, [cleanB]);
    if (row) throw new Error(`نسخه‌ای با بارکد «${cleanB}» از قبل در سیستم ثبت شده است. بارکد تکراری مجاز نیست.`);
    return cleanB;
  }

  const baseAccession = accessionNumber ? cleanAccession(accessionNumber) : "";
  let baseBarcode = baseAccession ? `BAR-${baseAccession}` : `BAR-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  let found = await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE barcode = ?`, [baseBarcode]);
  let attempt = 0;
  while (found && attempt < 10) {
    baseBarcode = `BAR-${baseAccession || "CPY"}-${crypto.randomUUID().substring(0, 6).toUpperCase()}`;
    found = await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE barcode = ?`, [baseBarcode]);
    attempt++;
  }
  return baseBarcode;
}

async function ensureUniqueAccession(inputAccession?: string | null, excludeCopyId?: string): Promise<string> {
  const cleanA = inputAccession ? cleanAccession(inputAccession) : "";
  if (cleanA) {
    const row = excludeCopyId
      ? await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE accession_number = ? AND id != ?`, [cleanA, excludeCopyId])
      : await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE accession_number = ?`, [cleanA]);
    if (row) throw new Error(`نسخه‌ای با شماره دی‌سک «${cleanA}» از قبل ثبت شده است. شماره تکراری مجاز نیست.`);
    return cleanA;
  }
  let baseAccession = `ACC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
  let found = await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE accession_number = ?`, [baseAccession]);
  let attempt = 0;
  while (found && attempt < 10) {
    baseAccession = `ACC-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;
    found = await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE accession_number = ?`, [baseAccession]);
    attempt++;
  }
  return baseAccession;
}

export async function addCopy(bookId: string, barcode: string, accessionNumber: string, condition: string, shelfId?: string | null): Promise<void> {
  const finalAccession = await ensureUniqueAccession(accessionNumber);
  const finalBarcode = await ensureUniqueBarcode(barcode, finalAccession);
  const copyId = uid();
  await exec(`INSERT INTO copies (id, book_id, accession_number, barcode, shelf_id, status, condition, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [copyId, bookId, finalAccession, finalBarcode, shelfId ?? null, "available", condition, timestamp(), timestamp()]);
  const book = await one<{ title: string }>(`SELECT title FROM books WHERE id = ?`, [bookId]);
  await audit("add_copy", "copy", copyId, { book_title: book.title, barcode: finalBarcode, accession: finalAccession, condition });
}

export async function updateCopy(copyId: string, updates: Partial<Copy> & { shelfId?: string | null }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.condition !== undefined) patch.condition = updates.condition;
  if (updates.barcode) patch.barcode = await ensureUniqueBarcode(updates.barcode, undefined, copyId);
  if (updates.accession_number) patch.accession_number = await ensureUniqueAccession(updates.accession_number, copyId);
  if (updates.shelfId !== undefined) patch.shelf_id = updates.shelfId;

  if (Object.keys(patch).length > 0) {
    const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
    await exec(`UPDATE copies SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(patch), timestamp(), copyId]);
  }
  await audit("update_copy", "copy", copyId, updates);
}

export async function deleteCopy(copyId: string): Promise<void> {
  const copy = await one<{ barcode: string; accession_number: string }>(`SELECT barcode, accession_number FROM copies WHERE id = ?`, [copyId]);
  const open = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE copy_id = ? AND returned_at IS NULL`, [copyId]);
  if ((open?.n ?? 0) > 0) {
    throw new Error("این نسخه در حال حاضر امانت است. پیش از بایگانی باید بازگردانده شود.");
  }
  await exec(`UPDATE copies SET status = 'archived', updated_at = ? WHERE id = ?`, [timestamp(), copyId]);
  await audit("delete_copy", "copy", copyId, { barcode: copy.barcode, accession: copy.accession_number });
}

export async function copies(query = ""): Promise<(Copy & { title: string; item_type?: string; metadata?: string | null; cover_path?: string | null; author?: string | null })[]> {
  const term = query.trim();
  if (!term) return select(`SELECT * FROM copy_catalog ORDER BY title COLLATE NOCASE`);
  const like = `%${term}%`;
  return select(
    `SELECT * FROM copy_catalog WHERE barcode LIKE ? OR accession_number LIKE ? OR title LIKE ? ORDER BY title COLLATE NOCASE`,
    [like, like, like]);
}

// ─────────────────────────────── Members ───────────────────────────────

function mapMember<T extends Record<string, unknown>>(row: T): Member {
  return { ...row, reservation_banned: !!row.reservation_banned } as unknown as Member;
}

export async function members(query = ""): Promise<Member[]> {
  const term = query.trim();
  let sql = `SELECT * FROM members WHERE archived_at IS NULL`;
  const params: unknown[] = [];
  if (term) {
    const like = `%${term}%`;
    sql += ` AND (full_name LIKE ? OR member_number LIKE ? OR email LIKE ? OR department LIKE ?)`;
    params.push(like, like, like, like);
  }
  sql += ` ORDER BY full_name COLLATE NOCASE`;
  const rows = await select<Record<string, unknown>>(sql, params);
  return rows.map(mapMember);
}

export async function saveMember(input: Omit<Member, "id" | "member_number" | "joined_at"> & { member_number?: string }): Promise<Member> {
  const memberNumber = input.member_number?.trim() ? cleanMemberNumber(input.member_number) : generateRandomMemberNumber(6);
  const fullName = cleanText(input.full_name);
  const email = input.email ? cleanText(input.email) : null;
  const phone = input.phone ? cleanPhone(input.phone) : null;
  const department = input.department ? cleanText(input.department) : null;
  const role = input.role ? cleanText(String(input.role)) : "visitor";
  const id = uid();

  // member_number is UNIQUE — retry a few times if the random generator collides.
  let attempt = 0;
  for (;;) {
    try {
      await exec(
        `INSERT INTO members (id, member_number, full_name, email, phone, department, role, status, expiry_date, avatar_path, joined_at, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, attempt === 0 ? memberNumber : generateRandomMemberNumber(6), fullName, email, phone, department, role,
          input.status ?? "active", input.expiry_date ?? null, input.avatar_path ?? null, timestamp(), timestamp(), timestamp()]);
      break;
    } catch (e) {
      attempt++;
      if (attempt >= 5 || String(e).indexOf("member_number") === -1) throw e;
    }
  }

  const row = await one<Record<string, unknown>>(`SELECT * FROM members WHERE id = ?`, [id]);
  const member = mapMember(row);
  await audit("create_member", "member", id, { full_name: fullName, member_number: member.member_number, role, department });
  return member;
}

export async function updateMember(memberId: string, updates: Partial<Member>): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.full_name !== undefined) patch.full_name = cleanText(updates.full_name);
  if (updates.email !== undefined) patch.email = updates.email ? cleanText(updates.email) : null;
  if (updates.phone !== undefined) patch.phone = updates.phone ? cleanPhone(updates.phone) : null;
  if (updates.department !== undefined) patch.department = updates.department ? cleanText(updates.department) : null;
  if (updates.role !== undefined) patch.role = updates.role ? cleanText(String(updates.role)) : null;
  if (updates.status !== undefined) patch.status = updates.status;
  if (updates.expiry_date !== undefined) patch.expiry_date = updates.expiry_date;
  if (updates.avatar_path !== undefined) patch.avatar_path = updates.avatar_path;
  if (updates.reservation_banned !== undefined) patch.reservation_banned = updates.reservation_banned ? 1 : 0;
  if (updates.ban_reason !== undefined) patch.ban_reason = updates.ban_reason;

  if (Object.keys(patch).length > 0) {
    const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
    await exec(`UPDATE members SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(patch), timestamp(), memberId]);
  }
  await audit("update_member", "member", memberId, updates);
}

export async function deleteMember(memberId: string): Promise<void> {
  const member = await one<{ full_name: string; member_number: string }>(`SELECT full_name, member_number FROM members WHERE id = ?`, [memberId]);
  const open = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL`, [memberId]);
  if ((open?.n ?? 0) > 0) {
    throw new Error("این عضو نسخه‌های امانت‌داری‌شده دارد. ابتدا همهٔ موارد باید بازگردانده شوند.");
  }
  await exec(`UPDATE reservations SET status = 'cancelled' WHERE member_id = ? AND status IN ('queued','ready','pending')`, [memberId]);
  await exec(`UPDATE members SET archived_at = ?, status = 'archived', updated_at = ? WHERE id = ?`, [timestamp(), timestamp(), memberId]);
  await audit("archive_member", "member", memberId, { full_name: member.full_name, member_number: member.member_number });
}

export async function hardDeleteMember(memberId: string): Promise<void> {
  const member = await one<{ full_name: string; member_number: string }>(`SELECT full_name, member_number FROM members WHERE id = ?`, [memberId]);
  const any = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE member_id = ?`, [memberId]);
  if ((any?.n ?? 0) > 0) {
    throw new Error("این عضو سابقهٔ امانت دارد و نمی‌توان او را برای همیشه حذف کرد. از بایگانی استفاده کنید.");
  }
  await exec(`DELETE FROM reservations WHERE member_id = ?`, [memberId]);
  await exec(`DELETE FROM fines WHERE member_id = ?`, [memberId]);
  await exec(`DELETE FROM members WHERE id = ?`, [memberId]);
  await audit("delete_member_permanent", "member", memberId, { full_name: member.full_name, member_number: member.member_number });
}

export async function banMember(memberId: string, reason: string): Promise<void> {
  await exec(`UPDATE members SET reservation_banned = 1, ban_reason = ?, banned_at = ?, updated_at = ? WHERE id = ?`,
    [reason, timestamp(), timestamp(), memberId]);
  await audit("ban_member", "member", memberId, { reason });
}

export async function unbanMember(memberId: string): Promise<void> {
  await exec(`UPDATE members SET reservation_banned = 0, ban_reason = NULL, banned_at = NULL, updated_at = ? WHERE id = ?`,
    [timestamp(), memberId]);
  await audit("unban_member", "member", memberId, {});
}

// ─────────────────────────────── Circulation ───────────────────────────────

export async function loans(openOnly = false): Promise<Loan[]> {
  const sql = openOnly
    ? `SELECT * FROM loan_details WHERE returned_at IS NULL ORDER BY borrowed_at DESC`
    : `SELECT * FROM loan_details ORDER BY borrowed_at DESC`;
  return select<Loan>(sql);
}

export async function getLoansForMember(memberId: string): Promise<Loan[]> {
  return select<Loan>(`SELECT * FROM loan_details WHERE member_id = ? ORDER BY borrowed_at DESC`, [memberId]);
}

export async function getReservationsForMember(memberId: string): Promise<Reservation[]> {
  return select<Reservation>(`SELECT * FROM reservation_details WHERE member_id = ? ORDER BY requested_at DESC`, [memberId]);
}

/** Core checkout rule (port of migration 0003/0019 `checkout()`), minus the hospital-only single-copy restriction. */
async function checkoutOne(copyId: string, memberId: string, scope: ReservationScope): Promise<void> {
  const member = await maybeOne<Record<string, unknown>>(`SELECT * FROM members WHERE id = ?`, [memberId]);
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.status !== "active") throw new Error("این عضو فعال نیست.");
  if (member.reservation_banned && scope === "external") throw new Error("این عضو از امانت بیرون‌بر محروم است.");

  const copy = await maybeOne<Record<string, unknown>>(`SELECT * FROM copies WHERE id = ?`, [copyId]);
  if (!copy) throw new Error("نسخه یافت نشد.");
  if (copy.status !== "available") throw new Error("این نسخه در دسترس نیست.");

  if (scope === "external" && member.role === "visitor") {
    throw new Error("مهمانان اجازهٔ امانت بیرون‌بر ندارند.");
  }

  const settings = await getLibrarySettings();
  if (scope === "external") {
    const open = await maybeOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'`, [memberId]);
    if ((open?.n ?? 0) >= settings.loan_limit) {
      throw new Error(`این عضو به سقف امانت (${settings.loan_limit} مورد) رسیده است.`);
    }
  }

  const days = scope === "internal" ? settings.reservation_internal_days : settings.loan_days;
  const dueAt = new Date(Date.now() + days * 86400000).toISOString();
  const loanId = uid();
  await exec(
    `INSERT INTO loans (id, copy_id, member_id, scope, borrowed_at, due_at, issued_by, condition_out)
     VALUES (?,?,?,?,?,?,?,?)`,
    [loanId, copyId, memberId, scope, timestamp(), dueAt, currentActor(), (copy.condition as string) ?? null]);
  await exec(`UPDATE copies SET status = 'on-loan', updated_at = ? WHERE id = ?`, [timestamp(), copyId]);
  await audit("checkout", "loan", loanId, { copy_id: copyId, member_id: memberId, due_at: dueAt });
}

/** Direct-desk checkout (no reservation involved). Loan duration comes from library_settings. */
export async function checkout(memberId: string, copyIds: string[], limit: number, scope: ReservationScope = "external"): Promise<void> {
  if (copyIds.length === 0) return;
  const open = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'`, [memberId]);
  if ((open?.n ?? 0) + copyIds.length > limit) throw new Error(`سقف امانت ${limit} مورد رعایت نشده است.`);
  for (const copyId of copyIds) {
    await checkoutOne(copyId, memberId, scope);
  }
  void limit;
}

/** Promotes the oldest queued reservation(s) onto available copies (port of advance_reservation_queue). */
async function advanceReservationQueue(bookId: string | null): Promise<void> {
  const settings = await getLibrarySettings();
  const holdMs = settings.reservation_hold_days * 86400000;
  const copiesRows = await select<{ id: string; book_id: string }>(
    `SELECT id, book_id FROM copies WHERE status = 'available' ${bookId ? `AND book_id = ?` : ""}`, bookId ? [bookId] : []);
  for (const c of copiesRows) {
    const next = await maybeOne<{ id: string }>(
      `SELECT id FROM reservations WHERE book_id = ? AND status = 'queued' ORDER BY position ASC, requested_at ASC LIMIT 1`, [c.book_id]);
    if (!next) continue;
    const expiresAt = new Date(Date.now() + holdMs).toISOString();
    await exec(`UPDATE reservations SET status = 'ready', copy_id = ?, expires_at = ? WHERE id = ?`, [c.id, expiresAt, next.id]);
    await exec(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [timestamp(), c.id]);
    await insertNotification("reservation_ready", next.id);
  }
}

async function insertNotification(type: "reservation_ready" | "system", entityId: string) {
  const n = await one<{ title: string; member_name: string }>(
    `SELECT (SELECT title FROM books WHERE id = (SELECT book_id FROM reservations WHERE id = ?)) AS title,
            (SELECT full_name FROM members WHERE id = (SELECT member_id FROM reservations WHERE id = ?)) AS member_name`,
    [entityId, entityId]);
  await exec(
    `INSERT INTO notifications (id, type, title, body, link, entity_type, entity_id, is_read, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [uid(), type, n.title ?? "رزرو آمادهٔ تحویل", n.member_name ?? "", "/reservations", "reservation", entityId, 0, timestamp()]);
}

/** Computes and records the overdue fine for a returned loan (Koha-style daily fine + grace period + cap). */
async function chargeOverdueFine(loan: { id: string; member_id: string; due_at: string }): Promise<void> {
  const settings = await getLibrarySettings();
  if (!settings.fines_enabled) return;
  const grace = settings.grace_period_enabled ? settings.grace_period_days : 0;
  const daysLateRaw = Math.floor((Date.now() - new Date(loan.due_at).getTime()) / 86400000);
  const daysLate = Math.max(0, daysLateRaw - grace);
  if (daysLate <= 0 || settings.fine_per_day <= 0) return;
  const already = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM fines WHERE loan_id = ?`, [loan.id]);
  if ((already?.n ?? 0) > 0) return;
  const amount = Math.min(daysLate * settings.fine_per_day, settings.max_fine_amount > 0 ? settings.max_fine_amount : daysLate * settings.fine_per_day);
  await exec(
    `INSERT INTO fines (id, loan_id, member_id, amount, reason, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    [uid(), loan.id, loan.member_id, amount, `تاخیر ${daysLate} روزه در بازگشت`, "open", timestamp(), timestamp()]);
}

export async function returnCopies(copyIds: string[]): Promise<void> {
  if (copyIds.length === 0) return;
  for (const copyId of copyIds) {
    const loan = await maybeOne<Loan>(`SELECT * FROM loans WHERE copy_id = ? AND returned_at IS NULL`, [copyId]);
    if (!loan) continue;
    await exec(`UPDATE loans SET returned_at = ?, received_by = ?, condition_in = condition_out WHERE id = ?`,
      [timestamp(), currentActor(), loan.id]);
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`, [timestamp(), copyId]);
    await chargeOverdueFine({ id: loan.id, member_id: loan.member_id, due_at: loan.due_at });
    const copy = await maybeOne<{ book_id: string }>(`SELECT book_id FROM copies WHERE id = ?`, [copyId]);
    if (copy) await advanceReservationQueue(copy.book_id);
    await audit("return", "loan", loan.id, { copy_id: copyId });
  }
}

export async function renewLoan(loanId: string): Promise<void> {
  const loan = await maybeOne<Loan>(`SELECT * FROM loans WHERE id = ?`, [loanId]);
  if (!loan) throw new Error("امانت یافت نشد.");
  if (loan.returned_at) throw new Error("این امانت قبلاً بازگردانده شده است.");
  const settings = await getLibrarySettings();
  if (loan.renewed_count >= settings.renew_limit) {
    throw new Error(`سقف تمدید (${settings.renew_limit} بار) پر شده است.`);
  }
  const days = loan.scope === "internal" ? settings.reservation_internal_days : settings.loan_days;
  const base = Math.max(new Date(loan.due_at).getTime(), Date.now());
  const newDue = new Date(base + days * 86400000).toISOString();
  await exec(`UPDATE loans SET due_at = ?, renewed_count = renewed_count + 1 WHERE id = ?`, [newDue, loanId]);
  await audit("renew", "loan", loanId, { due_at: newDue });
}

export async function updateLoanDueDate(loanId: string, dueAt: string): Promise<void> {
  await exec(`UPDATE loans SET due_at = ? WHERE id = ?`, [dueAt, loanId]);
  await audit("update_loan_due", "loan", loanId, { due_at: dueAt });
}

// ─────────────────────────────── Reservations ───────────────────────────────

export async function sweepReservations(): Promise<void> {
  const expired = await select<{ id: string; copy_id: string | null }>(
    `SELECT id, copy_id FROM reservations WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at < ?`,
    [timestamp()]);
  for (const res of expired) {
    await exec(`UPDATE reservations SET status = 'expired' WHERE id = ?`, [res.id]);
    if (res.copy_id) {
      await exec(
        `UPDATE copies SET status = 'available', updated_at = ?
         WHERE id = ? AND status = 'reserved'
           AND NOT EXISTS (SELECT 1 FROM reservations WHERE copy_id = ? AND status = 'ready')`,
        [timestamp(), res.copy_id, res.copy_id]);
    }
    await audit("expire_reservation", "reservation", res.id, {});
  }
  const hasQueue = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'queued'`);
  if ((hasQueue?.n ?? 0) > 0) await advanceReservationQueue(null);
}

export async function reservations(): Promise<Reservation[]> {
  await sweepReservations();
  return select<Reservation>(`SELECT * FROM reservation_details ORDER BY requested_at DESC`);
}

export async function addReservation(bookId: string, memberId: string, scope: ReservationScope, expiresAt?: string | null): Promise<string> {
  const member = await maybeOne<Record<string, unknown>>(`SELECT * FROM members WHERE id = ?`, [memberId]);
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.reservation_banned) throw new Error("این عضو از رزرو محروم است.");
  const id = uid();
  await exec(
    `INSERT INTO reservations (id, book_id, member_id, scope, status, position, requested_at, expires_at) VALUES (?,?,?,?,?,0,?,?)`,
    [id, bookId, memberId, scope, "pending", timestamp(), expiresAt ?? null]);
  const book = await maybeOne<{ title: string }>(`SELECT title FROM books WHERE id = ?`, [bookId]);
  const m = member as { full_name: string };
  await audit("create_reservation", "reservation", id, { book_title: book?.title, member_name: m.full_name, scope });
  return id;
}

export async function acceptReservation(reservationId: string, reason?: string | null): Promise<Reservation> {
  const res = await maybeOne<Record<string, unknown>>(`SELECT * FROM reservations WHERE id = ?`, [reservationId]);
  if (!res) throw new Error("رزرو یافت نشد.");
  if (res.status !== "pending") throw new Error("این رزرو در وضعیت در انتظار نیست.");
  const settings = await getLibrarySettings();
  const copy = await maybeOne<{ id: string }>(`SELECT id FROM copies WHERE book_id = ? AND status = 'available' LIMIT 1`, [res.book_id]);
  if (copy) {
    const expiresAt = new Date(Date.now() + settings.reservation_hold_days * 86400000).toISOString();
    await exec(
      `UPDATE reservations SET status = 'ready', copy_id = ?, reserved_at = ?, expires_at = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
      [copy.id, timestamp(), expiresAt, currentActor(), timestamp(), reason ?? null, reservationId]);
    await exec(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [timestamp(), copy.id]);
    await insertNotification("reservation_ready", reservationId);
  } else {
    const maxPos = await maybeOne<{ p: number }>(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM reservations WHERE book_id = ? AND status = 'queued'`, [res.book_id]);
    await exec(
      `UPDATE reservations SET status = 'queued', position = ?, reserved_at = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
      [maxPos?.p ?? 1, timestamp(), currentActor(), timestamp(), reason ?? null, reservationId]);
  }
  await audit("accept_reservation", "reservation", reservationId, { reason });
  return one<Reservation>(`SELECT * FROM reservation_details WHERE id = ?`, [reservationId]);
}

export async function declineReservation(reservationId: string, reason?: string | null): Promise<Reservation> {
  const res = await maybeOne<Record<string, unknown>>(`SELECT * FROM reservations WHERE id = ?`, [reservationId]);
  if (!res || !["pending", "queued", "ready"].includes(String(res.status))) {
    throw new Error("رزرو یافت نشد یا قبلاً تصمیم‌گیری شده است.");
  }
  await exec(
    `UPDATE reservations SET status = 'declined', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
    [currentActor(), timestamp(), reason ?? null, reservationId]);
  if (res.copy_id) {
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`, [timestamp(), res.copy_id]);
    const bookId = await maybeOne<{ book_id: string }>(`SELECT book_id FROM reservations WHERE id = ?`, [reservationId]);
    if (bookId) await advanceReservationQueue(bookId.book_id);
  }
  await audit("decline_reservation", "reservation", reservationId, { reason });
  return one<Reservation>(`SELECT * FROM reservation_details WHERE id = ?`, [reservationId]);
}

export async function fulfilReservation(reservationId: string): Promise<Loan> {
  const res = await maybeOne<Record<string, unknown>>(`SELECT * FROM reservations WHERE id = ?`, [reservationId]);
  if (!res || res.status !== "ready" || !res.copy_id) throw new Error("این رزرو آمادهٔ تحویل نیست.");
  // The held copy sits in 'reserved' status — free it first so checkoutOne passes
  // (port of upstream migration 0020 fix_fulfil_reservation_copy_status).
  await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), String(res.copy_id)]);
  await checkoutOne(String(res.copy_id), String(res.member_id), res.scope as ReservationScope);
  await exec(`UPDATE reservations SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?`, [timestamp(), reservationId]);
  await audit("fulfil_reservation", "reservation", reservationId, {});
  const loan = await one<Loan>(`SELECT * FROM loan_details WHERE copy_id = ? AND returned_at IS NULL ORDER BY borrowed_at DESC LIMIT 1`, [res.copy_id]);
  return loan;
}

export async function extendReservation(reservationId: string, days = 7): Promise<void> {
  const res = await maybeOne<{ expires_at: string | null }>(`SELECT expires_at FROM reservations WHERE id = ?`, [reservationId]);
  const current = res?.expires_at ? new Date(res.expires_at).getTime() : Date.now();
  const base = current > Date.now() ? current : Date.now();
  const newExpires = new Date(base + days * 86400000).toISOString();
  await exec(`UPDATE reservations SET expires_at = ? WHERE id = ?`, [newExpires, reservationId]);
  await audit("extend_reservation", "reservation", reservationId, { extended_days: days, new_expires: newExpires });
}

export async function updateReservation(reservationId: string, patch: { expiresAt?: string | null; scope?: ReservationScope }): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.expiresAt !== undefined) update.expires_at = patch.expiresAt;
  if (patch.scope !== undefined) update.scope = patch.scope;
  if (Object.keys(update).length === 0) return;
  const sets = Object.keys(update).map((k) => `${k} = ?`).join(", ");
  await exec(`UPDATE reservations SET ${sets} WHERE id = ?`, [...Object.values(update), reservationId]);
  await audit("update_reservation", "reservation", reservationId, update);
}

export async function cancelReservation(reservationId: string): Promise<void> {
  const res = await maybeOne<{ copy_id: string | null; book_id: string }>(`SELECT copy_id, book_id FROM reservations WHERE id = ?`, [reservationId]);
  await exec(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`, [reservationId]);
  if (res?.copy_id) {
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), res.copy_id]);
    await advanceReservationQueue(res.book_id);
  }
  await audit("cancel_reservation", "reservation", reservationId, { status: "cancelled" });
}

export async function deleteReservation(reservationId: string): Promise<void> {
  await exec(`DELETE FROM reservations WHERE id = ?`, [reservationId]);
  await audit("delete_reservation", "reservation", reservationId, { status: "deleted" });
}

// ─────────────────────────────── Fines ───────────────────────────────

export interface FineRow {
  id: string; loan_id: string; member_id: string; amount: number; reason: string;
  status: "open" | "paid" | "waived"; waived_reason?: string | null; paid_at?: string | null;
  created_at: string;
  member_name?: string; member_number?: string; title?: string; barcode?: string;
  due_at?: string; returned_at?: string;
}

export async function fines(): Promise<FineRow[]> {
  return select<FineRow>(
    `SELECT f.*, m.full_name AS member_name, m.member_number, b.title, c.barcode, l.due_at, l.returned_at
     FROM fines f
     JOIN members m ON m.id = f.member_id
     JOIN loans l ON l.id = f.loan_id
     JOIN copies c ON c.id = l.copy_id
     JOIN books b ON b.id = c.book_id
     ORDER BY f.created_at DESC`);
}

export async function payFine(fineId: string): Promise<void> {
  await exec(`UPDATE fines SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`, [timestamp(), timestamp(), fineId]);
  await audit("pay_fine", "fine", fineId, {});
}

export async function waiveFine(fineId: string, reason: string): Promise<void> {
  await exec(`UPDATE fines SET status = 'waived', waived_reason = ?, updated_at = ? WHERE id = ?`, [reason, timestamp(), fineId]);
  await audit("waive_fine", "fine", fineId, { reason });
}

// ─────────────────────────────── Rooms / Columns / Shelves ───────────────────────────────

export async function getRooms(): Promise<Room[]> {
  return select<Room>(`SELECT * FROM rooms ORDER BY name COLLATE NOCASE`);
}

export async function createRoom(name: string, notes?: string | null): Promise<Room> {
  const id = uid();
  await exec(`INSERT INTO rooms (id, name, notes, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [id, cleanText(name), notes ? cleanText(notes) : null, timestamp(), timestamp()]);
  await audit("create_room", "room", id, { name });
  return one<Room>(`SELECT * FROM rooms WHERE id = ?`, [id]);
}

export async function renameRoom(roomId: string, newName: string): Promise<void> {
  if (!newName.trim()) throw new Error("نام اتاق نمی‌تواند خالی باشد.");
  await exec(`UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?`, [cleanText(newName), timestamp(), roomId]);
  await audit("rename_room", "room", roomId, { name: newName });
}

export async function deleteRoom(roomId: string): Promise<void> {
  const shelfIds = (await select<{ id: string }>(`SELECT s.id FROM shelves s JOIN columns c ON c.id = s.column_id WHERE c.room_id = ?`, [roomId])).map((s) => s.id);
  if (shelfIds.length > 0) {
    const placeholders = shelfIds.map(() => "?").join(",");
    const used = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE shelf_id IN (${placeholders}) AND status != 'archived'`, shelfIds);
    if ((used?.n ?? 0) > 0) {
      throw new Error("این اتاق همچنان نسخهٔ نگهداری‌شده دارد. ابتدا نسخه‌ها را جابه‌جا یا بایگانی کنید.");
    }
  }
  await exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
  await audit("delete_room", "room", roomId, {});
}

export async function getColumns(): Promise<Column[]> {
  return select<Column>(`SELECT * FROM columns ORDER BY room_id, number`);
}

export async function createColumn(roomId: string, rows: string[]): Promise<string> {
  if (!rows || rows.length === 0) throw new Error("حداقل یک ردیف (A تا F) برای قفسه انتخاب کنید.");
  for (const row of rows) {
    if (!["A", "B", "C", "D", "E", "F"].includes(row)) throw new Error(`کد ردیف نامعتبر است: ${row}`);
  }
  const maxN = await maybeOne<{ m: number }>(`SELECT COALESCE(MAX(number), 0) AS m FROM columns WHERE room_id = ?`, [roomId]);
  const number = (maxN?.m ?? 0) + 1;
  const id = uid();
  await exec(`INSERT INTO columns (id, room_id, number, created_at, updated_at) VALUES (?,?,?,?,?)`, [id, roomId, number, timestamp(), timestamp()]);
  await exec(`INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [uid(), id, "floor", "S", 120, timestamp(), timestamp()]);
  for (const row of rows) {
    await exec(`INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [uid(), id, "top", row, 40, timestamp(), timestamp()]);
  }
  await audit("create_column", "column", id, { room_id: roomId, rows });
  return id;
}

export async function deleteColumn(columnId: string): Promise<void> {
  const shelfIds = (await select<{ id: string }>(`SELECT id FROM shelves WHERE column_id = ?`, [columnId])).map((s) => s.id);
  if (shelfIds.length > 0) {
    const placeholders = shelfIds.map(() => "?").join(",");
    const used = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE shelf_id IN (${placeholders}) AND status != 'archived'`, shelfIds);
    if ((used?.n ?? 0) > 0) {
      throw new Error("این قفسهٔ کتاب‌چین همچنان نسخه دارد. ابتدا نسخه‌ها را جابه‌جا یا بایگانی کنید.");
    }
  }
  await exec(`DELETE FROM columns WHERE id = ?`, [columnId]);
  await audit("delete_column", "column", columnId, {});
}

export async function getShelves(): Promise<Shelf[]> {
  return select<Shelf>(`SELECT * FROM shelf_overview ORDER BY room COLLATE NOCASE, column_number, shelf_type DESC, code`);
}

export async function createShelf(columnId: string, code: string, shelfType: "top" | "floor" = "top", capacity = shelfType === "floor" ? 120 : 40): Promise<string> {
  const id = uid();
  await exec(`INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [id, columnId, shelfType, code.toUpperCase(), capacity, timestamp(), timestamp()]);
  await audit("create_shelf", "shelf", id, { column_id: columnId, code, shelf_type: shelfType, capacity });
  return id;
}

export async function updateShelf(shelfId: string, updates: { capacity?: number; notes?: string | null }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (updates.capacity !== undefined) patch.capacity = updates.capacity;
  if (updates.notes !== undefined) patch.notes = updates.notes ? cleanText(updates.notes) : null;
  if (Object.keys(patch).length === 0) return;
  const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
  await exec(`UPDATE shelves SET ${sets}, updated_at = ? WHERE id = ?`, [...Object.values(patch), timestamp(), shelfId]);
  await audit("update_shelf", "shelf", shelfId, updates);
}

// ─────────────────────────────── Notifications ───────────────────────────────

function mapNotification<T extends Record<string, unknown>>(row: T): AppNotification {
  return { ...row, is_read: !!row.is_read } as unknown as AppNotification;
}

export async function notifications(limit = 100): Promise<AppNotification[]> {
  const rows = await select<Record<string, unknown>>(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`, [limit]);
  return rows.map(mapNotification);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const res = await exec(`UPDATE notifications SET is_read = 1 WHERE id = ?`, [notificationId]);
  if (res.rowsAffected === 0) throw new Error("اعلان پیدا نشد یا قبلاً خوانده شده است.");
}

export async function markAllNotificationsRead(): Promise<void> {
  await exec(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`);
}

// ─────────────────────────────── Audit ───────────────────────────────

export async function auditLog(limit = 500) {
  return select(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?`, [limit]);
}

// ─────────────────────────────── Backup / Restore ───────────────────────────────

const BACKUP_TABLES = [
  "rooms", "columns", "shelves", "publishers", "categories", "authors", "tags",
  "members", "books", "book_authors", "book_tags", "copies", "reservations", "loans", "fines",
] as const;

const BACKUP_TABLE_KEYS: Partial<Record<(typeof BACKUP_TABLES)[number], string>> = {
  book_authors: "book_id,author_id",
  book_tags: "book_id,tag_id",
};

export interface LibraryBackup {
  _version: 1;
  _exported_at: string;
  tables: Partial<Record<(typeof BACKUP_TABLES)[number], unknown[]>>;
}

export async function exportLibraryBackup(): Promise<LibraryBackup> {
  const tables: LibraryBackup["tables"] = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await select(`SELECT * FROM ${table}`);
  }
  return { _version: 1, _exported_at: timestamp(), tables };
}

export async function importLibraryBackup(backup: LibraryBackup): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables?.[table];
    if (!Array.isArray(rows) || rows.length === 0) { counts[table] = 0; continue; }
    const cols = rows.length > 0 ? Object.keys(rows[0] as Record<string, unknown>) : [];
    if (cols.length === 0) { counts[table] = 0; continue; }
    const key = BACKUP_TABLE_KEYS[table] ?? "id";
    const keyCols = key.split(",");
    // excluded.* keeps the upsert to exactly the INSERT's parameter count —
    // the previous value-keyed form under-parameterised the DO UPDATE clause.
    const updateSet = cols.filter((c) => !keyCols.includes(c)).map((c) => `${c} = excluded.${c}`).join(", ");
    for (const row of rows as Record<string, unknown>[]) {
      const values = cols.map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === "object") return JSON.stringify(v);
        if (typeof v === "boolean") return v ? 1 : 0;
        return v;
      });
      if (updateSet) {
        await exec(
          `INSERT INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})
           ON CONFLICT(${key}) DO UPDATE SET ${updateSet}`,
          values,
        );
      } else {
        await exec(
          `INSERT OR IGNORE INTO ${table} (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
          values,
        );
      }
    }
    counts[table] = rows.length;
  }
  await audit("import_backup", "library", "backup", counts);
  return counts;
}

export async function deleteAllLibraryData(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of [...BACKUP_TABLES].reverse()) {
    const n = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    await exec(`DELETE FROM ${table}`);
    counts[table] = n?.n ?? 0;
  }
  await exec(`DELETE FROM notifications`);
  await audit("delete_all_library_data", "library", "wipe", counts);
  return counts;
}

// ─────────────────────────────── Library Settings ───────────────────────────────

function mapSettings(row: Record<string, unknown>): LibrarySettings {
  const bool = (k: string) => !!row[k];
  return {
    library_name: String(row.library_name ?? ""),
    library_short_name: String(row.library_short_name ?? ""),
    library_address: String(row.library_address ?? ""),
    library_city: String(row.library_city ?? ""),
    library_phone: String(row.library_phone ?? ""),
    library_email: String(row.library_email ?? ""),
    library_website: String(row.library_website ?? ""),
    library_hours: String(row.library_hours ?? ""),
    library_description: String(row.library_description ?? ""),
    timezone: String(row.timezone ?? "Asia/Tehran"),
    date_format: String(row.date_format ?? "dd/MM/yyyy") as LibrarySettings["date_format"],
    currency: String(row.currency ?? "IRR"),
    loan_days: Number(row.loan_days ?? 14),
    loan_limit: Number(row.loan_limit ?? 3),
    renew_limit: Number(row.renew_limit ?? 2),
    reservation_hold_days: Number(row.reservation_hold_days ?? 3),
    reservation_external_days: Number(row.reservation_external_days ?? 7),
    reservation_internal_days: Number(row.reservation_internal_days ?? 1),
    self_renewal_allowed: bool("self_renewal_allowed"),
    grace_period_enabled: bool("grace_period_enabled"),
    grace_period_days: Number(row.grace_period_days ?? 0),
    fines_enabled: bool("fines_enabled"),
    fine_per_day: Number(row.fine_per_day ?? 0),
    max_fine_amount: Number(row.max_fine_amount ?? 0),
    fine_currency: String(row.fine_currency ?? "IRR"),
    fines_payment_method: String(row.fines_payment_method ?? "cash"),
    notify_overdue: bool("notify_overdue"),
    notify_due_soon: bool("notify_due_soon"),
    notify_due_soon_days: Number(row.notify_due_soon_days ?? 2),
    notify_ready: bool("notify_ready"),
    shelf_row_count: Number(row.shelf_row_count ?? 6),
    updated_at: String(row.updated_at ?? ""),
  };
}

export async function getLibrarySettings(): Promise<LibrarySettings> {
  const row = await maybeOne<Record<string, unknown>>(`SELECT * FROM library_settings WHERE id = 1`);
  if (!row) throw new Error("تنظیمات کتابخانه یافت نشد.");
  return mapSettings(row);
}

export async function saveLibrarySettings(values: Partial<LibrarySettings>): Promise<void> {
  const allowed: (keyof LibrarySettings)[] = [
    "library_name", "library_short_name", "library_address", "library_city", "library_phone",
    "library_email", "library_website", "library_hours", "library_description", "timezone", "date_format",
    "currency", "loan_days", "loan_limit", "renew_limit", "reservation_hold_days",
    "reservation_external_days", "reservation_internal_days", "self_renewal_allowed",
    "grace_period_enabled", "grace_period_days", "notify_overdue", "notify_due_soon",
    "notify_due_soon_days", "notify_ready", "shelf_row_count",
  ];
  const boolCols = new Set(["self_renewal_allowed", "grace_period_enabled", "notify_overdue", "notify_due_soon", "notify_ready"]);
  const fineCols: (keyof LibrarySettings)[] = ["fines_enabled", "fine_per_day", "max_fine_amount", "fine_currency", "fines_payment_method"];
  const patch: Record<string, unknown> = {};
  for (const k of [...allowed, ...fineCols]) {
    if (values[k] === undefined) continue;
    const v = values[k] as unknown;
    patch[k] = boolCols.has(k as string) || (k === "fines_enabled") ? (v ? 1 : 0) : v;
  }
  if (Object.keys(patch).length === 0) return;
  const sets = Object.keys(patch).map((k) => `${k} = ?`).join(", ");
  await exec(`UPDATE library_settings SET ${sets}, updated_at = ? WHERE id = 1`, [...Object.values(patch), timestamp()]);
  await audit("update_settings", "library_settings", "1", patch);
}

