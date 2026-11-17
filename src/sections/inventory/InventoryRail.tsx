import { Pencil, ScanLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Copy, Room } from "../../types";
import { cn } from "../../utils/cn";
import { occupancyTone } from "./ShelfCell";
import type { ShelfWithCopies } from "./types";
import type { ScanSession } from "./useScanSession";

/** Right rail: rooms picker, the scan-session panel and the shelf details. */
export function InventoryRail({
  rooms,
  activeRoomId,
  onSelectRoom,
  onManageRooms,
  scan,
  selectedShelf,
  onEditShelf,
  onEditCopy,
  onBrowse,
  onBeginScan,
  selectedShelfId,
}: {
  rooms: Room[];
  activeRoomId: string;
  onSelectRoom: (roomId: string) => void;
  onManageRooms: () => void;
  scan: ScanSession;
  selectedShelf: ShelfWithCopies | null;
  selectedShelfId: string | null;
  onEditShelf: (shelf: ShelfWithCopies) => void;
  onEditCopy: (copy: Copy) => void;
  onBrowse: (shelf: ShelfWithCopies) => void;
  onBeginScan: (code: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="sticky top-0 w-[320px] shrink-0 self-start space-y-4">
      <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-bold">{t("inventory.rooms", "Rooms")}</p>
          <button
            type="button"
            onClick={onManageRooms}
            className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
            aria-label={t("inventory.manageRooms", "Manage rooms")}
          >
            <Pencil size={13} />
          </button>
        </div>
        <ul className="space-y-1">
          {rooms.map((room) => (
            <li key={room.id}>
              <button
                type="button"
                onClick={() => onSelectRoom(room.id)}
                className={cn(
                  "w-full rounded-xl px-3 py-2 text-start text-sm transition",
                  activeRoomId === room.id
                    ? "bg-accent font-bold text-white dark:bg-accent-dark"
                    : "hover:bg-ink/5 dark:hover:bg-white/5",
                )}
              >
                {room.name}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {scan.open ? (
        <div className="rounded-[var(--radius-card)] border border-copper/30 bg-copper/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-bold text-copper">
              <ScanLine size={15} />{" "}
              {t("inventory.scanningInProgress", "Scanning in progress")}
            </p>
            <button
              type="button"
              onClick={scan.togglePaused}
              className="rounded-lg bg-copper/15 px-2.5 py-1 text-[11px] font-bold text-copper"
            >
              {scan.paused
                ? t("inventory.resume", "Resume")
                : t("inventory.pause", "Pause")}
            </button>
          </div>
          <p className="text-xs text-ink/60 dark:text-ivory/60">
            {t("inventory.targetShelfCode", "Target shelf")}:{" "}
            <b>{scan.target}</b>
          </p>
          <div className="my-2 h-1.5 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
            <div
              className="h-full rounded-full bg-copper transition-all"
              style={{ width: `${scan.progress}%` }}
            />
          </div>
          <input
            ref={scan.onScannerMount}
            disabled={scan.paused}
            aria-label={t(
              "inventory.scanBarcodePlaceholder",
              "Scan or type a barcode, press Enter",
            )}
            className="field-input font-mono"
            placeholder={t(
              "inventory.scanBarcodePlaceholder",
              "Scan or type a barcode, press Enter",
            )}
            value={scan.input}
            onChange={(event) => scan.setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") scan.submit();
            }}
          />
          <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] font-bold">
            <span className="rounded-lg bg-accent/10 py-1 text-accent dark:text-accent-dark">
              {t("inventory.onShelfLabel", "On shelf")}:{" "}
              {scan.results.filter((r) => r.status === "found").length}
            </span>
            <span className="rounded-lg bg-amber-500/10 py-1 text-amber-600">
              {t("inventory.wrongShelfLabel", "Wrong shelf")}:{" "}
              {scan.results.filter((r) => r.status === "misplaced").length}
            </span>
            <span className="rounded-lg bg-red-600/10 py-1 text-red-600">
              {t("inventory.notFoundLabel", "Not found")}:{" "}
              {scan.results.filter((r) => r.status === "unknown").length}
            </span>
          </div>
          <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px]">
            {scan.results.map((result) => (
              <li
                key={result.barcode}
                className="flex items-center justify-between rounded-lg bg-white/60 px-2 py-1 font-mono dark:bg-black/20"
              >
                <span>{result.barcode}</span>
                <span
                  className={
                    result.status === "found"
                      ? "text-accent"
                      : result.status === "misplaced"
                        ? "text-amber-600"
                        : "text-red-600"
                  }
                >
                  {result.status === "found"
                    ? "✓"
                    : result.status === "misplaced"
                      ? `→ ${result.expected ?? t("inventory.unassigned", "—")}`
                      : "?"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={scan.discard}
              className="flex-1 rounded-xl bg-ink/6 py-2 text-xs font-bold dark:bg-white/10"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={scan.finish}
              className="flex-1 rounded-xl bg-copper py-2 text-xs font-bold text-white"
            >
              {t("inventory.finishShelf", "Finish shelf")}
            </button>
          </div>
        </div>
      ) : selectedShelf ? (
        <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-bold">
              {selectedShelf.shelf_type === "floor"
                ? t("inventory.floorShelf", "Floor shelf")
                : t("inventory.shelfLetter", "Shelf {{code}}", {
                    code: selectedShelf.code,
                  })}
              {" · "}
              {selectedShelf.room}
            </p>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onEditShelf(selectedShelf)}
                className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
                aria-label="Edit"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={() => onBeginScan(selectedShelf.code)}
                className="rounded-lg bg-copper/15 p-1.5 text-copper"
                aria-label="Scan"
              >
                <ScanLine size={12} />
              </button>
            </div>
          </div>
          {selectedShelf.notes ? (
            <p className="mb-1 text-[11px] text-ink/50 dark:text-ivory/50">
              {selectedShelf.notes}
            </p>
          ) : null}
          <div className="mb-1 h-2 overflow-hidden rounded-full bg-ink/8 dark:bg-white/10">
            <div
              className={cn(
                "h-full rounded-full",
                occupancyTone(
                  selectedShelf.copy_count && selectedShelf.capacity
                    ? (selectedShelf.copy_count / selectedShelf.capacity) * 100
                    : 0,
                ),
              )}
              style={{
                width: `${selectedShelf.capacity ? Math.min(100, ((selectedShelf.copy_count ?? 0) / selectedShelf.capacity) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mb-3 text-[11px] text-ink/50 dark:text-ivory/50">
            {t("inventory.occupancyLabel", "{{count}} of {{capacity}}", {
              count: selectedShelf.copy_count ?? 0,
              capacity: selectedShelf.capacity,
            })}
          </p>
          {selectedShelf.copies.length === 0 ? (
            <p className="text-xs text-ink/50 dark:text-ivory/50">
              {t("inventory.noItemsPlaced", "Nothing on this shelf yet.")}
            </p>
          ) : (
            <ul className="mb-3 max-h-44 space-y-1.5 overflow-y-auto">
              {selectedShelf.copies.map((copy) => (
                <li key={copy.id}>
                  <button
                    type="button"
                    onClick={() => onEditCopy(copy)}
                    className="w-full rounded-xl px-2 py-1.5 text-start hover:bg-ink/5 dark:hover:bg-white/5"
                  >
                    <p className="truncate text-[12px] font-semibold">
                      {copy.title}
                    </p>
                    <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">
                      {copy.barcode}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => onBrowse(selectedShelf)}
            className="w-full rounded-xl bg-accent py-2 text-xs font-bold text-white dark:bg-accent-dark"
          >
            {t("inventory.addItemsBtn", "Add items to this shelf")}
          </button>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <p className="text-sm font-bold">
            {selectedShelfId === null
              ? t("inventory.noShelfSelected", "Pick a shelf")
              : ""}
          </p>
          <p className="mt-1 text-xs text-ink/50 dark:text-ivory/50">
            {t(
              "inventory.noShelfHint",
              "Click a shelf cell to see its items, edit it, or run a scan session.",
            )}
          </p>
          <button
            type="button"
            onClick={() => onBeginScan("")}
            className="mt-3 w-full rounded-xl border border-dashed border-copper/40 py-2 text-xs font-bold text-copper"
          >
            {t("inventory.beginSession", "Start a scan session")}
          </button>
        </div>
      )}
    </aside>
  );
}
