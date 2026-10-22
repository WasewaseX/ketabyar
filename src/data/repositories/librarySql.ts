import { currentActor } from "../../store/authStore";
import { select, exec, maybeOne, one, uid, nowIso } from "../localDb";
import type {
  Book, Copy, DashboardMetrics, Loan, Member, Reservation, Room, Column, Shelf,
  ReservationScope, AppNotification, LibrarySettings,
} from "../../types";
import {
  cleanBarcode, cleanAccession, cleanPhone, cleanText, cleanMemberNumber, generateRandomMemberNumber, normalizeDigits,
} from "../../utils/isbn";

/**
 * KetabYar's data services — every screen talks to the database exclusively
 * through this module. Business rules live here so the UI stays thin and the
 * rules stay testable:
 *
 *  • Circulation scopes: "internal" (reading-room, uncapped, short) and
 *    "external" (take-home, capped by loan_limit, full loan period).
 *  • Holds: pending → accept → ready (copy bound) | queued (position held);
 *    promotion happens automatically whenever a copy frees up.
 *  • Fines: charged once per loan, on return, per overdue day after the
 *    configured grace period, capped by max_fine_amount.
 *  • Deletes are soft by default (archive) and refused while copies are out.
 */

const timestamp = nowIso;
const DAY_MS = 86_400_000;

async function audit(action: string, entityType: string, entityId: string, after: unknown) {
  await exec(
    `INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, after_json, created_at) VALUES (?,?,?,?,?,?,?)`,
    [uid(), currentActor(), action, entityType, entityId, after === null ? null : JSON.stringify(after), timestamp()],
  );
}

/** Finds a singleton-ish row by name, creating it when missing. */
async function upsertByName(table: "publishers" | "categories" | "authors" | "tags", name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const existing = await maybeOne<{ id: string }>(`SELECT id FROM ${table} WHERE name = ?`, [trimmed]);
  if (existing) return existing.id;
  const id = uid();
  // authors carries a NOT NULL UNIQUE normalized_name (parity with ketabyar-core).
  if (table === "authors") {
    await exec(`INSERT INTO ${table} (id, name, normalized_name) VALUES (?, ?, ?)`, [id, trimmed, trimmed.toLowerCase()]);
  } else {
    await exec(`INSERT INTO ${table} (id, name) VALUES (?, ?)`, [id, trimmed]);
  }
  return id;
}

async function notify(type: AppNotification["type"], title: string, body: string | null, link: string, entityType: string, entityId: string) {
  await exec(
    `INSERT INTO notifications (id, type, title, body, link, entity_type, entity_id, is_read, created_at) VALUES (?,?,?,?,?,?,?,0,?)`,
    [uid(), type, title, body, link, entityType, entityId, timestamp()],
  );
}

async function getRules() {
  return one<{
    loan_days: number; loan_limit: number; renew_limit: number;
    reservation_hold_days: number; reservation_external_days: number; reservation_internal_days: number;
    grace_period_enabled: number; grace_period_days: number;
    fines_enabled: number; fine_per_day: number; max_fine_amount: number;
  }>(`SELECT loan_days, loan_limit, renew_limit, reservation_hold_days, reservation_external_days, reservation_internal_days,
        grace_period_enabled, grace_period_days, fines_enabled, fine_per_day, max_fine_amount
      FROM library_settings WHERE id = 1`);
}

function graceDays(rules: { grace_period_enabled: number; grace_period_days: number }): number {
  return rules.grace_period_enabled ? rules.grace_period_days : 0;
}

/** Promotes the oldest queued hold of a book whenever a copy is free. */
async function advanceReservationQueue(bookId: string, rules: Awaited<ReturnType<typeof getRules>>): Promise<void> {
  const freeCopy = await maybeOne<{ id: string }>(
    `SELECT c.id FROM copies c
     WHERE c.book_id = ? AND c.status = 'available'
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.copy_id = c.id AND r.status = 'ready')
     LIMIT 1`,
    [bookId],
  );
  if (!freeCopy) return;
  const nextInLine = await maybeOne<{ id: string; member_id: string; scope: ReservationScope }>(
    `SELECT id, member_id, scope FROM reservations
     WHERE book_id = ? AND status = 'queued' AND copy_id IS NULL
     ORDER BY position ASC, requested_at ASC LIMIT 1`,
    [bookId],
  );
  if (!nextInLine) return;
  const reservedUntil = new Date(Date.now() + rules.reservation_hold_days * DAY_MS).toISOString();
  await exec(
    `UPDATE reservations SET status = 'ready', copy_id = ?, reserved_at = ?, expires_at = ? WHERE id = ?`,
    [freeCopy.id, timestamp(), reservedUntil, nextInLine.id],
  );
  await exec(`UPDATE copies SET status = 'reserved' WHERE id = ?`, [freeCopy.id]);
  const book = await maybeOne<{ title: string }>(`SELECT title FROM books WHERE id = ?`, [bookId]);
  const member = await maybeOne<{ full_name: string }>(`SELECT full_name FROM members WHERE id = ?`, [nextInLine.member_id]);
  await notify("reservation_ready", book?.title ?? "رزرو آمادهٔ تحویل", member?.full_name ?? null, "/reservations", "reservation", nextInLine.id);
  await audit("accept_reservation", "reservation", nextInLine.id, { status: "ready", copy_id: freeCopy.id });
}

/* ═════════════════════════════ Dashboard ═════════════════════════════ */

