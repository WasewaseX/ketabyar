/**
 * System surfaces: dashboard metrics, notifications, audit log,
backup/restore, settings, report breakdowns and data resets.
 */
import type {
  AppNotification,
  DashboardMetrics,
  LibrarySettings,
  Loan,
} from "../../types";
import { one, select, sqlExec } from "../localDb";
import {
  audit,
  DAY_MS,
  getRules,
  graceDays,
  timestamp,
} from "./librarySqlShared";

export async function dashboard(): Promise<DashboardMetrics> {
  const rules = await getRules();
  const grace = graceDays(rules);
  const graceCutoff = new Date(Date.now() - grace * DAY_MS).toISOString();

  const counts = await one<{
    titles: number;
    copies: number;
    members: number;
    onLoan: number;
    overdue: number;
    dueSoon: number;
    ready: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM books WHERE archived_at IS NULL) AS titles,
      (SELECT COUNT(*) FROM copies WHERE status != 'archived') AS copies,
      (SELECT COUNT(*) FROM members WHERE status = 'active' AND archived_at IS NULL) AS members,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL) AS onLoan,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at < ?) AS overdue,
      (SELECT COUNT(*) FROM loans WHERE returned_at IS NULL AND due_at >= ? AND due_at <= ?) AS dueSoon,
      (SELECT COUNT(*) FROM reservations WHERE status = 'ready') AS ready`,
    [
      graceCutoff,
      new Date().toISOString(),
      new Date(Date.now() + 2 * DAY_MS).toISOString(),
    ],
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
    const day = new Date(Date.now() - offset * DAY_MS)
      .toISOString()
      .slice(0, 10);
    activity.push({
      date: day,
      count: activityRows.find((row) => row.date === day)?.count ?? 0,
    });
  }

  const activeDepartments = await select<{ name: string; count: number }>(
    `SELECT m.department AS name, COUNT(*) AS count
     FROM loans l JOIN members m ON m.id = l.member_id
     WHERE m.department IS NOT NULL AND m.department != ''
     GROUP BY m.department ORDER BY count DESC LIMIT 5`,
  );

  const rhythmRows = await select<{
    hour: number;
    checkouts: number;
    returns: number;
  }>(
    `SELECT CAST(SUBSTR(borrowed_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS checkouts, 0 AS returns
     FROM loans WHERE borrowed_at >= ? GROUP BY hour`,
    [new Date().toISOString().slice(0, 10)],
  );
  const returnRows = await select<{ hour: number; n: number }>(
    `SELECT CAST(SUBSTR(returned_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS n
     FROM loans WHERE returned_at >= ? GROUP BY hour`,
    [new Date().toISOString().slice(0, 10)],
  );
  const circulationRhythm: {
    time: string;
    checkouts: number;
    returns: number;
  }[] = [];
  for (let hour = 8; hour <= 18; hour += 2) {
    circulationRhythm.push({
      time: `${hour}:00`,
      checkouts: rhythmRows
        .filter((row) => row.hour >= hour && row.hour < hour + 2)
        .reduce((sum, row) => sum + row.checkouts, 0),
      returns: returnRows
        .filter((row) => row.hour >= hour && row.hour < hour + 2)
        .reduce((sum, row) => sum + row.n, 0),
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

export async function notifications(limit = 100): Promise<AppNotification[]> {
  return select<AppNotification>(
    `SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const result = await sqlExec(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND is_read = 0`,
    [notificationId],
  );
  if (result.rowsAffected === 0)
    throw new Error("اعلان یافت نشد یا قبلاً خوانده شده است.");
}

export async function markAllNotificationsRead(): Promise<void> {
  await sqlExec(`UPDATE notifications SET is_read = 1 WHERE is_read = 0`);
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
  "rooms",
  "columns",
  "shelves",
  "publishers",
  "categories",
  "authors",
  "tags",
  "books",
  "book_authors",
  "book_tags",
  "members",
  "copies",
  "reservations",
  "loans",
  "fines",
] as const;

/**
 * Backup rows are external data: column identifiers that reach the SQL text
 * must be plain names, never crafted strings ("x); DROP TABLE …--").
 */
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function exportLibraryBackup(): Promise<LibraryBackup> {
  const tables: LibraryBackup["tables"] = {};
  for (const table of BACKUP_TABLES) {
    tables[table] = await select(`SELECT * FROM ${table}`);
  }
  return { _version: 1, _exported_at: new Date().toISOString(), tables };
}

export async function importLibraryBackup(
  backup: LibraryBackup,
): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  for (const table of BACKUP_TABLES) {
    const rows = backup.tables?.[table];
    if (!Array.isArray(rows)) continue;
    let imported = 0;
    for (const row of rows) {
      if (table === "books" && !row.title) continue;
      if (table === "members" && !row.full_name) continue;
      if (table === "book_authors" || table === "book_tags") continue; // composite-key pairs rebuilt below
      const entries = Object.entries(row).filter(
        ([key, value]) => value !== undefined && SAFE_IDENTIFIER.test(key),
      );
      if (entries.length === 0) continue;
      const columns = entries.map(([key]) => key);
      const marks = entries.map(() => "?").join(", ");
      const updates = columns
        .filter((column) => column !== "id")
        .map((column) => `${column} = excluded.${column}`);
      await sqlExec(
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
          await sqlExec(
            `INSERT OR IGNORE INTO book_authors (book_id, author_id) VALUES (?, ?)`,
            [row.id, authorId],
          );
        }
      }
      if (Array.isArray(row.tag_ids)) {
        for (const tagId of row.tag_ids as string[]) {
          await sqlExec(
            `INSERT OR IGNORE INTO book_tags (book_id, tag_id) VALUES (?, ?)`,
            [row.id, tagId],
          );
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
    const result = await sqlExec(`DELETE FROM ${table}`);
    deleted[table] = result.rowsAffected;
  }
  deleted.notifications = (
    await sqlExec(`DELETE FROM notifications`)
  ).rowsAffected;
  await audit("delete_all_library_data", "library", "factory-reset", deleted);
  return deleted;
}

/* ═════════════════════════ Settings ══════════════════════════════════ */

export async function getLibrarySettings(): Promise<LibrarySettings> {
  return one<LibrarySettings>(`SELECT * FROM library_settings WHERE id = 1`);
}

export async function saveLibrarySettings(
  values: Partial<LibrarySettings>,
): Promise<void> {
  const assignable = Object.entries(values).filter(
    ([key, value]) =>
      key !== "id" &&
      key !== "updated_at" &&
      value !== undefined &&
      SAFE_IDENTIFIER.test(key),
  );
  if (assignable.length === 0) return;
  const columns = assignable.map(([key]) => `${key} = ?`).join(", ");
  await sqlExec(
    `UPDATE library_settings SET ${columns}, updated_at = ? WHERE id = 1`,
    [...assignable.map(([, value]) => value), timestamp()],
  );
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
  const [
    loanCategories,
    copyConditions,
    memberRoles,
    copyStatuses,
    itemTypes,
    inventoryCategories,
    memberStatuses,
    memberJoins,
  ] = await Promise.all([
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
    select<BreakdownRow>(
      `SELECT status AS label, COUNT(*) AS n FROM copies GROUP BY status`,
    ),
    select<BreakdownRow>(
      `SELECT COALESCE(item_type, '') AS label, COUNT(*) AS n FROM books WHERE archived_at IS NULL GROUP BY item_type`,
    ),
    select<BreakdownRow>(
      `SELECT COALESCE(cat.name, '') AS label, COUNT(*) AS n
         FROM copies c JOIN books b ON b.id = c.book_id LEFT JOIN categories cat ON cat.id = b.category_id
         WHERE c.status != 'archived' GROUP BY cat.name`,
    ),
    select<BreakdownRow>(
      `SELECT COALESCE(status, '') AS label, COUNT(*) AS n FROM members GROUP BY status`,
    ),
    select<BreakdownRow>(
      `SELECT SUBSTR(joined_at, 1, 7) AS label, COUNT(*) AS n FROM members
         GROUP BY SUBSTR(joined_at, 1, 7) ORDER BY SUBSTR(joined_at, 1, 7) ASC`,
    ),
  ]);
  return {
    loanCategories,
    copyConditions,
    memberRoles,
    copyStatuses,
    itemTypes,
    inventoryCategories,
    memberStatuses,
    memberJoins,
  };
}

/** Deletes all circulation history (loans + fines); affected copies return to the shelves. */
export async function clearCirculation(): Promise<void> {
  await sqlExec(
    `UPDATE copies SET status = 'available' WHERE status = 'on-loan'`,
  );
  await sqlExec(`DELETE FROM fines`);
  await sqlExec(`DELETE FROM loans`);
}
