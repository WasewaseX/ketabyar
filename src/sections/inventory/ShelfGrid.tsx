import { Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Copy, Shelf } from "../../types";
import { FLOOR_SHELF_CODE } from "../../types";
import { ShelfCell } from "./ShelfCell";
import type { InventoryColumn } from "./useInventoryLayout";

type ShelfWithCopies = Shelf & { copies: Copy[] };

/** The stack map: column headers, lettered rows, floor row and legend. */
export function ShelfGrid({
  roomColumns,
  roomShelves,
  rows,
  shelfAt,
  selectedShelfId,
  onSelectShelf,
  onCreateShelf,
  onDeleteColumn,
}: {
  roomColumns: InventoryColumn[];
  roomShelves: ShelfWithCopies[];
  rows: { letters: string[]; floor: ShelfWithCopies[] };
  shelfAt: (letter: string, columnId: string) => ShelfWithCopies | undefined;
  selectedShelfId: string | null;
  onSelectShelf: (shelfId: string) => void;
  onCreateShelf: (input: {
    columnId: string;
    code: string;
    shelfType: "top" | "floor";
  }) => void;
  onDeleteColumn: (columnId: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <div className="min-w-[720px]">
        {/* Column headers */}
        <div
          className="mb-2 flex gap-1.5 ps-8"
          style={{
            gridTemplateColumns: `repeat(${roomColumns.length}, 90px)`,
          }}
        >
          {roomColumns.map((column) => {
            const columnShelves = roomShelves.filter(
              (shelf) => shelf.column_id === column.id,
            );
            const allEmpty = columnShelves.every(
              (shelf) => (shelf.copy_count ?? 0) === 0,
            );
            return (
              <div
                key={column.id}
                className="group relative text-center text-xs font-bold text-ink/55 dark:text-ivory/55"
              >
                {String(column.number).padStart(2, "0")}
                {allEmpty ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          t(
                            "inventory.confirmDeleteColumn",
                            "Delete this empty bookcase?",
                          ),
                        )
                      )
                        onDeleteColumn(column.id);
                    }}
                    className="absolute -top-1 -end-1 hidden rounded-full bg-red-600 p-1 text-white group-hover:block"
                    aria-label={t("inventory.deleteColumn", "Delete bookcase")}
                  >
                    <Trash2 size={10} />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {/* Lettered rows */}
        {rows.letters.map((letter) => (
          <div
            key={letter}
            className="mb-1.5 grid gap-1.5"
            style={{
              gridTemplateColumns: `32px repeat(${roomColumns.length}, 90px)`,
            }}
          >
            <div className="flex items-center justify-center text-xs font-bold text-ink/45 dark:text-ivory/45">
              {letter}
            </div>
            {roomColumns.map((column) => {
              const shelf = shelfAt(letter, column.id);
              if (!shelf) {
                return (
                  <button
                    type="button"
                    key={column.id}
                    onClick={() =>
                      onCreateShelf({
                        columnId: column.id,
                        code: letter,
                        shelfType: "top",
                      })
                    }
                    className="h-16 rounded-lg border border-dashed border-ink/15 text-[10px] font-semibold text-ink/35 transition hover:border-accent/40 hover:text-accent dark:border-white/12 dark:text-ivory/35 dark:hover:text-accent-dark"
                  >
                    +{" "}
                    {t("inventory.addShelfAt", "Add shelf {{code}}", {
                      code: letter,
                    })}
                  </button>
                );
              }
              return (
                <ShelfCell
                  key={column.id}
                  shelf={shelf}
                  selected={selectedShelfId === shelf.id}
                  onSelect={() => onSelectShelf(shelf.id)}
                />
              );
            })}
          </div>
        ))}

        {/* Floor row */}
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `32px repeat(${roomColumns.length}, 90px)`,
          }}
        >
          <div className="flex items-center justify-center text-xs font-bold text-copper">
            {FLOOR_SHELF_CODE}
          </div>
          {roomColumns.map((column) => {
            const floorShelf = roomShelves.find(
              (shelf) =>
                shelf.column_id === column.id && shelf.shelf_type === "floor",
            );
            if (!floorShelf) {
              return (
                <button
                  type="button"
                  key={column.id}
                  onClick={() =>
                    onCreateShelf({
                      columnId: column.id,
                      code: FLOOR_SHELF_CODE,
                      shelfType: "floor",
                    })
                  }
                  className="h-16 rounded-lg border border-dashed border-copper/30 text-[10px] font-semibold text-copper/70 transition hover:bg-copper/10"
                >
                  +{" "}
                  {t("inventory.addShelfAt", "Add shelf {{code}}", {
                    code: FLOOR_SHELF_CODE,
                  })}
                </button>
              );
            }
            return (
              <ShelfCell
                key={column.id}
                shelf={floorShelf}
                selected={selectedShelfId === floorShelf.id}
                onSelect={() => onSelectShelf(floorShelf.id)}
                floor
              />
            );
          })}
        </div>

        <div className="mt-3 flex items-center gap-4 text-[10px] text-ink/50 dark:text-ivory/50">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#478574]" />
            {t("inventory.legendGood", "Good")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#d2ae96]" />
            {t("inventory.legendRepair", "Repair")}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#a87c5f]" />
            {t("inventory.legendMissing", "Missing")}
          </span>
        </div>
      </div>
    </div>
  );
}
