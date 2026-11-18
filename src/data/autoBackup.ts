import {
  exportLibraryBackup,
  importLibraryBackup,
} from "./repositories/library";
import type { LibraryBackup } from "./repositories/librarySqlSystem";

/**
 * Automatic local data safety net.
 *
 * Every 10 minutes (and once at shell start) the whole library is exported
 * through the same backup envelope the manual JSON export uses, then stored
 * in IndexedDB (the Tauri WebView's own storage, independent of the SQLite
 * database file). The last 10 snapshots are kept; identical consecutive
 * snapshots are skipped so idle hours don't churn the rotation.
 *
 * The storage driver falls back to an in-memory map whenever IndexedDB is
 * unavailable (plain browser tests, private modes with storage blocked), so
 * the feature degrades instead of crashing.
 */

const IDB_NAME = "ketabyar-backups";
const IDB_STORE = "snapshots";
const MAX_SNAPSHOTS = 10;
export const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000;

/** Export/import seams so tests (and future engines) can substitute fakes.
 * Both members are optional; omitted ones fall back to the real functions. */
export interface BackupDeps {
  exporter?: () => Promise<LibraryBackup>;
  importer?: (backup: LibraryBackup) => Promise<Record<string, number>>;
}

export interface SnapshotMeta {
  key: string;
  exportedAt: string;
  bytes: number;
}

interface SnapshotStoreDriver {
  get(key: string): Promise<string | null>;
  keys(): Promise<string[]>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

const memoryDriver: SnapshotStoreDriver = (() => {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async keys() {
      return [...map.keys()];
    },
    async set(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      map.delete(key);
    },
  };
})();

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDB_STORE))
        request.result.createObjectStore(IDB_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const idbDriver: SnapshotStoreDriver = {
  async get(key) {
    const db = await openIdb();
    const value = await idbRequest(
      db
        .transaction(IDB_STORE, "readonly")
        .objectStore(IDB_STORE)
        .get(key) as IDBRequest<string | undefined>,
    );
    return value ?? null;
  },
  async keys() {
    const db = await openIdb();
    return idbRequest(
      db
        .transaction(IDB_STORE, "readonly")
        .objectStore(IDB_STORE)
        .getAllKeys() as IDBRequest<IDBValidKey[]>,
    ).then((keys) => keys.map(String));
  },
  async set(key, value) {
    const db = await openIdb();
    await idbRequest(
      db
        .transaction(IDB_STORE, "readwrite")
        .objectStore(IDB_STORE)
        .put(value, key),
    );
  },
  async delete(key) {
    const db = await openIdb();
    await idbRequest(
      db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).delete(key),
    );
  },
};

let cachedDriver: SnapshotStoreDriver | null = null;
/** Monotonic suffix: 12 snapshots can land in the same millisecond. */
let keySeq = 0;

/** IndexedDB when available, memory otherwise (decided once per session). */
async function getDriver(): Promise<SnapshotStoreDriver> {
  if (cachedDriver) return cachedDriver;
  if (typeof indexedDB !== "undefined") {
    try {
      await openIdb();
      cachedDriver = idbDriver;
      return cachedDriver;
    } catch {
      /* private mode / blocked storage → memory fallback */
    }
  }
  cachedDriver = memoryDriver;
  return cachedDriver;
}

const defaultBackupDeps = {
  exporter: () => exportLibraryBackup(),
  importer: (backup: LibraryBackup) => importLibraryBackup(backup),
};

function resolveDeps(deps?: BackupDeps) {
  return {
    exporter: deps?.exporter ?? defaultBackupDeps.exporter,
    importer: deps?.importer ?? defaultBackupDeps.importer,
  };
}

export async function runAutoBackup(
  maxKeep = MAX_SNAPSHOTS,
  deps?: BackupDeps,
): Promise<{ saved: boolean; skippedIdentical: boolean }> {
  const driver = await getDriver();
  const backup = await resolveDeps(deps).exporter();
  const json = JSON.stringify(backup);
  const existing = (await driver.keys()).sort();
  const latest =
    existing.length > 0
      ? await driver.get(existing[existing.length - 1])
      : null;
  if (latest === json) return { saved: false, skippedIdentical: true };
  const key = `snap-${Date.now()}-${(keySeq++).toString(36).padStart(4, "0")}`;
  await driver.set(key, json);
  for (const stale of existing.slice(
    0,
    Math.max(0, existing.length + 1 - maxKeep),
  ))
    await driver.delete(stale);
  return { saved: true, skippedIdentical: false };
}

/** Newest-first snapshot list with envelope metadata. */
export async function listSnapshots(): Promise<SnapshotMeta[]> {
  const driver = await getDriver();
  const keys = (await driver.keys()).sort().reverse();
  const metas: SnapshotMeta[] = [];
  for (const key of keys) {
    const raw = await driver.get(key);
    if (!raw) continue;
    let exportedAt = key.slice("snap-".length);
    try {
      const parsed = JSON.parse(raw) as LibraryBackup;
      if (parsed._exported_at) exportedAt = parsed._exported_at;
    } catch {
      /* unreadable envelope — fall back to the key timestamp */
    }
    metas.push({ key, exportedAt, bytes: raw.length });
  }
  return metas;
}

export async function restoreSnapshot(
  key: string,
  deps?: BackupDeps,
): Promise<Record<string, number>> {
  const driver = await getDriver();
  const raw = await driver.get(key);
  if (!raw) throw new Error(`Snapshot not found: ${key}`);
  return resolveDeps(deps).importer(JSON.parse(raw) as LibraryBackup);
}

let activeStop: (() => void) | null = null;

/** Snapshot now, then every `intervalMs`. Idempotent; returns the stopper. */
export function startAutoBackupScheduler(
  intervalMs = AUTO_BACKUP_INTERVAL_MS,
  deps?: BackupDeps,
): () => void {
  if (activeStop) return activeStop;
  void runAutoBackup(MAX_SNAPSHOTS, deps).catch(console.error);
  const timer = setInterval(() => {
    void runAutoBackup(MAX_SNAPSHOTS, deps).catch(console.error);
  }, intervalMs);
  activeStop = () => {
    clearInterval(timer);
    activeStop = null;
  };
  return activeStop;
}
