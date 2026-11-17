/**
 * Shared helpers for the librarySql module family: audit trail,
notification fan-out, circulation rules and hold-queue promotion.
 */
import { currentActor } from "../../store/authStore";
import type { AppNotification, ReservationScope } from "../../types";
import { maybeOne, nowIso, one, sqlExec, uid } from "../localDb";

export const timestamp = nowIso;
export const DAY_MS = 86_400_000;

export async function audit(
  action: string,
  entityType: string,
  entityId: string,
  after: unknown,
) {
  await sqlExec(
    `INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, after_json, created_at) VALUES (?,?,?,?,?,?,?)`,
    [
      uid(),
      currentActor(),
      action,
      entityType,
      entityId,
      after === null ? null : JSON.stringify(after),
      timestamp(),
    ],
  );
}

/** Finds a singleton-ish row by name, creating it when missing. */
export async function upsertByName(
  table: "publishers" | "categories" | "authors" | "tags",
  name: string,
): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const existing = await maybeOne<{ id: string }>(
    `SELECT id FROM ${table} WHERE name = ?`,
    [trimmed],
  );
  if (existing) return existing.id;
  const id = uid();
  // authors carries a NOT NULL UNIQUE normalized_name (parity with ketabyar-core).
  if (table === "authors") {
    await sqlExec(
      `INSERT INTO ${table} (id, name, normalized_name) VALUES (?, ?, ?)`,
      [id, trimmed, trimmed.toLowerCase()],
    );
  } else {
    await sqlExec(`INSERT INTO ${table} (id, name) VALUES (?, ?)`, [
      id,
      trimmed,
    ]);
  }
  return id;
}

export async function notify(
  type: AppNotification["type"],
  title: string,
  body: string | null,
  link: string,
  entityType: string,
  entityId: string,
) {
  await sqlExec(
    `INSERT INTO notifications (id, type, title, body, link, entity_type, entity_id, is_read, created_at) VALUES (?,?,?,?,?,?,?,0,?)`,
    [uid(), type, title, body, link, entityType, entityId, timestamp()],
  );
}

export async function getRules() {
  return one<{
    loan_days: number;
    loan_limit: number;
    renew_limit: number;
    reservation_hold_days: number;
    reservation_external_days: number;
    reservation_internal_days: number;
    grace_period_enabled: number;
    grace_period_days: number;
    fines_enabled: number;
    fine_per_day: number;
    max_fine_amount: number;
  }>(`SELECT loan_days, loan_limit, renew_limit, reservation_hold_days, reservation_external_days, reservation_internal_days,
        grace_period_enabled, grace_period_days, fines_enabled, fine_per_day, max_fine_amount
      FROM library_settings WHERE id = 1`);
}

export function graceDays(rules: {
  grace_period_enabled: number;
  grace_period_days: number;
}): number {
  return rules.grace_period_enabled ? rules.grace_period_days : 0;
}

/** Promotes the oldest queued hold of a book whenever a copy is free. */
export async function advanceReservationQueue(
  bookId: string,
  rules: Awaited<ReturnType<typeof getRules>>,
): Promise<void> {
  const freeCopy = await maybeOne<{ id: string }>(
    `SELECT c.id FROM copies c
     WHERE c.book_id = ? AND c.status = 'available'
       AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.copy_id = c.id AND r.status = 'ready')
     LIMIT 1`,
    [bookId],
  );
  if (!freeCopy) return;
  const nextInLine = await maybeOne<{
    id: string;
    member_id: string;
    scope: ReservationScope;
  }>(
    `SELECT id, member_id, scope FROM reservations
     WHERE book_id = ? AND status = 'queued' AND copy_id IS NULL
     ORDER BY position ASC, requested_at ASC LIMIT 1`,
    [bookId],
  );
  if (!nextInLine) return;
  const reservedUntil = new Date(
    Date.now() + rules.reservation_hold_days * DAY_MS,
  ).toISOString();
  await sqlExec(
    `UPDATE reservations SET status = 'ready', copy_id = ?, reserved_at = ?, expires_at = ? WHERE id = ?`,
    [freeCopy.id, timestamp(), reservedUntil, nextInLine.id],
  );
  await sqlExec(`UPDATE copies SET status = 'reserved' WHERE id = ?`, [
    freeCopy.id,
  ]);
  const book = await maybeOne<{ title: string }>(
    `SELECT title FROM books WHERE id = ?`,
    [bookId],
  );
  const member = await maybeOne<{ full_name: string }>(
    `SELECT full_name FROM members WHERE id = ?`,
    [nextInLine.member_id],
  );
  await notify(
    "reservation_ready",
    book?.title ?? "رزرو آمادهٔ تحویل",
    member?.full_name ?? null,
    "/reservations",
    "reservation",
    nextInLine.id,
  );
  await audit("accept_reservation", "reservation", nextInLine.id, {
    status: "ready",
    copy_id: freeCopy.id,
  });
}

/* ═════════════════════════════ Dashboard ═════════════════════════════ */
