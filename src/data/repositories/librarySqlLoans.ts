/**
 * Circulation: checkout, return, renewal, due-date edits and fines.
 */
import { currentActor } from "../../store/authStore";
import type { Loan, Reservation, ReservationScope } from "../../types";
import { maybeOne, select, sqlExec, uid } from "../localDb";
import type { FineRow } from "./librarySqlReservations";
import {
  advanceReservationQueue,
  audit,
  DAY_MS,
  getRules,
  graceDays,
  timestamp,
} from "./librarySqlShared";

export async function loans(openOnly = false): Promise<Loan[]> {
  const sql = `SELECT * FROM loan_details ${openOnly ? "WHERE returned_at IS NULL" : ""} ORDER BY due_at ASC, borrowed_at DESC`;
  return select<Loan>(sql);
}

export async function getLoansForMember(memberId: string): Promise<Loan[]> {
  return select<Loan>(
    `SELECT * FROM loan_details WHERE member_id = ? ORDER BY borrowed_at DESC`,
    [memberId],
  );
}

export async function getReservationsForMember(
  memberId: string,
): Promise<Reservation[]> {
  return select<Reservation>(
    `SELECT * FROM reservation_details WHERE member_id = ? ORDER BY requested_at DESC`,
    [memberId],
  );
}

export async function checkoutOne(
  memberId: string,
  copyId: string,
  scope: ReservationScope,
  rules: Awaited<ReturnType<typeof getRules>>,
): Promise<void> {
  const member = await maybeOne<{
    status: string;
    reservation_banned: number;
    role: string | null;
  }>(`SELECT status, reservation_banned, role FROM members WHERE id = ?`, [
    memberId,
  ]);
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.status !== "active") throw new Error("عضویت این نفر فعال نیست.");

  if (scope === "external" && member.reservation_banned) {
    throw new Error("این عضو از امانت‌گیری محروم شده است.");
  }

  const copy = await maybeOne<{
    id: string;
    status: string;
    condition: string;
  }>(`SELECT id, status, condition FROM copies WHERE id = ?`, [copyId]);
  if (!copy) throw new Error("نسخه یافت نشد.");
  if (copy.status !== "available")
    throw new Error("این نسخه اکنون قابل امانت نیست.");

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
      throw new Error(
        `سقف امانت خارجی این عضو (${rules.loan_limit} نسخه) تکمیل است.`,
      );
    }
  }

  const days =
    scope === "internal" ? rules.reservation_internal_days : rules.loan_days;
  const dueAt = new Date(Date.now() + days * DAY_MS).toISOString();

  await issueLoan(copyId, memberId, scope, dueAt, copy.condition);
}

/** One checkout = insert the loan row and flip the copy to on-loan. */
async function issueLoan(
  copyId: string,
  memberId: string,
  scope: string,
  dueAt: string,
  conditionOut: string | null,
) {
  await sqlExec(
    `INSERT INTO loans (id, copy_id, member_id, scope, borrowed_at, due_at, renewed_count, issued_by, condition_out)
     VALUES (?,?,?,?,?,?,0,?,?)`,
    [
      uid(),
      copyId,
      memberId,
      scope,
      timestamp(),
      dueAt,
      currentActor(),
      conditionOut,
    ],
  );
  await sqlExec(
    `UPDATE copies SET status = 'on-loan', updated_at = ? WHERE id = ?`,
    [timestamp(), copyId],
  );
}