export async function dashboard(): Promise<DashboardMetrics> {
  const rules = await getRules();
  const grace = graceDays(rules);
  const graceCutoff = new Date(Date.now() - grace * DAY_MS).toISOString();

  const counts = await one<{ titles: number; copies: number; members: number; onLoan: number; overdue: number; dueSoon: number; ready: number }>(
    `SELECT
      (SELECT COUNT(*) FROM books WHERE archived_at IS NULL) AS titles,
      (SELECT COUNT(*) FROM copies WHERE status != 'archived') AS copies,
      (SELECT COUNT(*) FROM members WHERE status = 'active' AND archived_at IS NULL) AS members,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL) AS onLoan,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at < ?) AS overdue,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ?) AS dueSoon,
      (SELECT COUNT(*) FROM reservations WHERE status = 'ready') AS ready`,
    [graceCutoff, new Date().toISOString(), new Date(Date.now() + 2 * DAY_MS).toISOString()],
  );

  const recentLoans = await select<Loan>(
    `SELECT * FROM loan_details WHERE returned_at IS NULL ORDER BY borrowed_at DESC LIMIT 5`,
  );
  const overdueLoans = await select<Loan>(
    `SELECT * FROM loan_details WHERE returned_at IS NULL AND due_at < ? ORDER BY due_at ASC LIMIT 5`,
    [graceCutoff],
  );
  const dueSoonLoans = await select<Loan>(
    `SELECT * FROM loan_details WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ? ORDER BY due_at ASC LIMIT 10`,
    [new Date().toISOString(), new Date(Date.now() + 2 * DAY_MS).toISOString()],
  );

  const activityRows = await select<{ date: string; count: number }>(
    `SELECT SUBSTR(borrowed_at, 1, 10) AS date, COUNT(*) AS count
     FROM loans WHERE borrowed_at >= ? GROUP BY date`,
    [new Date(Date.now() - 6 * DAY_MS).toISOString()],
  );
  const activity: { date: string; count: number }[] = [];
  for (let offset = 6; offset >= 0; offset--) {
    const day = new Date(Date.now() - offset * DAY_MS).toISOString().slice(0, 10);
    activity.push({ date: day, count: activityRows.find((row) => row.date === day)?.count ?? 0 });
  }

  const activeDepartments = await select<{ name: string; count: number }>(
    `SELECT m.department AS name, COUNT(*) AS count
     FROM loans l JOIN members m ON m.id = l.member_id
     WHERE m.department IS NOT NULL AND m.department != ''
     GROUP BY m.department ORDER BY count DESC LIMIT 5`,
  );

  const rhythmRows = await select<{ hour: number; checkouts: number; returns: number }>(
    `SELECT CAST(SUBSTR(borrowed_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS checkouts, 0 AS returns
     FROM loans WHERE borrowed_at >= ? GROUP BY hour`,
    [new Date().toISOString().slice(0, 10)],
  );
  const returnRows = await select<{ hour: number; n: number }>(
    `SELECT CAST(SUBSTR(returned_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n
     FROM loans WHERE returned_at >= ? GROUP BY hour`,
    [new Date().toISOString().slice(0, 10)],
  );
  const circulationRhythm: { time: string; checkouts: number; returns: number }[] = [];
  for (let hour = 8; hour <= 18; hour += 2) {
    circulationRhythm.push({
      time: `${hour}:00`,
      checkouts: rhythmRows.filter((row) => row.hour >= hour && row.hour < hour + 2).reduce((sum, row) => sum + row.checkouts, 0),
      returns: returnRows.filter((row) => row.hour >= hour && row.hour < hour + 2).reduce((sum, row) => sum + row.n, 0),
    });
  }

  return {
    titles: counts.titles,
    copies: counts.copies,
    members: counts.members,
    onLoan: counts.onLoan,
    overdue: counts.overdue,
    dueSoon: counts.dueSoon,
    readyReservations: counts.ready,
    recentLoans,
    overdueLoans,
    dueSoonLoans,
    activity,
    activeDepartments,
    circulationRhythm,
  };
}

/* ═════════════════════════════ Books ═════════════════════════════════ */

export async function books(query = "", itemType = ""): Promise<Book[]> {
  const needle = `%${query.trim()}%`;
  const clauses: string[] = [`archived_at IS NULL`];
  const params: unknown[] = [];
  if (query.trim()) {
    clauses.push(`(title LIKE ? OR arabic_title LIKE ? OR subtitle LIKE ? OR isbn13 LIKE ? OR isbn10 LIKE ? OR author LIKE ?)`);
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

export interface SaveBookInput extends Partial<Omit<Book, "id" | "created_at">> {
  author?: string;
  barcode?: string;
  accession?: string;
}

export async function saveBook(input: SaveBookInput): Promise<void> {
  const bookId = uid();
  const publisherId = input.publisher ? await upsertByName("publishers", input.publisher) : "";
  const categoryId = input.category ? await upsertByName("categories", input.category) : "";

  await exec(
    `INSERT INTO books (id, item_type, title, subtitle, arabic_title, description, language, publication_year,
       isbn10, isbn13, call_number, dewey_code, publisher_id, category_id, tags, cover_path, cover_url, metadata, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'manual', ?, ?)`,
    [
      bookId, input.item_type ?? "book", cleanText(input.title ?? ""), input.subtitle ?? null, input.arabic_title ?? null,
      input.description ?? null, input.language || "فارسی", input.publication_year ?? null,
      input.isbn10 ?? null, input.isbn13 ?? null, input.call_number ?? null, input.dewey_code ?? null,
      publisherId || null, categoryId || null, input.tags ?? null, input.cover_path ?? null, input.cover_url ?? null,
      input.metadata ?? null, timestamp(), timestamp(),
    ],
  );

  if (input.author) {
    const authorId = await upsertByName("authors", input.author);
    if (authorId) await exec(`INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)`, [bookId, authorId]);
  }
  if (input.tags) {
    for (const tag of input.tags.split(",").map((value) => value.trim()).filter(Boolean)) {
      const tagId = await upsertByName("tags", tag);
      if (tagId) await exec(`INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)`, [bookId, tagId]);
    }
  }

  // Optionally register the first physical copy alongside the title.
  if (input.barcode || input.accession) {
    let accession = cleanAccession(input.accession ?? "");
    let barcode = cleanBarcode(input.barcode ?? "");
    if (!accession) accession = `ACC-${uid().slice(0, 8).toUpperCase()}`;
    if (!barcode) barcode = `BAR-${accession}`;
    await exec(
      `INSERT INTO copies (id, book_id, accession_number, barcode, condition, status, created_at, updated_at)
       VALUES (?,?,?,?, 'good', 'available', ?, ?)`,
      [uid(), bookId, accession, barcode, timestamp(), timestamp()],
    );
  }

  await audit("create", "book", bookId, { title: input.title });
}

export async function updateBook(bookId: string, input: Partial<Book> & { author?: string | null }): Promise<void> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    params.push(value);
  };

  if (input.title !== undefined) assign("title", cleanText(input.title));
  if (input.subtitle !== undefined) assign("subtitle", input.subtitle);
  if (input.arabic_title !== undefined) assign("arabic_title", input.arabic_title);
  if (input.description !== undefined) assign("description", input.description);
  if (input.language !== undefined) assign("language", input.language);
  if (input.publication_year !== undefined) assign("publication_year", input.publication_year);
  if (input.isbn10 !== undefined) assign("isbn10", input.isbn10);
  if (input.isbn13 !== undefined) assign("isbn13", input.isbn13);
  if (input.call_number !== undefined) assign("call_number", input.call_number);
  if (input.dewey_code !== undefined) assign("dewey_code", input.dewey_code);
  if (input.tags !== undefined) assign("tags", input.tags);
  if (input.cover_path !== undefined) assign("cover_path", input.cover_path);
  if (input.cover_url !== undefined) assign("cover_url", input.cover_url);
  if (input.metadata !== undefined) assign("metadata", input.metadata);
  if (input.item_type !== undefined) assign("item_type", input.item_type);
  if (input.publisher !== undefined) assign("publisher_id", input.publisher ? await upsertByName("publishers", input.publisher) : null);
  if (input.category !== undefined) assign("category_id", input.category ? await upsertByName("categories", input.category) : null);

  if (input.author !== undefined) {
    await exec(`DELETE FROM book_authors WHERE book_id = ?`, [bookId]);
    if (input.author) {
      const authorId = await upsertByName("authors", input.author);
      if (authorId) await exec(`INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?, ?, 0)`, [bookId, authorId]);
    }
  }

  if (columns.length > 0) {
    columns.push(`updated_at = ?`);
    params.push(timestamp(), bookId);
    await exec(`UPDATE books SET ${columns.join(", ")} WHERE id = ?`, params);
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
    throw new Error("این عنوان نسخهٔ امانت‌داده‌شده دارد؛ ابتدا بازگشت آن را ثبت کنید.");
  }
  await exec(`UPDATE books SET archived_at = ?, updated_at = ? WHERE id = ?`, [timestamp(), timestamp(), bookId]);
  await exec(`UPDATE copies SET status = 'archived', updated_at = ? WHERE book_id = ? AND status != 'archived'`, [timestamp(), bookId]);
  await audit("archive_book", "book", bookId, null);
}

