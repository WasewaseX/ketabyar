import type { Copy, Room, Shelf } from "../../types";
import { FLOOR_SHELF_CODE, shelfRowCodes } from "../../types";
import type { ShelfWithCopies } from "./types";

/** Stable empties — keeps the layout memos from re-running every render. */
const EMPTY_COPIES: Copy[] = [];
const EMPTY_ROOMS: Room[] = [];
const EMPTY_SHELVES: Shelf[] = [];

export type InventoryColumn = { id: string; room_id: string; number: number };

/**
 * All derived inventory layout state: shelves grouped with their copies,
 * the active room's shelves/columns, row letters, the filtered copy list
 * and the summary stats.
 */
export function useInventoryLayout(deps: {
  allCopies: Copy[] | undefined;
  allShelves: Shelf[] | undefined;
  allRooms: Room[] | undefined;
  columns: InventoryColumn[] | undefined;
  activeRoomId: string;
  rowOrderDesc: boolean;
  shelfRowCount: number;
  term: string;
  conditionFilter: string;
}) {
  const allCopies = deps.allCopies ?? EMPTY_COPIES;
  const allShelves = deps.allShelves ?? EMPTY_SHELVES;
  const allRooms = deps.allRooms ?? EMPTY_ROOMS;

  const shelvesWithCopies: ShelfWithCopies[] = (() => {
    const byShelf = new Map<string, Copy[]>();
    for (const copy of allCopies) {
      if (copy.shelf_id) {
        const list = byShelf.get(copy.shelf_id) ?? [];
        list.push(copy);
        byShelf.set(copy.shelf_id, list);
      }
    }
    return allShelves.map((shelf) => ({
      ...shelf,
      copies: byShelf.get(shelf.id) ?? [],
    }));
  })();

  const roomShelves = shelvesWithCopies.filter(
    (shelf) => shelf.column_id && (shelf.room_id ?? "") === deps.activeRoomId,
  );

  const roomColumns = (deps.columns ?? [])
    .filter((column) => column.room_id === deps.activeRoomId)
    .sort((a, b) => a.number - b.number);

  // Letters actually in use, plus the configured ones; floor row pinned last.
  const letters = Array.from(
    new Set([
      ...shelfRowCodes(deps.shelfRowCount),
      ...roomShelves.filter((s) => s.shelf_type === "top").map((s) => s.code),
    ]),
  );
  letters.sort();
  if (deps.rowOrderDesc) letters.reverse();
  const floor = roomShelves.filter((shelf) => shelf.shelf_type === "floor");
  const rows = { letters, floor };

  const shelfAt = (letter: string, columnId: string) =>
    roomShelves.find(
      (shelf) => shelf.code === letter && shelf.column_id === columnId,
    );

  const needle = deps.term.trim().toLowerCase();
  const filteredCopies = allCopies.filter((copy) => {
    if (deps.conditionFilter && copy.condition !== deps.conditionFilter)
      return false;
    if (!needle) return true;
    return [copy.barcode, copy.title, copy.shelf]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const shelved = allCopies.filter((copy) => copy.shelf_id).length;
  const repair = allCopies.filter(
    (copy) => copy.condition === "damaged" || copy.condition === "worn",
  ).length;
  const missing = allCopies.filter(
    (copy) => copy.status === "lost" || copy.status === "repair",
  ).length;
  const stats = { total: allCopies.length, shelved, repair, missing };

  return {
    allCopies,
    allShelves,
    allRooms,
    shelvesWithCopies,
    roomShelves,
    roomColumns,
    rows,
    shelfAt,
    filteredCopies,
    stats,
  };
}

export { FLOOR_SHELF_CODE };
