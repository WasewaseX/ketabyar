import { ensureSchema } from "./schema";
import { sweepReservations } from "./repositories/library";

/**
 * Boot sequence for the fully-offline local database:
 *   1. open SQLite + apply the idempotent schema (tables, indexes, views, settings row)
 *   2. sweep expired holds / promote the reservation queue
 * The library starts EMPTY — real books, members and circulation are entered by
 * the librarian. No demo/sample data is ever created.
 * Throws only if the local database itself cannot be opened (e.g. disk error).
 */
export async function initializeDatabase(): Promise<void> {
  await ensureSchema();
  await sweepReservations();
}