/* ── Copies ──────────────────────────────────────────────────────────── */

export async function getCopiesForBook(bookId: string): Promise<Copy[]> {
  return select<Copy>(`SELECT * FROM copy_catalog WHERE book_id = ? AND status != 'archived' ORDER BY accession_number ASC`, [bookId]);
}

export async function copies(query = ""): Promise<(Copy & { title: string; item_type?: string; cover_path?: string | null; author?: string | null })[]> {
  const needle = `%${query.trim()}%`;
  if (query.trim()) {
    return select(`SELECT * FROM copy_catalog WHERE status != 'archived' AND (barcode LIKE ? OR accession_number LIKE ? OR title LIKE ?) ORDER BY barcode`, [needle, needle, needle]);
  }
  return select(`SELECT * FROM copy_catalog WHERE status != 'archived' ORDER BY barcode`);
}

export async function addCopy(bookId: string, barcode: string, accessionNumber: string, condition: string, shelfId: string | null = null): Promise<void> {
  let accession = cleanAccession(accessionNumber);
  let code = cleanBarcode(barcode);

  if (!accession) accession = `ACC-${uid().slice(0, 8).toUpperCase()}`;
  for (let attempt = 0; attempt < 10; attempt++) {
    const clash = await maybeOne(`SELECT id FROM copies WHERE accession_number = ?`, [accession]);
    if (!clash) break;
    accession = `ACC-${uid().slice(0, 8).toUpperCase()}`;
  }
  if (!code) code = `BAR-${accession}`;
  const barcodeClash = await maybeOne(`SELECT id FROM copies WHERE barcode = ?`, [code]);
  if (barcodeClash) throw new Error("این بارکد قبلاً ثبت شده است.");

  await exec(
    `INSERT INTO copies (id, book_id, accession_number, barcode, shelf_id, condition, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,'available',?,?)`,
    [uid(), bookId, accession, code, shelfId, condition, timestamp(), timestamp()],
  );
  await audit("add_copy", "copy", bookId, { barcode: code, accession });
}

export async function updateCopy(copyId: string, updates: Partial<Copy> & { shelfId?: string | null }): Promise<void> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    params.push(value);
  };

  if (updates.barcode !== undefined) {
    const code = cleanBarcode(updates.barcode);
    const clash = await maybeOne(`SELECT id FROM copies WHERE barcode = ? AND id != ?`, [code, copyId]);
    if (clash) throw new Error("این بارکد قبلاً ثبت شده است.");
    assign("barcode", code);
  }
  if (updates.accession_number !== undefined) {
    const accession = cleanAccession(updates.accession_number);
    const clash = await maybeOne(`SELECT id FROM copies WHERE accession_number = ? AND id != ?`, [accession, copyId]);
    if (clash) throw new Error("این شمارهٔ رجیستر قبلاً ثبت شده است.");
    assign("accession_number", accession);
  }
  if (updates.condition !== undefined) assign("condition", updates.condition);
  if (updates.status !== undefined) assign("status", updates.status);
  if (updates.shelfId !== undefined) assign("shelf_id", updates.shelfId);

  if (columns.length > 0) {
    columns.push(`updated_at = ?`);
    params.push(timestamp(), copyId);
    await exec(`UPDATE copies SET ${columns.join(", ")} WHERE id = ?`, params);
    await audit("update_copy", "copy", copyId, updates);
  }
}

export async function deleteCopy(copyId: string): Promise<void> {
  const openLoan = await maybeOne(`SELECT id FROM loans WHERE copy_id = ? AND returned_at IS NULL`, [copyId]);
  if (openLoan) throw new Error("این نسخه امانت است؛ ابتدا بازگشت آن را ثبت کنید.");
  await exec(`UPDATE copies SET status = 'archived', updated_at = ? WHERE id = ?`, [timestamp(), copyId]);
  await audit("delete_copy", "copy", copyId, null);
}

/* ═════════════════════════════ Members ═══════════════════════════════ */

export async function members(query = ""): Promise<Member[]> {
  // Search terms typed on a Persian keyboard (۴۰۲…) must match the ASCII
  // student IDs stored in the database.
  const term = normalizeDigits(query.trim());
  if (term) {
    const needle = `%${term}%`;
    return select<Member>(
      `SELECT * FROM members WHERE archived_at IS NULL AND (full_name LIKE ? OR member_number LIKE ? OR email LIKE ? OR phone LIKE ?)
       ORDER BY full_name COLLATE NOCASE`,
      [needle, needle, needle, needle],
    );
  }
  return select<Member>(`SELECT * FROM members WHERE archived_at IS NULL ORDER BY full_name COLLATE NOCASE`);
}

