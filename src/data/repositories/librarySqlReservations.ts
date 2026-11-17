/**
 * Holds: queue lifecycle from request to fulfilment (or decline).
 */
import { currentActor } from "../../store/authStore";
import type { Loan, Reservation, ReservationScope } from "../../types";
import { maybeOne, one, select, sqlExec, uid } from "../localDb";
import { checkoutOne } from "./librarySqlLoans";
import {
  advanceReservationQueue,
  audit,
  DAY_MS,
  getRules,
  notify,
  timestamp,
} from "./librarySqlShared";

export async function sweepReservations(): Promise<void> {
  const rules = await getRules();
  const expired = await select<{
    id: string;
    copy_id: string | null;
    book_id: string;
  }>(
    `SELECT id, copy_id, book_id FROM reservations WHERE status = 'ready' AND expires_at IS NOT NULL AND expires_at < ?`,
    [timestamp()],
  );
  for (const hold of expired) {
    await sqlExec(`UPDATE reservations SET status = 'expired' WHERE id = ?`, [
      hold.id,
    ]);
    if (hold.copy_id) {
      const stillWanted = await maybeOne(
        `SELECT id FROM reservations WHERE copy_id = ? AND status = 'ready' AND id != ?`,
        [hold.copy_id, hold.id],
      );
      if (!stillWanted) {
        await sqlExec(
          `UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`,
          [timestamp(), hold.copy_id],
        );
      }
    }
    await audit("expire_reservation", "reservation", hold.id, null);
    await advanceReservationQueue(hold.book_id, rules);
  }
}

export async function reservations(): Promise<Reservation[]> {
  await sweepReservations();
  return select<Reservation>(
    `SELECT * FROM reservation_details ORDER BY requested_at DESC`,
  );
}

export async function addReservation(
  bookId: string,
  memberId: string,
  scope: ReservationScope,
  expiresAt: string | null = null,
): Promise<string> {
  const member = await maybeOne<{ reservation_banned: number }>(
    `SELECT reservation_banned FROM members WHERE id = ?`,
    [memberId],
  );
  if (!member) throw new Error("عضو یافت نشد.");
  if (member.reservation_banned)
    throw new Error("این عضو از رزرو محروم شده است.");

  const tail = await maybeOne<{ max: number }>(
    `SELECT COALESCE(MAX(position), 0) AS max FROM reservations WHERE book_id = ? AND status IN ('pending','queued')`,
    [bookId],
  );
  const id = uid();
  await sqlExec(
    `INSERT INTO reservations (id, book_id, member_id, scope, status, position, requested_at, expires_at)
     VALUES (?,?,?,?, 'pending', ?, ?, ?)`,
    [id, bookId, memberId, scope, (tail?.max ?? 0) + 1, timestamp(), expiresAt],
  );
  await audit("create_reservation", "reservation", id, {
    bookId,
    memberId,
    scope,
  });
  return id;
}