export async function checkout(
  memberId: string,
  copyIds: string[],
  _limit: number,
  scope: ReservationScope = "external",
): Promise<void> {
  void _limit; // the cap comes from library_settings, not the caller
  if (copyIds.length === 0) return;
  const rules = await getRules();
  const member = await maybeOne<{
    status: string;
    reservation_banned: number;
    role: string | null;
  }>(`SELECT status, reservation_banned, role FROM members WHERE id = ?`, [
    memberId,
  ]);
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.status !== "active") throw new Error("عضویت این نفر فعال نیست.");
  if (scope === "external" && member.reservation_banned) {
    throw new Error("این عضو از امانت‌گیری محروم شده است.");
  }
  if (scope === "external" && member.role === "visitor") {
    throw new Error("مهمانان اجازهٔ امانت بیرون‌بر ندارند.");
  }

  // All-or-nothing batch cap (parity with the Rust engine): a batch that would
  // exceed the external loan limit is refused before any copy is issued.
  if (scope === "external") {
    const open = await maybeOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE member_id = ? AND returned_at IS NULL AND scope = 'external'`,
      [memberId],
    );
    if ((open?.n ?? 0) + copyIds.length > rules.loan_limit) {
      throw new Error(`سقف امانت ${rules.loan_limit} مورد رعایت نشده است.`);
    }
  }

  // ALL-OR-NOTHING batch (v1.2.5 atomicity audit): every copy is validated
  // BEFORE any write. The plugin-sql pool cannot run cross-statement
  // transactions, so the batch is made failure-free by construction instead —
  // a bad copy can no longer leave the earlier copies of the batch issued.
  // (The Rust edition additionally wraps the whole batch in a real
  // transaction; behavioural parity is what these tests pin.)
  const conditions = new Map<string, string | null>();
  for (const copyId of copyIds) {
    const copy = await maybeOne<{
      id: string;
      status: string;
      condition: string;
    }>(`SELECT id, status, condition FROM copies WHERE id = ?`, [copyId]);
    if (!copy) throw new Error("نسخه یافت نشد.");
    if (copy.status !== "available")
      throw new Error("این نسخه اکنون قابل امانت نیست.");
    conditions.set(copyId, copy.condition);
  }

  const days =
    scope === "internal" ? rules.reservation_internal_days : rules.loan_days;
  const dueAt = new Date(Date.now() + days * DAY_MS).toISOString();
  for (const copyId of copyIds) {
    await issueLoan(
      copyId,
      memberId,
      scope,
      dueAt,
      conditions.get(copyId) ?? null,
    );
    await audit("checkout", "loan", copyId, { memberId, scope });
  }
}

/** Charges the one-per-loan overdue fine at return time. */
async function chargeOverdueFine(
  loanId: string,
  dueAt: string,
  rules: Awaited<ReturnType<typeof getRules>>,
): Promise<void> {
  if (!rules.fines_enabled || rules.fine_per_day <= 0) return;
  const existing = await maybeOne(`SELECT id FROM fines WHERE loan_id = ?`, [
    loanId,
  ]);
  if (existing) return;
  const overdueDays = Math.floor(
    (Date.now() - new Date(dueAt).getTime()) / DAY_MS,
  );
  const chargeable = Math.max(0, overdueDays - graceDays(rules));
  if (chargeable <= 0) return;
  const capped =
    rules.max_fine_amount > 0
      ? Math.min(chargeable * rules.fine_per_day, rules.max_fine_amount)
      : chargeable * rules.fine_per_day;
  const loan = await maybeOne<{ member_id: string }>(
    `SELECT member_id FROM loans WHERE id = ?`,
    [loanId],
  );
  if (!loan) return;
  await sqlExec(
    `INSERT INTO fines (id, loan_id, member_id, amount, reason, status, created_at, updated_at)
     VALUES (?,?,?,?,?, 'open', ?, ?)`,
    [
      uid(),
      loanId,
      loan.member_id,
      capped,
      `تاخیر ${chargeable} روزه در بازگشت`,
      timestamp(),
      timestamp(),
    ],
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
    const copy = await maybeOne<{ condition: string }>(
      `SELECT condition FROM copies WHERE id = ?`,
      [copyId],
    );
    await sqlExec(
      `UPDATE loans SET returned_at = ?, received_by = ?, condition_in = ? WHERE id = ?`,
      [timestamp(), currentActor(), copy?.condition ?? null, loan.id],
    );
    await sqlExec(
      `UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`,
      [timestamp(), copyId],
    );
    await chargeOverdueFine(loan.id, loan.due_at, rules);
    await audit("return", "loan", loan.id, { copyId });
    const bookId = await maybeOne<{ book_id: string }>(
      `SELECT book_id FROM copies WHERE id = ?`,
      [copyId],
    );
    if (bookId) await advanceReservationQueue(bookId.book_id, rules);
  }
}

export async function renewLoan(loanId: string): Promise<void> {
  const rules = await getRules();
  const loan = await maybeOne<{
    id: string;
    due_at: string;
    renewed_count: number;
    returned_at: string | null;
    scope: ReservationScope;
    copy_id: string;
  }>(
    `SELECT id, due_at, renewed_count, returned_at, scope, copy_id FROM loans WHERE id = ?`,
    [loanId],
  );
  if (!loan) throw new Error("امانت یافت نشد.");
  if (loan.returned_at) throw new Error("این امانت بسته شده است.");
  if (loan.renewed_count >= rules.renew_limit) {
    throw new Error(`سقف تمدید (${rules.renew_limit} بار) تکمیل است.`);
  }
  const base = Math.max(new Date(loan.due_at).getTime(), Date.now());
  const days =
    loan.scope === "internal"
      ? rules.reservation_internal_days
      : rules.loan_days;
  const nextDue = new Date(base + days * DAY_MS).toISOString();
  await sqlExec(
    `UPDATE loans SET due_at = ?, renewed_count = renewed_count + 1 WHERE id = ?`,
    [nextDue, loanId],
  );
  await audit("renew", "loan", loanId, { due_at: nextDue });
}

export async function updateLoanDueDate(
  loanId: string,
  dueAt: string,
): Promise<void> {
  await sqlExec(`UPDATE loans SET due_at = ? WHERE id = ?`, [dueAt, loanId]);
  await audit("update", "loan", loanId, { due_at: dueAt });
}

/* ═════════════════════════ Reservations (holds) ══════════════════════ */

/** Expires uncollected ready holds, releases their copies, promotes queues. */

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
  await sqlExec(
    `UPDATE fines SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`,
    [timestamp(), timestamp(), fineId],
  );
  await audit("update", "fine", fineId, { status: "paid" });
}

export async function waiveFine(fineId: string, reason: string): Promise<void> {
  await sqlExec(
    `UPDATE fines SET status = 'waived', waived_reason = ?, updated_at = ? WHERE id = ?`,
    [reason, timestamp(), fineId],
  );
  await audit("update", "fine", fineId, { status: "waived", reason });
}

/* ═════════════════════════ Rooms / Columns / Shelves ═════════════════ */