export async function saveMember(input: Omit<Member, "id" | "member_number" | "joined_at"> & { member_number?: string }): Promise<Member> {
  const id = uid();
  const number = cleanMemberNumber(input.member_number ?? String(generateRandomMemberNumber(6)));
  const clash = await maybeOne(`SELECT id FROM members WHERE member_number = ?`, [number]);
  if (clash) throw new Error("این کد دانشجویی قبلاً ثبت شده است.");
  await exec(
    `INSERT INTO members (id, member_number, full_name, email, phone, department, role, status, avatar_path, joined_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, number, cleanText(input.full_name ?? ""), input.email ?? null, input.phone ? cleanPhone(input.phone) : null,
      input.department ?? null, input.role ?? "visitor", input.status ?? "active", input.avatar_path ?? null, timestamp(), timestamp(), timestamp()],
  );
  await audit("create_member", "member", id, { full_name: input.full_name });
  const created = await one<Member>(`SELECT * FROM members WHERE id = ?`, [id]);
  return created;
}

export async function updateMember(memberId: string, updates: Partial<Member>): Promise<void> {
  const columns: string[] = [];
  const params: unknown[] = [];
  const assign = (column: string, value: unknown) => {
    columns.push(`${column} = ?`);
    params.push(value);
  };
  const assignable: (keyof Member)[] = ["full_name", "email", "phone", "department", "role", "status", "avatar_path", "expiry_date", "reservation_banned", "ban_reason", "banned_at"];
  for (const key of assignable) {
    if (updates[key] !== undefined) assign(key, updates[key]);
  }
  if (updates.member_number !== undefined) {
    const number = cleanMemberNumber(updates.member_number);
    const clash = await maybeOne(`SELECT id FROM members WHERE member_number = ? AND id != ?`, [number, memberId]);
    if (clash) throw new Error("این کد دانشجویی قبلاً ثبت شده است.");
    assign("member_number", number);
  }
  if (columns.length > 0) {
    columns.push(`updated_at = ?`);
    params.push(timestamp(), memberId);
    await exec(`UPDATE members SET ${columns.join(", ")} WHERE id = ?`, params);
    await audit("update_member", "member", memberId, updates);
  }
}

export async function deleteMember(memberId: string): Promise<void> {
  const openLoans = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL`, [memberId]);
  if ((openLoans?.n ?? 0) > 0) throw new Error("این عضو امانت باز دارد؛ ابتدا بازگشت‌ها را ثبت کنید.");
  await exec(`UPDATE reservations SET status = 'cancelled', decided_at = ?, decision_reason = 'member archived' WHERE member_id = ? AND status IN ('pending','queued','ready')`, [timestamp(), memberId]);
  await exec(`UPDATE members SET status = 'archived', archived_at = ?, updated_at = ? WHERE id = ?`, [timestamp(), timestamp(), memberId]);
  await audit("archive_member", "member", memberId, null);
}

export async function hardDeleteMember(memberId: string): Promise<void> {
  const anyLoan = await maybeOne<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE member_id = ?`, [memberId]);
  if ((anyLoan?.n ?? 0) > 0) throw new Error("تاریخچهٔ امانت این عضو موجود است؛ حذف کامل ممکن نیست.");
  await exec(`DELETE FROM reservations WHERE member_id = ?`, [memberId]);
  await exec(`DELETE FROM fines WHERE member_id = ?`, [memberId]);
  await exec(`DELETE FROM members WHERE id = ?`, [memberId]);
  await audit("delete_member_permanent", "member", memberId, null);
}

export async function banMember(memberId: string, reason: string): Promise<void> {
  await exec(
    `UPDATE members SET reservation_banned = 1, ban_reason = ?, banned_at = ?, updated_at = ? WHERE id = ?`,
    [reason, timestamp(), timestamp(), memberId],
  );
  await audit("ban_member", "member", memberId, { reason });
}

export async function unbanMember(memberId: string): Promise<void> {
  await exec(
    `UPDATE members SET reservation_banned = 0, ban_reason = NULL, banned_at = NULL, updated_at = ? WHERE id = ?`,
    [timestamp(), memberId],
  );
  await audit("unban_member", "member", memberId, null);
}

/* ═════════════════════════════ Loans ═════════════════════════════════ */

export async function loans(openOnly = false): Promise<Loan[]> {
  const sql = `SELECT * FROM loan_details ${openOnly ? "WHERE returned_at IS NULL" : ""} ORDER BY due_at ASC, borrowed_at DESC`;
  return select<Loan>(sql);
}

export async function getLoansForMember(memberId: string): Promise<Loan[]> {
  return select<Loan>(`SELECT * FROM loan_details WHERE member_id = ? ORDER BY borrowed_at DESC`, [memberId]);
}

export async function getReservationsForMember(memberId: string): Promise<Reservation[]> {
  return select<Reservation>(`SELECT * FROM reservation_details WHERE member_id = ? ORDER BY requested_at DESC`, [memberId]);
}

/** Shared checkout path used by direct checkout and hold fulfilment. */
async function checkoutOne(memberId: string, copyId: string, scope: ReservationScope, rules: Awaited<ReturnType<typeof getRules>>): Promise<void> {
  const member = await maybeOne<{ status: string; reservation_banned: number; role: string | null }>(`SELECT status, reservation_banned, role FROM members WHERE id = ?`, [memberId]);
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.status !== "active") throw new Error("عضویت این نفر فعال نیست.");

  if (scope === "external" && member.reservation_banned) {
    throw new Error("این عضو از امانت‌گیری محروم شده است.");
  }

  const copy = await maybeOne<{ id: string; status: string; condition: string }>(`SELECT id, status, condition FROM copies WHERE id = ?`, [copyId]);
  if (!copy) throw new Error("نسخه یافت نشد.");
  if (copy.status !== "available") throw new Error("این نسخه اکنون قابل امانت نیست.");

  // Visitors (walk-in guests) may only use reading-room copies — parity with
  // the Rust engine's visitor gate in ketabyar-core.
  if (scope === "external" && member.role === "visitor") {
    throw new Error("مهمانان اجازهٔ امانت بیرون‌بر ندارند.");
  }

  if (scope === "external") {
    const openExternal = await maybeOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'`,
      [memberId],
    );
    if ((openExternal?.n ?? 0) >= rules.loan_limit) {
      throw new Error(`سقف امانت خارجی این عضو (${rules.loan_limit} نسخه) تکمیل است.`);
    }
  }

  const days = scope === "internal" ? rules.reservation_internal_days : rules.loan_days;
  const dueAt = new Date(Date.now() + days * DAY_MS).toISOString();

  await exec(
    `INSERT INTO loans (id, copy_id, member_id, scope, borrowed_at, due_at, renewed_count, issued_by, condition_out)
     VALUES (?,?,?,?,?,?,0,?,?)`,
    [uid(), copyId, memberId, scope, timestamp(), dueAt, currentActor(), copy.condition],
  );
  await exec(`UPDATE copies SET status = 'on-loan', updated_at = ? WHERE id = ?`, [timestamp(), copyId]);
}

