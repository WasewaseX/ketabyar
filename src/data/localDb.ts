import Database from "@tauri-apps/plugin-sql";

/**
 * Local, fully-offline SQLite access layer.
 *
 * The database file lives in the OS app-config directory:
 *   Windows: %APPDATA%/ir.ketabyar.library/ketabyar.db
 */

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!_db) {
    _db = await Database.load("sqlite:ketabyar.db");
  }
  return _db;
}

/** Runs a SELECT and returns typed rows. Defaults to `any[]` for loosely-typed log rows. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function select<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await getDb();
  return db.select<T[]>(sql, params);
}

/** Runs a single INSERT / UPDATE / DELETE / DDL statement. */
export async function exec(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId?: unknown }> {
  const db = await getDb();
  return db.execute(sql, params);
}

/** SELECT that expects exactly zero or one row. */
export async function maybeOne<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await select<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** SELECT that expects exactly one row, otherwise throws (mirrors supabase `.single()`). */
export async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const row = await maybeOne<T>(sql, params);
  if (row === null) throw new Error("Expected a row but none was found.");
  return row;
}

/** Creates a RFC4122 v4 id — primary keys are UUID strings everywhere. */
export function uid(): string {
  return crypto.randomUUID();
}

/** ISO timestamp helper (UTC) — matches the timestamptz format the UI parses. */
export function nowIso(): string {
  return new Date().toISOString();
}
