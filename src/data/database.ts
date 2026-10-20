import { ensureSchema } from "./schema";
import { seedIfEmpty } from "./seed";
import { sweepReservations } from "./repositories/library";

/**
 * Boot sequence for the fully-offline local database:
 *   1. open SQLite + apply the idempotent schema (tables, indexes, views, settings row)
 *   2. seed Persian university demo data the first time the library is empty
 *   3. sweep expired holds / promote the reservation queue
 * Throws only if the local database itself cannot be opened (e.g. disk error).
 */
export async function initializeDatabase(): Promise<void> {
  await ensureSchema();
  await seedIfEmpty();
  await sweepReservations();
}