export async function checkout(memberId: string, copyIds: string[], _limit: number, scope: ReservationScope = "external"): Promise<void> {
  void _limit; // the cap comes from library_settings, not the caller
  const rules = await getRules();
  // All-or-nothing batch cap (parity with the Rust engine): a batch that would
  // exceed the external loan limit is refused before any copy is issued.
  if (scope === "external" && copyIds.length > 0) {
    const open = await maybeOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'`,
      [memberId],
    );
    if ((open?.n ?? 0) + copyIds.length > rules.loan_limit) {
      throw new Error(`سقف امانت ${rules.loan_limit} مورد رعایت نشده است.`);
    }
  }
  for (const copyId of copyIds) {
    await checkoutOne(memberId, copyId, scope, rules);
    await audit("checkout", "loan", copyId, { memberId, scope });
  }
}

/** Charges the one-per-loan overdue fine at return time. */
async function chargeOverdueFine(loanId: string, dueAt: string, rules: Awaited<ReturnType<typeof getRules>>): Promise<void> {
  if (!rules.fines_enabled || rules.fine_per_day <= 0) return;
  const existing = await maybeOne(`SELECT id FROM fines WHERE loan_id = ?`, [loanId]);
  if (existing) return;
  const overdueDays = Math.floor((Date.now() - new Date(dueAt).getTime()) / DAY_MS);
  const chargeable = Math.max(0, overdueDays - graceDays(rules));
  if (chargeable <= 0) return;
  const capped = rules.max_fine_amount > 0 ? Math.min(chargeable * rules.fine_per_day, rules.max_fine_amount) : chargeable * rules.fine_per_day;
  const loan = await maybeOne<{ member_id: string }>(`SELECT member_id FROM loans WHERE id = ?`, [loanId]);
  if (!loan) return;
  await exec(
    `INSERT INTO fines (id, loan_id, member_id, amount, reason, status, created_at, updated_at)
     VALUES (?,?,?,?,?, 'open', ?, ?)`,
    [uid(), loanId, loan.member_id, capped, `تاخیر ${chargeable} روزه در بازگشت`, timestamp(), timestamp()],
  );
}

export async function returnCopies(copyIds: string[]): Promise<void> {
  const rules = await getRules();
  for (const copyId of copyIds) {
    const loan = await maybeOne<{ id: string; due_at: string }>(
      `SELECT id, due_at FROM loans WHERE copy_id = ? AND returned_at IS NULL`,
      [copyId],
    );
    if (!loan) continue;
    const copy = await maybeOne<{ condition: string }>(`SELECT condition FROM copies WHERE id = ?`, [copyId]);
    await exec(`UPDATE loans SET returned_at = ?, received_by = ?, condition_in = ? WHERE id = ?`, [timestamp(), currentActor(), copy?.condition ?? null, loan.id]);
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`, [timestamp(), copyId]);
    await chargeOverdueFine(loan.id, loan.due_at, rules);
    await audit("return", "loan", loan.id, { copyId });
    const bookId = await maybeOne<{ book_id: string }>(`SELECT book_id FROM copies WHERE id = ?`, [copyId]);
    if (bookId) await advanceReservationQueue(bookId.book_id, rules);
  }
}

export async function renewLoan(loanId: string): Promise<void> {
  const rules = await getRules();
  const loan = await maybeOne<{ id: string; due_at: string; renewed_count: number; returned_at: string | null; scope: ReservationScope; copy_id: string }>(
    `SELECT id, due_at, renewed_count, returned_at, scope, copy_id FROM loans WHERE id = ?`,
    [loanId],
  );
  if (!loan) throw new Error("امانت یافت نشد.");
  if (loan.returned_at) throw new Error("این امانت بسته شده است.");
  if (loan.renewed_count >= rules.renew_limit) {
    throw new Error(`سقف تمدید (${rules.renew_limit} بار) تکمیل است.`);
  }
  const base = Math.max(new Date(loan.due_at).getTime(), Date.now());
  const days = loan.scope === "internal" ? rules.reservation_internal_days : rules.loan_days;
  const nextDue = new Date(base + days * DAY_MS).toISOString();
  await exec(`UPDATE loans SET due_at = ?, renewed_count = renewed_count + 1 WHERE id = ?`, [nextDue, loanId]);
  await audit("renew", "loan", loanId, { due_at: nextDue });
}

export async function updateLoanDueDate(loanId: string, dueAt: string): Promise<void> {
  await exec(`UPDATE loans SET due_at = ? WHERE id = ?`, [dueAt, loanId]);
  await audit("update", "loan", loanId, { due_at: dueAt });
}

/* ═════════════════════════ Reservations (holds) ══════════════════════ */

/** Expires uncollected ready holds, releases their copies, promotes queues. */
export async function sweepReservations(): Promise<void> {
  const rules = await getRules();
  const expired = await select<{ id: string; copy_id: string | null; book_id: string }>(
    `SELECT id, copy_id, book_id FROM reservations WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at < ?`,
    [timestamp()],
  );
  for (const hold of expired) {
    await exec(`UPDATE reservations SET status = 'expired' WHERE id = ?`, [hold.id]);
    if (hold.copy_id) {
      const stillWanted = await maybeOne(
        `SELECT id FROM reservations WHERE copy_id = ? AND status = 'ready' AND id != ?`,
        [hold.copy_id, hold.id],
      );
      if (!stillWanted) {
        await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), hold.copy_id]);
      }
    }
    await audit("expire_reservation", "reservation", hold.id, null);
    await advanceReservationQueue(hold.book_id, rules);
  }
}

export async function reservations(): Promise<Reservation[]> {
  await sweepReservations();
  return select<Reservation>(`SELECT * FROM reservation_details ORDER BY requested_at DESC`);
}

export async function addReservation(bookId: string, memberId: string, scope: ReservationScope, expiresAt: string | null = null): Promise<string> {
  const member = await maybeOne<{ reservation_banned: number }>(`SELECT reservation_banned FROM members WHERE id = ?`, [memberId]);
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.reservation_banned) throw new Error("این عضو از رزرو محروم شده است.");

  const tail = await maybeOne<{ max: number }>(`SELECT COALESCE(MAX(position), 0) AS max FROM reservations WHERE book_id = ? AND status IN ('pending','queued')`, [bookId]);
  const id = uid();
  await exec(
    `INSERT INTO reservations (id, book_id, member_id, scope, status, position, requested_at, expires_at)
     VALUES (?,?,?,?, 'pending', ?, ?, ?)`,
    [id, bookId, memberId, scope, (tail?.max ?? 0) + 1, timestamp(), expiresAt],
  );
  await audit("create_reservation", "reservation", id, { bookId, memberId, scope });
  return id;
}

export async function acceptReservation(reservationId: string, reason: string | null = null): Promise<Reservation> {
  const rules = await getRules();
  const hold = await one<{ id: string; book_id: string; member_id: string; scope: ReservationScope; status: string }>(
    `SELECT id, book_id, member_id, scope, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (hold.status !== "pending") throw new Error("فقط درخواست‌های در انتظار می‌توانند تایید شوند.");

  const freeCopy = await maybeOne<{ id: string }>(
    `SELECT c.id FROM copies c
     WHERE c.book_id = ? AND c.status = 'available'
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.copy_id = c.id AND r.status = 'ready')
     LIMIT 1`,
    [hold.book_id],
  );

  if (freeCopy) {
    const reservedUntil = new Date(Date.now() + rules.reservation_hold_days * DAY_MS).toISOString();
    await exec(
      `UPDATE reservations SET status = 'ready', copy_id = ?, reserved_at = ?, expires_at = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
      [freeCopy.id, timestamp(), reservedUntil, currentActor(), timestamp(), reason, reservationId],
    );
    await exec(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [timestamp(), freeCopy.id]);
    const book = await maybeOne<{ title: string }>(`SELECT title FROM books WHERE id = ?`, [hold.book_id]);
    const member = await maybeOne<{ full_name: string }>(`SELECT full_name FROM members WHERE id = ?`, [hold.member_id]);
    await notify("reservation_ready", book?.title ?? "رزرو آمادهٔ تحویل", member?.full_name ?? null, "/reservations", "reservation", reservationId);
  } else {
    const queued = await maybeOne<{ max: number }>(`SELECT COALESCE(MAX(position), 0) AS max FROM reservations WHERE book_id = ? AND status = 'queued'`, [hold.book_id]);
    await exec(
      `UPDATE reservations SET status = 'queued', position = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
      [(queued?.max ?? 0) + 1, currentActor(), timestamp(), reason, reservationId],
    );
  }
  await audit("accept_reservation", "reservation", reservationId, { reason });
  return one<Reservation>(`SELECT * FROM reservation_details WHERE id = ?`, [reservationId]);
}

export async function declineReservation(reservationId: string, reason: string | null = null): Promise<Reservation> {
  const hold = await one<{ id: string; copy_id: string | null; book_id: string; status: string }>(
    `SELECT id, copy_id, book_id, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (!["pending", "queued", "ready"].includes(hold.status)) throw new Error("این درخواست قابل رد نیست.");
  await exec(
    `UPDATE reservations SET status = 'declined', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
    [currentActor(), timestamp(), reason, reservationId],
  );
  if (hold.copy_id) {
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), hold.copy_id]);
  }
  await audit("decline_reservation", "reservation", reservationId, { reason });
  const rules = await getRules();
  await advanceReservationQueue(hold.book_id, rules);
  return one<Reservation>(`SELECT * FROM reservation_details WHERE id = ?`, [reservationId]);
}

