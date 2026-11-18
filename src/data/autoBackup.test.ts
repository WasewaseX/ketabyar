import { describe, expect, it } from "vitest";
import { listSnapshots, restoreSnapshot, runAutoBackup } from "./autoBackup";
import type { LibraryBackup } from "./repositories/librarySqlSystem";

/** jsdom has no IndexedDB → the memory driver backs these tests. */
const envelope = (mark: string, exportedAt?: string): LibraryBackup =>
  ({
    _version: 1,
    _exported_at: exportedAt ?? new Date().toISOString(),
    tables: { books: [{ id: "1", title: mark }] },
  }) as unknown as LibraryBackup;

const noopImporter = async () => ({ books: 1 });

describe("runAutoBackup rotation", () => {
  it("keeps only the newest 10 snapshots", async () => {
    for (let i = 0; i < 12; i++) {
      await runAutoBackup(10, {
        exporter: async () => envelope(`v${i}-${Math.random()}`),
        importer: noopImporter,
      });
    }
    expect((await listSnapshots()).length).toBe(10);
  });

  it("skips an identical consecutive snapshot", async () => {
    const fixed = envelope("same-content");
    const deps = {
      exporter: async () => fixed,
      importer: noopImporter,
    };
    const first = await runAutoBackup(10, deps);
    const second = await runAutoBackup(10, deps);
    expect(first.saved).toBe(true);
    expect(second).toEqual({ saved: false, skippedIdentical: true });
  });
});

describe("listSnapshots", () => {
  it("returns newest first with envelope metadata", async () => {
    const list = await listSnapshots();
    expect(list.length).toBeGreaterThan(0);
    for (let i = 1; i < list.length; i++)
      expect(list[i - 1].exportedAt >= list[i].exportedAt).toBe(true);
    expect(list[0].bytes).toBeGreaterThan(0);
  });
});

describe("restoreSnapshot", () => {
  it("feeds the stored envelope to the importer", async () => {
    const list = await listSnapshots();
    const holder: { backup?: LibraryBackup } = {};
    const result = await restoreSnapshot(list[0].key, {
      importer: async (backup) => {
        holder.backup = backup;
        return { books: 1 };
      },
    });
    expect(result).toEqual({ books: 1 });
    expect(holder.backup).toBeDefined();
    expect(holder.backup?.tables.books[0].title).toBeTruthy();
  });

  it("throws for an unknown key", async () => {
    await expect(
      restoreSnapshot("snap-does-not-exist", { importer: noopImporter }),
    ).rejects.toThrow();
  });
});