export async function acceptReservation(
  reservationId: string,
  reason: string | null = null,
): Promise<Reservation> {
  const rules = await getRules();
  const hold = await one<{
    id: string;
    book_id: string;
    member_id: string;
    scope: ReservationScope;
    status: string;
  }>(
    `SELECT id, book_id, member_id, scope, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (hold.status !== "pending")
    throw new Error("فقط درخواست‌های در انتظار می‌توانند تایید شوند.");

  const freeCopy = await maybeOne<{ id: string }>(
    `SELECT c.id FROM copies c
     WHERE c.book_id = ? AND c.status = 'available'
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.copy_id = c.id AND r.status = 'ready')
     LIMIT 1`,
    [hold.book_id],
  );

  if (freeCopy) {
    const reservedUntil = new Date(
      Date.now() + rules.reservation_hold_days * DAY_MS,
    ).toISOString();
    await sqlExec(
      `UPDATE reservations SET status = 'ready', copy_id = ?, reserved_at = ?, expires_at = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
      [
        freeCopy.id,
        timestamp(),
        reservedUntil,
        currentActor(),
        timestamp(),
        reason,
        reservationId,
      ],
    );
    await sqlExec(
      `UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`,
      [timestamp(), freeCopy.id],
    );
    const book = await maybeOne<{ title: string }>(
      `SELECT title FROM books WHERE id = ?`,
      [hold.book_id],
    );
    const member = await maybeOne<{ full_name: string }>(
      `SELECT full_name FROM members WHERE id = ?`,
      [hold.member_id],
    );
    await notify(
      "reservation_ready",
      book?.title ?? "رزرو آمادهٔ تحویل",
      member?.full_name ?? null,
      "/reservations",
      "reservation",
      reservationId,
    );
  } else {
    const queued = await maybeOne<{ max: number }>(
      `SELECT COALESCE(MAX(position), 0) AS max FROM reservations WHERE book_id = ? AND status = 'queued'`,
      [hold.book_id],
    );
    await sqlExec(
      `UPDATE reservations SET status = 'queued', position = ?, decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
      [
        (queued?.max ?? 0) + 1,
        currentActor(),
        timestamp(),
        reason,
        reservationId,
      ],
    );
  }
  await audit("accept_reservation", "reservation", reservationId, { reason });
  return one<Reservation>(`SELECT * FROM reservation_details WHERE id = ?`, [
    reservationId,
  ]);
}

export async function declineReservation(
  reservationId: string,
  reason: string | null = null,
): Promise<Reservation> {
  const hold = await one<{
    id: string;
    copy_id: string | null;
    book_id: string;
    status: string;
  }>(`SELECT id, copy_id, book_id, status FROM reservations WHERE id = ?`, [
    reservationId,
  ]);
  if (!["pending", "queued", "ready"].includes(hold.status))
    throw new Error("این درخواست قابل رد نیست.");
  await sqlExec(
    `UPDATE reservations SET status = 'declined', decided_by = ?, decided_at = ?, decision_reason = ? WHERE id = ?`,
    [currentActor(), timestamp(), reason, reservationId],
  );
  if (hold.copy_id) {
    await sqlExec(
      `UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`,
      [timestamp(), hold.copy_id],
    );
  }
  await audit("decline_reservation", "reservation", reservationId, { reason });
  const rules = await getRules();
  await advanceReservationQueue(hold.book_id, rules);
  return one<Reservation>(`SELECT * FROM reservation_details WHERE id = ?`, [
    reservationId,
  ]);
}

export async function fulfilReservation(reservationId: string): Promise<Loan> {
  const rules = await getRules();
  const hold = await one<{
    id: string;
    copy_id: string | null;
    member_id: string;
    scope: ReservationScope;
    status: string;
  }>(
    `SELECT id, copy_id, member_id, scope, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (hold.status !== "ready" || !hold.copy_id)
    throw new Error("این رزرو آمادهٔ تحویل نیست.");
  // The held copy sits in 'reserved' status — free it first so checkoutOne
  // passes (parity with ketabyar-core / upstream migration 0020).
  await sqlExec(
    `UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`,
    [timestamp(), hold.copy_id],
  );
  await checkoutOne(hold.member_id, hold.copy_id, hold.scope, rules);
  await sqlExec(
    `UPDATE reservations SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?`,
    [timestamp(), reservationId],
  );
  await audit("fulfil_reservation", "reservation", reservationId, {
    copy_id: hold.copy_id,
  });
  const loan = await one<Loan>(
    `SELECT * FROM loan_details WHERE copy_id = ? AND member_id = ? AND returned_at IS NULL ORDER BY borrowed_at DESC LIMIT 1`,
    [hold.copy_id, hold.member_id],
  );
  return loan;
}

export async function extendReservation(
  reservationId: string,
  days = 7,
): Promise<void> {
  const hold = await maybeOne<{ expires_at: string | null; status: string }>(
    `SELECT expires_at, status FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (!hold) throw new Error("رزرو یافت نشد.");
  if (hold.status !== "ready" && hold.status !== "queued")
    throw new Error("فقط رزروهای فعال قابل تمدید هستند.");
  const base = hold.expires_at
    ? Math.max(new Date(hold.expires_at).getTime(), Date.now())
    : Date.now();
  await sqlExec(`UPDATE reservations SET expires_at = ? WHERE id = ?`, [
    new Date(base + days * DAY_MS).toISOString(),
    reservationId,
  ]);
  await audit("extend_reservation", "reservation", reservationId, { days });
}

export async function updateReservation(
  reservationId: string,
  patch: { expiresAt?: string | null; scope?: ReservationScope },
): Promise<void> {
  if (patch.expiresAt !== undefined) {
    await sqlExec(`UPDATE reservations SET expires_at = ? WHERE id = ?`, [
      patch.expiresAt,
      reservationId,
    ]);
  }
  if (patch.scope !== undefined) {
    await sqlExec(`UPDATE reservations SET scope = ? WHERE id = ?`, [
      patch.scope,
      reservationId,
    ]);
  }
  await audit("update_reservation", "reservation", reservationId, patch);
}

export async function cancelReservation(reservationId: string): Promise<void> {
  const hold = await one<{
    id: string;
    copy_id: string | null;
    book_id: string;
    status: string;
  }>(`SELECT id, copy_id, book_id, status FROM reservations WHERE id = ?`, [
    reservationId,
  ]);
  if (!["pending", "queued", "ready"].includes(hold.status))
    throw new Error("این رزرو قابل لغو نیست.");
  await sqlExec(
    `UPDATE reservations SET status = 'cancelled', decided_at = ? WHERE id = ?`,
    [timestamp(), reservationId],
  );
  if (hold.copy_id) {
    await sqlExec(
      `UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`,
      [timestamp(), hold.copy_id],
    );
  }
  await audit("cancel_reservation", "reservation", reservationId, null);
  const rules = await getRules();
  await advanceReservationQueue(hold.book_id, rules);
}

export async function deleteReservation(reservationId: string): Promise<void> {
  const hold = await maybeOne<{ copy_id: string | null; book_id: string }>(
    `SELECT copy_id, book_id FROM reservations WHERE id = ?`,
    [reservationId],
  );
  if (!hold) return;
  await sqlExec(`DELETE FROM reservations WHERE id = ?`, [reservationId]);
  if (hold.copy_id) {
    await sqlExec(
      `UPDATE copies SET status = 'available', updated_at = ? WHERE id = ? AND status = 'reserved'`,
      [timestamp(), hold.copy_id],
    );
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