export async function fulfilReservation(reservationId: string): Promise<Loan> {
  const rules = await getRules();
  const hold = await one<{ id: string; copy_id: string | null; member_id: string; scope: ReservationScope; status: string }>(
    `SELECT id, copy_id, member_id, scope, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (hold.status !== "ready" || !hold.copy_id) throw new Error("این رزرو آمادهٔ تحویل نیست.");
  // The held copy sits in 'reserved' status — free it first so checkoutOne
  // passes (parity with ketabyar-core / upstream migration 0020).
  await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), hold.copy_id]);
  await checkoutOne(hold.member_id, hold.copy_id, hold.scope, rules);
  await exec(`UPDATE reservations SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?`, [timestamp(), reservationId]);
  await audit("fulfil_reservation", "reservation", reservationId, { copy_id: hold.copy_id });
  const loan = await one<Loan>(`SELECT * FROM loan_details WHERE copy_id = ? AND member_id = ? AND returned_at IS NULL ORDER BY borrowed_at DESC LIMIT 1`, [hold.copy_id, hold.member_id]);
  return loan;
}

export async function extendReservation(reservationId: string, days = 7): Promise<void> {
  const hold = await maybeOne<{ expires_at: string | null; status: string }>(`SELECT expires_at, status FROM reservations WHERE id = ?`, [reservationId]);
  if (!hold) throw new Error("رزرو یافت نشد.");
  if (hold.status !== "ready" && hold.status !== "queued") throw new Error("فقط رزروهای فعال قابل تمدید هستند.");
  const base = hold.expires_at ? Math.max(new Date(hold.expires_at).getTime(), Date.now()) : Date.now();
  await exec(`UPDATE reservations SET expires_at = ? WHERE id = ?`, [new Date(base + days * DAY_MS).toISOString(), reservationId]);
  await audit("extend_reservation", "reservation", reservationId, { days });
}

export async function updateReservation(reservationId: string, patch: { expiresAt?: string | null; scope?: ReservationScope }): Promise<void> {
  if (patch.expiresAt !== undefined) {
    await exec(`UPDATE reservations SET expires_at = ? WHERE id = ?`, [patch.expiresAt, reservationId]);
  }
  if (patch.scope !== undefined) {
    await exec(`UPDATE reservations SET scope = ? WHERE id = ?`, [patch.scope, reservationId]);
  }
  await audit("update_reservation", "reservation", reservationId, patch);
}

export async function cancelReservation(reservationId: string): Promise<void> {
  const hold = await one<{ id: string; copy_id: string | null; book_id: string; status: string }>(
    `SELECT id, copy_id, book_id, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (!["pending", "queued", "ready"].includes(hold.status)) throw new Error("این رزرو قابل لغو نیست.");
  await exec(`UPDATE reservations SET status = 'cancelled', decided_at = ? WHERE id = ?`, [timestamp(), reservationId]);
  if (hold.copy_id) {
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), hold.copy_id]);
  }
  await audit("cancel_reservation", "reservation", reservationId, null);
  const rules = await getRules();
  await advanceReservationQueue(hold.book_id, rules);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const hold = await maybeOne<{ copy_id: string | null; book_id: string }>(`SELECT copy_id, book_id FROM reservations WHERE id = ?`, [reservationId]);
  if (!hold) return;
  await exec(`DELETE FROM reservations WHERE id = ?`, [reservationId]);
  if (hold.copy_id) {
    await exec(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`, [timestamp(), hold.copy_id]);
  }
  await audit("delete_reservation", "reservation", reservationId, null);
  const rules = await getRules();
  await advanceReservationQueue(hold.book_id, rules);
}

/* ═════════════════════════════ Fines ═════════════════════════════════ */

export interface FineRow {
  id: string;
  loan_id: string;
  member_id: string;
  amount: number;
  reason: string;
  status: string;
  waived_reason: string | null;
  paid_at: string | null;
  created_at: string;
  member_name: string;
  member_number: string;
  title: string;
  barcode: string;
  due_at: string;
  returned_at: string;
}

export async function fines(): Promise<FineRow[]> {
  return select<FineRow>(
    `SELECT f.*, m.full_name AS member_name, m.member_number, b.title, c.barcode, l.due_at, l.returned_at
     FROM fines f
     JOIN members m ON m.id = f.member_id
     JOIN loans l ON l.id = f.loan_id
     JOIN copies c ON c.id = l.copy_id
     JOIN books b ON b.id = c.book_id
     ORDER BY f.created_at DESC`,
  );
}

export async function payFine(fineId: string): Promise<void> {
  await exec(`UPDATE fines SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`, [timestamp(), timestamp(), fineId]);
  await audit("update", "fine", fineId, { status: "paid" });
}

export async function waiveFine(fineId: string, reason: string): Promise<void> {
  await exec(`UPDATE fines SET status = 'waived', waived_reason = ?, updated_at = ? WHERE id = ?`, [reason, timestamp(), fineId]);
  await audit("update", "fine", fineId, { status: "waived", reason });
}

/* ═════════════════════════ Rooms / Columns / Shelves ═════════════════ */

export async function getRooms(): Promise<Room[]> {
  return select<Room>(`SELECT * FROM rooms ORDER BY name COLLATE NOCASE`);
}

export async function createRoom(name: string, notes: string | null = null): Promise<Room> {
  const id = uid();
  await exec(`INSERT INTO rooms (id, name, notes, created_at, updated_at) VALUES (?,?,?,?,?)`, [id, name.trim(), notes, timestamp(), timestamp()]);
  await audit("create_room", "room", id, { name });
  return one<Room>(`SELECT * FROM rooms WHERE id = ?`, [id]);
}

export async function renameRoom(roomId: string, newName: string): Promise<void> {
  await exec(`UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?`, [newName.trim(), timestamp(), roomId]);
  await audit("rename_room", "room", roomId, { name: newName });
}

export async function deleteRoom(roomId: string): Promise<void> {
  const occupied = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM copies c
     JOIN shelves s ON s.id = c.shelf_id
     JOIN columns co ON co.id = s.column_id
     WHERE co.room_id = ? AND c.status != 'archived'`,
    [roomId],
  );
  if ((occupied?.n ?? 0) > 0) throw new Error("این اتاق نسخهٔ روی قفسه دارد؛ ابتدا جابه‌جا کنید.");
  await exec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
  await audit("delete_room", "room", roomId, null);
}

export async function getColumns(): Promise<Column[]> {
  return select<Column>(`SELECT * FROM columns ORDER BY room_id, number`);
}

export async function createColumn(roomId: string, rows: string[]): Promise<string> {
  const valid = rows.filter((code) => /^[A-R]$/.test(code) || code === "S");
  if (valid.length === 0) throw new Error("حداقل یک ردیف انتخاب کنید.");
  const top = valid.filter((code) => code !== "S");
  const tail = await maybeOne<{ max: number }>(`SELECT COALESCE(MAX(number), 0) AS max FROM columns WHERE room_id = ?`, [roomId]);
  const id = uid();
  await exec(`INSERT INTO columns (id, room_id, number, created_at, updated_at) VALUES (?,?,?,?,?)`, [id, roomId, (tail?.max ?? 0) + 1, timestamp(), timestamp()]);
  await exec(
    `INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [uid(), id, "floor", "S", 120, timestamp(), timestamp()],
  );
  for (const code of top) {
    await exec(
      `INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [uid(), id, "top", code, 40, timestamp(), timestamp()],
    );
  }
  await audit("create_column", "column", id, { room: roomId, rows: top });
  return id;
}

export async function deleteColumn(columnId: string): Promise<void> {
  const occupied = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM copies c JOIN shelves s ON s.id = c.shelf_id WHERE s.column_id = ? AND c.status != 'archived'`,
    [columnId],
  );
  if ((occupied?.n ?? 0) > 0) throw new Error("این قفسه نسخه دارد؛ ابتدا جابه‌جا کنید.");
  await exec(`DELETE FROM columns WHERE id = ?`, [columnId]);
  await audit("delete_column", "column", columnId, null);
}

export async function getShelves(): Promise<Shelf[]> {
  return select<Shelf>(`SELECT * FROM shelf_overview ORDER BY room, column_number, code`);
}

export async function createShelf(columnId: string, code: string, shelfType: "top" | "floor" = "top", capacity = shelfType === "floor" ? 120 : 40): Promise<string> {
  const clash = await maybeOne(`SELECT id FROM shelves WHERE column_id = ? AND code = ?`, [columnId, code]);
  if (clash) throw new Error("این ردیف در این قفسه قبلاً ساخته شده است.");
  const id = uid();
  await exec(
    `INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [id, columnId, shelfType, code, capacity, timestamp(), timestamp()],
  );
  await audit("create_shelf", "shelf", id, { code, shelfType });
  return id;
}

export async function updateShelf(shelfId: string, updates: { capacity?: number; notes?: string | null }): Promise<void> {
  if (updates.capacity !== undefined) {
    await exec(`UPDATE shelves SET capacity = ?, updated_at = ? WHERE id = ?`, [Math.max(1, updates.capacity), timestamp(), shelfId]);
  }
  if (updates.notes !== undefined) {
    await exec(`UPDATE shelves SET notes = ?, updated_at = ? WHERE id = ?`, [updates.notes, timestamp(), shelfId]);
  }
  await audit("update_shelf", "shelf", shelfId, updates);
}

/* ═════════════════════════ Notifications ═════════════════════════════ */

export async function notifications(limit = 100): Promise<AppNotification[]> {
  return select<AppNotification>(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`, [limit]);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const result = await exec(`UPDATE notifications SET is_read = 1 WHERE id = ? AND is_read = 0`, [notificationId]);
  if (result.rowsAffected === 0) throw new Error("اعلان یافت نشد یا قبلاً خوانده شده است.");
}

export async function markAllNotificationsRead(): Promise<void> {
  await exec(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`);
}

/* ═════════════════════════ Audit log ═════════════════════════════════ */

export async function auditLog(limit = 500) {
  return select(
    `SELECT id, actor, action, entity_type, entity_id, after_json, before_json, created_at
     FROM audit_logs ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

/* ═════════════════════════ Backup / restore ══════════════════════════ */

export interface LibraryBackup {
  _version: number;
  _exported_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

const BACKUP_TABLES = [
  "rooms", "columns", "shelves", "publishers", "categories", "authors", "tags",
  "books", "book_authors", "book_tags", "members", "copies", "reservations", "loans", "fines",
] as const;

export async function exportLibraryBackup(): Promise<LibraryBackup> {
  const tables: LibraryBackup["tables"] = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await select(`SELECT * FROM ${table}`);
  }
  return { _version: 1, _exported_at: new Date().toISOString(), tables };
}

export async function importLibraryBackup(backup: LibraryBackup): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables?.[table];
    if (!Array.isArray(rows)) continue;
    let imported = 0;
    for (const row of rows) {
      if (table === "books" && !row.title) continue;
      if (table === "members" && !row.full_name) continue;
      if (table === "book_authors" || table === "book_tags") continue; // composite-key pairs rebuilt below
      const entries = Object.entries(row).filter(([, value]) => value !== undefined);
      if (entries.length === 0) continue;
      const columns = entries.map(([key]) => key);
      const marks = entries.map(() => "?").join(", ");
      const updates = columns.filter((column) => column !== "id").map((column) => `${column} = excluded.${column}`);
      await exec(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${marks})
         ON CONFLICT(id) DO UPDATE SET ${updates.join(", ")}`,
        entries.map(([, value]) => value),
      );
      imported += 1;
    }
    // Rebuild join pairs that arrived nested in the row objects.
    for (const row of rows) {
      if (Array.isArray(row.author_ids)) {
        for (const authorId of row.author_ids as string[]) {
          await exec(`INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)`, [row.id, authorId]);
        }
      }
      if (Array.isArray(row.tag_ids)) {
        for (const tagId of row.tag_ids as string[]) {
          await exec(`INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)`, [row.id, tagId]);
        }
      }
    }
    results[table] = imported;
  }
  await audit("import_backup", "library", "backup", results);
  return results;
}

export async function deleteAllLibraryData(): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};
  for (const table of [...BACKUP_TABLES].reverse()) {
    const result = await exec(`DELETE FROM ${table}`);
    deleted[table] = result.rowsAffected;
  }
  deleted.notifications = (await exec(`DELETE FROM notifications`)).rowsAffected;
  await audit("delete_all_library_data", "library", "factory-reset", deleted);
  return deleted;
}

/* ═════════════════════════ Settings ══════════════════════════════════ */

export async function getLibrarySettings(): Promise<LibrarySettings> {
  return one<LibrarySettings>(`SELECT * FROM library_settings WHERE id = 1`);
}

export async function saveLibrarySettings(values: Partial<LibrarySettings>): Promise<void> {
  const assignable = Object.entries(values).filter(([key, value]) => key !== "id" && key !== "updated_at" && value !== undefined);
  if (assignable.length === 0) return;
  const columns = assignable.map(([key]) => `${key} = ?`).join(", ");
  await exec(`UPDATE library_settings SET ${columns}, updated_at = ? WHERE id = 1`, [...assignable.map(([, value]) => value), timestamp()]);
}


/* ═════════════════════════ Reports & maintenance ═══════════════════════ */

/** One GROUP BY aggregate row (label is '' where the source column is NULL). */
export interface BreakdownRow {
  label: string;
  n: number;
}

/** Every aggregate the Reports page charts, fetched in a single round-trip. */
export interface ReportBreakdowns {
  loanCategories: BreakdownRow[];
  copyConditions: BreakdownRow[];
  memberRoles: BreakdownRow[];
  copyStatuses: BreakdownRow[];
  itemTypes: BreakdownRow[];
  inventoryCategories: BreakdownRow[];
  memberStatuses: BreakdownRow[];
  memberJoins: BreakdownRow[];
}

export async function reportBreakdowns(): Promise<ReportBreakdowns> {
  const [loanCategories, copyConditions, memberRoles, copyStatuses, itemTypes, inventoryCategories, memberStatuses, memberJoins] =
    await Promise.all([
      select<BreakdownRow>(
        `SELECT COALESCE(cat.name, '') AS label, COUNT(*) AS n
         FROM loans l JOIN copies c ON c.id = l.copy_id JOIN books b ON b.id = c.book_id
         LEFT JOIN categories cat ON cat.id = b.category_id GROUP BY cat.name`,
      ),
      select<BreakdownRow>(
        `SELECT condition AS label, COUNT(*) AS n FROM copies WHERE status != 'archived' GROUP BY condition`,
      ),
      select<BreakdownRow>(
        `SELECT COALESCE(role, '') AS label, COUNT(*) AS n FROM members WHERE archived_at IS NULL GROUP BY role`,
      ),
      select<BreakdownRow>(`SELECT status AS label, COUNT(*) AS n FROM copies GROUP BY status`),
      select<BreakdownRow>(
        `SELECT COALESCE(item_type, '') AS label, COUNT(*) AS n FROM books WHERE archived_at IS NULL GROUP BY item_type`,
      ),
      select<BreakdownRow>(
        `SELECT COALESCE(cat.name, '') AS label, COUNT(*) AS n
         FROM copies c JOIN books b ON b.id = c.book_id LEFT JOIN categories cat ON cat.id = b.category_id
         WHERE c.status != 'archived' GROUP BY cat.name`,
      ),
      select<BreakdownRow>(`SELECT COALESCE(status, '') AS label, COUNT(*) AS n FROM members GROUP BY status`),
      select<BreakdownRow>(
        `SELECT SUBSTR(joined_at, 1, 7) AS label, COUNT(*) AS n FROM members
         GROUP BY SUBSTR(joined_at, 1, 7) ORDER BY SUBSTR(joined_at, 1, 7) ASC`,
      ),
    ]);
  return { loanCategories, copyConditions, memberRoles, copyStatuses, itemTypes, inventoryCategories, memberStatuses, memberJoins };
}

/** Deletes all circulation history (loans + fines); affected copies return to the shelves. */
export async function clearCirculation(): Promise<void> {
  await exec(`UPDATE copies SET status = 'available' WHERE status = 'on-loan'`);
  await exec(`DELETE FROM fines`);
  await exec(`DELETE FROM loans`);
}
