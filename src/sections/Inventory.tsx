import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "../hooks/useLibraryQuery";
import { Check, PackageSearch, Pencil, Plus, RefreshCw, ScanLine, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  copies as fetchCopies, createColumn, createRoom, createShelf, deleteColumn, deleteCopy, deleteRoom,
  getColumns, getRooms, getShelves, renameRoom, updateCopy, updateShelf,
} from "../data/repositories/library";
import { useUiStore } from "../store/uiStore";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { CopyEditModal } from "../components/CopyEditModal";
import { DefaultCover, EmptyState, ItemTypeBadge, Modal, PageLoader, StatusBadge } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { StatPill } from "../components/ui/widgets";
import { cleanBarcode } from "../utils/isbn";
import { cn } from "../utils/cn";
import { FLOOR_SHELF_CODE, shelfRowCodes, type Copy, type Room, type Shelf } from "../types";

/**
 * The physical side of the library: rooms → bookcase columns → shelf rows,
 * a visual shelf map with occupancy, scan-to-shelve audit sessions, and the
 * condition / status management for individual copies.
 */

type ScanResult = { barcode: string; status: "found" | "misplaced" | "unknown"; copy?: Copy; expected?: string | null };

const CONDITIONS = ["mint", "good", "fair", "worn", "damaged"] as const;

function occupancyTone(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-amber-500";
  return "bg-accent dark:bg-accent-dark";
}

/** Deterministic mini-drawing of a shelf's spines — original artwork. */
function ShelfSpines({ copyCount, capacity, tone }: { copyCount: number; capacity: number; tone: "good" | "warn" | "alert" }) {
  const slots = 27;
  const colors = { good: "#478574", warn: "#d2ae96", alert: "#a87c5f" };
  const filled = Math.round(Math.min(1, capacity > 0 ? copyCount / capacity : 0) * slots);
  return (
    <svg viewBox="0 0 84 42" className="h-14 w-full" aria-hidden>
      {Array.from({ length: slots }).map((_, index) => {
        const column = index % 9;
        const row = Math.floor(index / 9);
        const height = 10 + ((index * 7) % 5);
        const isFilled = index < filled;
        return (
          <rect
            key={index}
            x={column * 9 + 2}
            y={row * 14 + 2 + (12 - height)}
            width={7}
            height={height}
            rx={1}
            fill={isFilled ? colors[tone] : "#dde5e2"}
            opacity={isFilled ? 1 : 0.55}
          />
        );
      })}
    </svg>
  );
}

export function InventoryPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 15;
  const settings = useLibrarySettingsStore((state) => state.settings);

  const copiesQuery = useQuery({ queryKey: ["copies"], queryFn: () => fetchCopies() });
  const roomsQuery = useQuery({ queryKey: ["rooms"], queryFn: getRooms });
  const columnsQuery = useQuery({ queryKey: ["columns"], queryFn: getColumns });
  const shelvesQuery = useQuery({ queryKey: ["shelves"], queryFn: getShelves });

  const [roomId, setRoomId] = useState("");
  const [term, setTerm] = useState("");
  const [conditionFilter, setConditionFilter] = useState("");
  const [gridView, setGridView] = useState(true);
  const [rowOrderDesc, setRowOrderDesc] = useState(true);
  const [selectedShelfId, setSelectedShelfId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [editCopy, setEditCopy] = useState<Copy | null>(null);
  const [manageRoomsOpen, setManageRoomsOpen] = useState(false);
  const [newColumnOpen, setNewColumnOpen] = useState(false);
  const [editShelfOpen, setEditShelfOpen] = useState<Shelf | null>(null);
  const [browseOpen, setBrowseOpen] = useState<Shelf | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Scan session state
  const [scanOpen, setScanOpen] = useState(false);
  const [scanTarget, setScanTarget] = useState("");
  const [scanPaused, setScanPaused] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [scanResults, setScanResults] = useState<ScanResult[]>([]);
  const scannerRef = useRef<HTMLInputElement | null>(null);

  const allCopies = copiesQuery.data ?? [];
  const allShelves = shelvesQuery.data ?? [];
  const allRooms = roomsQuery.data ?? [];

  useEffect(() => {
    if (!roomId && allRooms.length > 0) setRoomId(allRooms[0].id);
  }, [allRooms, roomId]);

  const shelvesWithCopies = useMemo(() => {
    const byShelf = new Map<string, Copy[]>();
    for (const copy of allCopies) {
      if (copy.shelf_id) {
        const list = byShelf.get(copy.shelf_id) ?? [];
        list.push(copy);
        byShelf.set(copy.shelf_id, list);
      }
    }
    return allShelves.map((shelf) => ({ ...shelf, copies: byShelf.get(shelf.id) ?? [] }));
  }, [allCopies, allShelves]);

  const roomShelves = useMemo(
    () => shelvesWithCopies.filter((shelf) => shelf.column_id && (shelf.room_id ?? "") === roomId),
    [shelvesWithCopies, roomId],
  );

  const roomColumns = useMemo(
    () => (columnsQuery.data ?? []).filter((column) => column.room_id === roomId).sort((a, b) => a.number - b.number),
    [columnsQuery.data, roomId],
  );

  const rows = useMemo(() => {
    // Letters actually in use, plus the configured ones; floor row pinned last.
    const letters = Array.from(new Set([...shelfRowCodes(settings.shelf_row_count), ...roomShelves.filter((s) => s.shelf_type === "top").map((s) => s.code)]));
    letters.sort();
    if (rowOrderDesc) letters.reverse();
    const floor = roomShelves.filter((shelf) => shelf.shelf_type === "floor");
    return { letters, floor };
  }, [roomShelves, rowOrderDesc, settings.shelf_row_count]);

  const shelfAt = (letter: string, columnId: string) => roomShelves.find((shelf) => shelf.code === letter && shelf.column_id === columnId);

  const filteredCopies = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return allCopies.filter((copy) => {
      if (conditionFilter && copy.condition !== conditionFilter) return false;
      if (!needle) return true;
      return [copy.barcode, copy.title, copy.shelf].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [allCopies, term, conditionFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredCopies.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const listRows = gridView ? [] : filteredCopies.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const invalidate = () => void queryClient.invalidateQueries();
  const refreshAll = () => { void copiesQuery.refetch(); void shelvesQuery.refetch(); void roomsQuery.refetch(); void columnsQuery.refetch(); };

  const stats = useMemo(() => {
    const shelved = allCopies.filter((copy) => copy.shelf_id).length;
    const repair = allCopies.filter((copy) => copy.condition === "damaged" || copy.condition === "worn").length;
    const missing = allCopies.filter((copy) => copy.status === "lost" || copy.status === "repair").length;
    return { total: allCopies.length, shelved, repair, missing };
  }, [allCopies]);

  const selectedShelf = shelvesWithCopies.find((shelf) => shelf.id === selectedShelfId) ?? null;

  /* ── Scan session ─────────────────────────────────────────────────── */

  const beginScan = (code: string) => {
    if (!code.trim()) {
      toast.warning(t("inventory.alerts.specifyShelf", "Type or pick the shelf code first"));
      return;
    }
    setScanTarget(code.trim().toUpperCase());
    setScanResults([]);
    setScanPaused(false);
    setScanOpen(true);
  };

  const submitScan = () => {
    if (scanPaused) return;
    const value = cleanBarcode(scanInput);
    if (!value) return;
    if (scanResults.some((result) => result.barcode === value)) {
      toast.warning(t("inventory.alerts.alreadyScanned", "This barcode was already scanned"));
      setScanInput("");
      return;
    }
    const match = allCopies.find((copy) => copy.barcode.toUpperCase() === value || copy.accession_number.toUpperCase() === value);
    if (!match) {
      setScanResults((results) => [{ barcode: value, status: "unknown" }, ...results]);
      toast.error(t("inventory.alerts.notRecognized", "Unknown item"));
    } else if ((match.shelf ?? "").toUpperCase() === scanTarget) {
      setScanResults((results) => [{ barcode: value, status: "found", copy: match }, ...results]);
      toast.success(t("inventory.alerts.scannedSuccess", "On the right shelf"));
    } else {
      setScanResults((results) => [{ barcode: value, status: "misplaced", copy: match, expected: match.shelf }, ...results]);
      toast.info(t("inventory.wrongShelfLabel", "Wrong shelf"));
    }
    setScanInput("");
    scannerRef.current?.focus();
  };

  const finishScan = async () => {
    const targetShelf = allShelves.find((shelf) => shelf.code.toUpperCase() === scanTarget);
    let moved = 0;
    for (const result of scanResults) {
      if (result.status === "misplaced" && result.copy) {
        await updateCopy(result.copy.id, { shelfId: targetShelf?.id ?? null });
        moved += 1;
      }
    }
    toast.success(t("inventory.alerts.auditComplete", "Audit complete — {{moved}} item(s) re-shelved", { moved }));
    setScanOpen(false);
    setScanTarget("");
    setScanResults([]);
    invalidate();
  };

  const scanTargetCopies = allCopies.filter((copy) => (copy.shelf ?? "").toUpperCase() === scanTarget).length;
  const scanProgress = scanTargetCopies > 0 ? Math.min(100, Math.round((scanResults.filter((result) => result.status !== "unknown").length / scanTargetCopies) * 100)) : 0;

  if (copiesQuery.isLoading || shelvesQuery.isLoading) {
    return <PageLoader label={t("inventory.loading", "Loading the stacks…")} />;
  }

  if (allRooms.length === 0) {
    return (
      <div>
        <PageTitle title={t("inventory.title", "Inventory")} detail={t("inventory.subtitle", "Rooms, bookcases and the shelf map.")} />
        <EmptyState
          icon={PackageSearch}
          title={t("inventory.noRooms", "No rooms yet")}
          description={t("inventory.noRoomsHint", "Add the first room to start mapping your shelves.")}
          action={
            <button onClick={() => setManageRoomsOpen(true)} className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark">
              {t("inventory.addRoom", "Add a room")}
            </button>
          }
        />
        {manageRoomsOpen ? <RoomsModal rooms={allRooms} onClose={() => setManageRoomsOpen(false)} /> : null}
      </div>
    );
  }

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1">
        <PageTitle
          title={t("inventory.title", "Inventory")}
          detail={t("inventory.subtitle", "Rooms, bookcases and the shelf map.")}
          action={
            <div className="flex gap-2">
              <button onClick={refreshAll} className="rounded-[var(--radius-control)] bg-ink/5 p-2 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10" aria-label="Refresh">
                <RefreshCw size={15} className={cn(copiesQuery.isFetching && "animate-spin")} />
              </button>
              <button
                onClick={() => setNewColumnOpen(true)}
                disabled={!roomId}
                className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark"
              >
                <Plus size={15} />
                {t("inventory.addColumn", "New bookcase")}
              </button>
            </div>
          }
        />

        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatPill icon={PackageSearch} label={t("inventory.totalCopies", "Total copies")} value={stats.total} />
          <StatPill icon={Check} label={t("inventory.shelved", "Shelved")} value={`${stats.shelved} (${stats.total ? Math.round((stats.shelved / stats.total) * 100) : 0}%)`} />
          <StatPill icon={Pencil} label={t("inventory.needsRepair", "Needs repair")} value={stats.repair} tone="amber" />
          <StatPill icon={X} label={t("inventory.missing", "Missing / repair")} value={stats.missing} tone="danger" />
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <input className="field-input max-w-xs" placeholder={t("inventory.searchPlaceholder", "Barcode, title or shelf…")} value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }} />
          <select className="field-select max-w-40" value={conditionFilter} onChange={(event) => { setConditionFilter(event.target.value); setPage(1); }}>
            <option value="">{t("inventory.allConditions", "All conditions")}</option>
            {CONDITIONS.map((value) => <option key={value} value={value}>{t(`catalog.condition.${value}`, value)}</option>)}
          </select>
          <div className="ms-auto flex items-center gap-2">
            <button onClick={() => setGridView(true)} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", gridView ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/5 text-ink/60 dark:bg-white/5 dark:text-ivory/60")}>
              {t("inventory.gridView", "Map")}
            </button>
            <button onClick={() => setGridView(false)} className={cn("rounded-full px-3 py-1.5 text-xs font-bold", !gridView ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/5 text-ink/60 dark:bg-white/5 dark:text-ivory/60")}>
              {t("inventory.listView", "List")}
            </button>
            {gridView ? (
              <button onClick={() => setRowOrderDesc((value) => !value)} className="rounded-full bg-ink/5 px-3 py-1.5 text-xs font-bold text-ink/60 dark:bg-white/5 dark:text-ivory/60">
                {rowOrderDesc ? t("inventory.rowOrderDesc", "A at bottom") : t("inventory.rowOrderAsc", "A at top")}
              </button>
            ) : null}
          </div>
        </div>

        {gridView ? (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
            <div className="min-w-[720px]">
              {/* Column headers */}
              <div className="mb-2 flex gap-1.5 ps-8" style={{ gridTemplateColumns: `repeat(${roomColumns.length}, 90px)` }}>
                {roomColumns.map((column) => {
                  const columnShelves = roomShelves.filter((shelf) => shelf.column_id === column.id);
                  const allEmpty = columnShelves.every((shelf) => (shelf.copy_count ?? 0) === 0);
                  return (
                    <div key={column.id} className="group relative text-center text-xs font-bold text-ink/55 dark:text-ivory/55">
                      {String(column.number).padStart(2, "0")}
                      {allEmpty ? (
                        <button
                          onClick={() => { if (window.confirm(t("inventory.confirmDeleteColumn", "Delete this empty bookcase?"))) columnDelete.mutate(column.id); }}
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
                <div key={letter} className="mb-1.5 grid gap-1.5" style={{ gridTemplateColumns: `32px repeat(${roomColumns.length}, 90px)` }}>
                  <div className="flex items-center justify-center text-xs font-bold text-ink/45 dark:text-ivory/45">{letter}</div>
                  {roomColumns.map((column) => {
                    const shelf = shelfAt(letter, column.id);
                    if (!shelf) {
                      return (
                        <button
                          key={column.id}
                          onClick={() => shelfCreate.mutate({ columnId: column.id, code: letter, shelfType: "top" })}
                          className="h-16 rounded-lg border border-dashed border-ink/15 text-[10px] font-semibold text-ink/35 transition hover:border-accent/40 hover:text-accent dark:border-white/12 dark:text-ivory/35 dark:hover:text-accent-dark"
                        >
                          + {t("inventory.addShelfAt", "Add shelf {{code}}", { code: letter })}
                        </button>
                      );
                    }
                    return <ShelfCell key={column.id} shelf={shelf} selected={selectedShelfId === shelf.id} onSelect={() => setSelectedShelfId(selectedShelfId === shelf.id ? null : shelf.id)} />;
                  })}
                </div>
              ))}

              {/* Floor row */}
              <div className="grid gap-1.5" style={{ gridTemplateColumns: `32px repeat(${roomColumns.length}, 90px)` }}>
                <div className="flex items-center justify-center text-xs font-bold text-copper">{FLOOR_SHELF_CODE}</div>
                {roomColumns.map((column) => {
                  const floorShelf = roomShelves.find((shelf) => shelf.column_id === column.id && shelf.shelf_type === "floor");
                  if (!floorShelf) {
                    return (
                      <button
                        key={column.id}
                        onClick={() => shelfCreate.mutate({ columnId: column.id, code: FLOOR_SHELF_CODE, shelfType: "floor" })}
                        className="h-16 rounded-lg border border-dashed border-copper/30 text-[10px] font-semibold text-copper/70 transition hover:bg-copper/10"
                      >
                        + {t("inventory.addShelfAt", "Add shelf {{code}}", { code: FLOOR_SHELF_CODE })}
                      </button>
                    );
                  }
                  return <ShelfCell key={column.id} shelf={floorShelf} selected={selectedShelfId === floorShelf.id} onSelect={() => setSelectedShelfId(selectedShelfId === floorShelf.id ? null : floorShelf.id)} floor />;
                })}
              </div>

              <div className="mt-3 flex items-center gap-4 text-[10px] text-ink/50 dark:text-ivory/50">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#478574]" />{t("inventory.legendGood", "Good")}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#d2ae96]" />{t("inventory.legendRepair", "Repair")}</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#a87c5f]" />{t("inventory.legendMissing", "Missing")}</span>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
              <table className="w-full text-sm" style={{ minWidth: 820 }}>
                <thead>
                  <tr className="bg-ivory text-[11px] uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
                    <th className="w-10 px-3 py-3"><input type="checkbox" onChange={(event) => setSelectedIds(event.target.checked ? new Set(listRows.map((row) => row.id)) : new Set())} /></th>
                    <th className="px-4 py-3 text-start">{t("inventory.barcodeHeader", "Barcode")}</th>
                    <th className="px-4 py-3 text-start">{t("catalog.headers.type", "Type")}</th>
                    <th className="px-4 py-3 text-start">{t("catalog.headers.title", "Title")}</th>
                    <th className="px-4 py-3 text-start">{t("catalog.details.shelfLabel", "Shelf")}</th>
                    <th className="px-4 py-3 text-start">{t("catalog.details.copyCondition", "Condition")}</th>
                    <th className="px-4 py-3 text-start">{t("inventory.status", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {listRows.map((copy) => (
                    <tr
                      key={copy.id}
                      onClick={() => setEditCopy(copy)}
                      onContextMenu={(event) =>
                        showContextMenu(event, [
                          ...(copy.status !== "available" ? [{ id: "avail", label: t("inventory.setAvailable", "Set available"), onClick: () => updateCopy(copy.id, { status: "available" }).then(invalidate) }] : []),
                          ...(copy.status !== "on-loan" ? [{ id: "loan", label: t("inventory.setLoaned", "Set on loan"), onClick: () => updateCopy(copy.id, { status: "on-loan" }).then(invalidate) }] : []),
                          ...(copy.status !== "repair" ? [{ id: "repair", label: t("inventory.setRepair", "Set in repair"), onClick: () => updateCopy(copy.id, { status: "repair" }).then(invalidate) }] : []),
                          ...(copy.status !== "lost" ? [{ id: "lost", label: t("inventory.setLost", "Set lost"), onClick: () => updateCopy(copy.id, { status: "lost" }).then(invalidate) }] : []),
                          { id: "d", divider: true },
                          { id: "delete", label: t("inventory.deleteCopy", "Archive copy"), variant: "danger", onClick: () => { if (window.confirm(t("inventory.archiveConfirm", "Archive copy {{barcode}}?", { barcode: copy.barcode }))) copyDelete.mutate(copy.id); } },
                        ])
                      }
                      className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
                    >
                      <td className="border-b border-ink/6 px-3 py-3 dark:border-white/6" onClick={(event) => event.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(copy.id)}
                          onChange={(event) => {
                            const next = new Set(selectedIds);
                            if (event.target.checked) next.add(copy.id);
                            else next.delete(copy.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                      <td className="border-b border-ink/6 px-4 py-3 font-mono text-xs dark:border-white/6">{copy.barcode}</td>
                      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6"><ItemTypeBadge type={copy.item_type} /></td>
                      <td className="max-w-56 border-b border-ink/6 px-4 py-3 dark:border-white/6"><p className="truncate">{copy.title}</p></td>
                      <td className="border-b border-ink/6 px-4 py-3 text-xs dark:border-white/6">{copy.shelf ? `${copy.shelf} · ${copy.room ?? ""}` : t("inventory.unassigned", "Unassigned")}</td>
                      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", copy.condition === "damaged" || copy.condition === "worn" ? "bg-amber-500/15 text-amber-600" : "bg-ink/6 dark:bg-white/8")}>
                          {t(`catalog.condition.${copy.condition}`, copy.condition)}
                        </span>
                      </td>
                      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6"><StatusBadge value={copy.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
              <span>{t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, filteredCopies.length), total: filteredCopies.length })}</span>
              <div className="flex items-center gap-2">
                <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">‹</button>
                <span className="tabular-nums">{currentPage} / {totalPages}</span>
                <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">›</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Right rail */}
      <aside className="sticky top-0 w-[320px] shrink-0 self-start space-y-4">
        <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">{t("inventory.rooms", "Rooms")}</p>
            <button onClick={() => setManageRoomsOpen(true)} className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15" aria-label={t("inventory.manageRooms", "Manage rooms")}>
              <Pencil size={13} />
            </button>
          </div>
          <ul className="space-y-1">
            {allRooms.map((room: Room) => (
              <li key={room.id}>
                <button
                  onClick={() => { setRoomId(room.id); setSelectedShelfId(null); }}
                  className={cn("w-full rounded-xl px-3 py-2 text-start text-sm transition", roomId === room.id ? "bg-accent font-bold text-white dark:bg-accent-dark" : "hover:bg-ink/5 dark:hover:bg-white/5")}
                >
                  {room.name}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {scanOpen ? (
          <div className="rounded-[var(--radius-card)] border border-copper/30 bg-copper/5 p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 text-sm font-bold text-copper"><ScanLine size={15} /> {t("inventory.scanningInProgress", "Scanning in progress")}</p>
              <button onClick={() => setScanPaused((value) => !value)} className="rounded-lg bg-copper/15 px-2.5 py-1 text-[11px] font-bold text-copper">
                {scanPaused ? t("inventory.resume", "Resume") : t("inventory.pause", "Pause")}
              </button>
            </div>
            <p className="text-xs text-ink/60 dark:text-ivory/60">{t("inventory.targetShelfCode", "Target shelf")}: <b>{scanTarget}</b></p>
            <div className="my-2 h-1.5 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-copper transition-all" style={{ width: `${scanProgress}%` }} />
            </div>
            <input
              ref={scannerRef}
              autoFocus={!scanPaused}
              disabled={scanPaused}
              className="field-input font-mono"
              placeholder={t("inventory.scanBarcodePlaceholder", "Scan or type a barcode, press Enter")}
              value={scanInput}
              onChange={(event) => setScanInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") submitScan(); }}
            />
            <div className="mt-2 grid grid-cols-3 gap-1 text-center text-[10px] font-bold">
              <span className="rounded-lg bg-accent/10 py-1 text-accent dark:text-accent-dark">{t("inventory.onShelfLabel", "On shelf")}: {scanResults.filter((r) => r.status === "found").length}</span>
              <span className="rounded-lg bg-amber-500/10 py-1 text-amber-600">{t("inventory.wrongShelfLabel", "Wrong shelf")}: {scanResults.filter((r) => r.status === "misplaced").length}</span>
              <span className="rounded-lg bg-red-600/10 py-1 text-red-600">{t("inventory.notFoundLabel", "Not found")}: {scanResults.filter((r) => r.status === "unknown").length}</span>
            </div>
            <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px]">
              {scanResults.map((result) => (
                <li key={result.barcode} className="flex items-center justify-between rounded-lg bg-white/60 px-2 py-1 font-mono dark:bg-black/20">
                  <span>{result.barcode}</span>
                  <span className={result.status === "found" ? "text-accent" : result.status === "misplaced" ? "text-amber-600" : "text-red-600"}>
                    {result.status === "found" ? "✓" : result.status === "misplaced" ? `→ ${result.expected ?? t("inventory.unassigned", "—")}` : "?"}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button onClick={() => { if (window.confirm(t("inventory.alerts.confirmDiscardSession", "Discard this scanning session?"))) { setScanOpen(false); setScanResults([]); } }} className="flex-1 rounded-xl bg-ink/6 py-2 text-xs font-bold dark:bg-white/10">{t("common.cancel", "Cancel")}</button>
              <button onClick={() => void finishScan()} className="flex-1 rounded-xl bg-copper py-2 text-xs font-bold text-white">{t("inventory.finishShelf", "Finish shelf")}</button>
            </div>
          </div>
        ) : selectedShelf ? (
          <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-sm font-bold">
                {selectedShelf.shelf_type === "floor" ? t("inventory.floorShelf", "Floor shelf") : t("inventory.shelfLetter", "Shelf {{code}}", { code: selectedShelf.code })}
                {" · "}{selectedShelf.room}
              </p>
              <div className="flex gap-1">
                <button onClick={() => setEditShelfOpen(selectedShelf)} className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15" aria-label="Edit"><Pencil size={12} /></button>
                <button onClick={() => beginScan(selectedShelf.code)} className="rounded-lg bg-copper/15 p-1.5 text-copper" aria-label="Scan"><ScanLine size={12} /></button>
              </div>
            </div>
            {selectedShelf.notes ? <p className="mb-1 text-[11px] text-ink/50 dark:text-ivory/50">{selectedShelf.notes}</p> : null}
            <div className="mb-1 h-2 overflow-hidden rounded-full bg-ink/8 dark:bg-white/10">
              <div className={cn("h-full rounded-full", occupancyTone(selectedShelf.copy_count && selectedShelf.capacity ? (selectedShelf.copy_count / selectedShelf.capacity) * 100 : 0))} style={{ width: `${selectedShelf.capacity ? Math.min(100, ((selectedShelf.copy_count ?? 0) / selectedShelf.capacity) * 100) : 0}%` }} />
            </div>
            <p className="mb-3 text-[11px] text-ink/50 dark:text-ivory/50">{t("inventory.occupancyLabel", "{{count}} of {{capacity}}", { count: selectedShelf.copy_count ?? 0, capacity: selectedShelf.capacity })}</p>
            {selectedShelf.copies.length === 0 ? (
              <p className="text-xs text-ink/50 dark:text-ivory/50">{t("inventory.noItemsPlaced", "Nothing on this shelf yet.")}</p>
            ) : (
              <ul className="mb-3 max-h-44 space-y-1.5 overflow-y-auto">
                {selectedShelf.copies.map((copy) => (
                  <li key={copy.id}>
                    <button onClick={() => setEditCopy(copy)} className="w-full rounded-xl px-2 py-1.5 text-start hover:bg-ink/5 dark:hover:bg-white/5">
                      <p className="truncate text-[12px] font-semibold">{copy.title}</p>
                      <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">{copy.barcode}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => setBrowseOpen(selectedShelf)} className="w-full rounded-xl bg-accent py-2 text-xs font-bold text-white dark:bg-accent-dark">
              {t("inventory.addItemsBtn", "Add items to this shelf")}
            </button>
          </div>
        ) : (
          <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
            <p className="text-sm font-bold">{selectedShelfId === null ? t("inventory.noShelfSelected", "Pick a shelf") : ""}</p>
            <p className="mt-1 text-xs text-ink/50 dark:text-ivory/50">{t("inventory.noShelfHint", "Click a shelf cell to see its items, edit it, or run a scan session.")}</p>
            <button onClick={() => beginScan("")} className="mt-3 w-full rounded-xl border border-dashed border-copper/40 py-2 text-xs font-bold text-copper">
              {t("inventory.beginSession", "Start a scan session")}
            </button>
          </div>
        )}
      </aside>

      {editCopy ? <CopyEditModal copy={editCopy} onClose={() => setEditCopy(null)} shelves={allShelves} /> : null}
      {manageRoomsOpen ? <RoomsModal rooms={allRooms} onClose={() => setManageRoomsOpen(false)} /> : null}
      {newColumnOpen ? <ColumnModal roomId={roomId} onClose={() => setNewColumnOpen(false)} /> : null}
      {editShelfOpen ? <ShelfEditModal shelf={editShelfOpen} onClose={() => setEditShelfOpen(null)} /> : null}
      {browseOpen ? <BrowseAssignModal target={browseOpen} allShelves={allShelves} onClose={() => setBrowseOpen(null)} /> : null}

      {selectedIds.size > 0 && !gridView ? (
        <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
          <span className="font-bold">{t("inventory.bulk.selectedCount", "{{count}} selected", { count: selectedIds.size })}</span>
          <button className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>{t("inventory.deselectAll", "Deselect all")}</button>
          <button
            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
            onClick={async () => {
              if (!window.confirm(t("inventory.archiveSelectedConfirm", "Archive {{count}} copies?", { count: selectedIds.size }))) return;
              for (const id of selectedIds) await deleteCopy(id).catch(() => undefined);
              toast.success(t("inventory.alerts.bulkArchived", "Selected copies archived"));
              setSelectedIds(new Set());
              invalidate();
            }}
          >
            {t("inventory.archiveSelectedBtn", "Archive selected")}
          </button>
        </div>
      ) : null}
    </div>
  );

  /* ── Mutations (declared inside so they close over the queries) ───── */

  function ShelfCell({ shelf, selected, onSelect, floor }: { shelf: Shelf & { copies: Copy[] }; selected: boolean; onSelect: () => void; floor?: boolean }) {
    const count = shelf.copies.length || shelf.copy_count || 0;
    const pctValue = shelf.capacity > 0 ? (count / shelf.capacity) * 100 : 0;
    const hasMissing = shelf.copies.some((copy) => copy.status === "lost" || copy.status === "repair");
    const hasWorn = shelf.copies.some((copy) => copy.condition === "worn" || copy.condition === "fair" || copy.condition === "damaged");
    const tone = hasMissing ? "alert" : hasWorn ? "warn" : "good";
    return (
      <button
        onClick={onSelect}
        title={floor ? t("inventory.floorShelfHint", "Oversized floor-level shelf for large items") : undefined}
        className={cn(
          "relative rounded-lg border p-1 text-start transition",
          selected ? "border-copper ring-2 ring-copper" : "border-ink/10 hover:border-copper/50 dark:border-white/10",
        )}
      >
        <ShelfSpines copyCount={count} capacity={shelf.capacity} tone={tone} />
        <div className="flex items-center justify-between px-1 pb-0.5 text-[9px] font-bold text-ink/55 dark:text-ivory/55">
          <span>{shelf.code}{floor ? ` · ${t("inventory.floorShelf", "Floor")}` : ""}</span>
          <span className={cn("h-1.5 w-1.5 rounded-full", occupancyTone(pctValue))} />
          <span className="tabular-nums">{count}/{shelf.capacity}</span>
        </div>
      </button>
    );
  }

  const columnDelete = useMutation({ mutationFn: deleteColumn, onSuccess: () => { toast.success(t("inventory.columnDeleted", "Bookcase deleted")); invalidate(); }, onError: (error: Error) => toast.error(error.message) });
  const copyDelete = useMutation({ mutationFn: deleteCopy, onSuccess: () => { toast.success(t("inventory.copyDeleted", "Copy archived")); invalidate(); }, onError: (error: Error) => toast.error(error.message) });
  const shelfCreate = useMutation({
    mutationFn: (input: { columnId: string; code: string; shelfType: "top" | "floor" }) => createShelf(input.columnId, input.code, input.shelfType),
    onSuccess: () => { toast.success(t("inventory.shelfAdded", "Shelf added")); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  function RoomsModal({ rooms, onClose }: { rooms: Room[]; onClose: () => void }) {
    const [name, setName] = useState("");
    const roomCreate = useMutation({
      mutationFn: () => createRoom(name.trim()),
      onSuccess: () => { toast.success(t("inventory.roomCreated", "Room created")); setName(""); invalidate(); },
      onError: (error: Error) => toast.error(error.message),
    });
    const roomRename = useMutation({
      mutationFn: ({ id, newName }: { id: string; newName: string }) => renameRoom(id, newName),
      onSuccess: () => { toast.success(t("inventory.roomRenamed", "Room renamed")); invalidate(); },
      onError: (error: Error) => toast.error(error.message),
    });
    const roomDelete = useMutation({
      mutationFn: deleteRoom,
      onSuccess: () => { toast.success(t("inventory.roomRemoved", "Room removed")); invalidate(); },
      onError: (error: Error) => toast.error(error.message),
    });
    return (
      <Modal isOpen onClose={onClose} title={t("inventory.manageRoomsTitle", "Manage rooms")} size="md">
        <ul className="mb-4 space-y-2">
          {rooms.map((room) => (
            <li key={room.id} className="flex items-center gap-2 rounded-xl border border-ink/8 p-2 dark:border-white/8">
              <input
                className="field-input"
                defaultValue={room.name}
                onKeyDown={(event) => {
                  if (event.key === "Enter") roomRename.mutate({ id: room.id, newName: (event.target as HTMLInputElement).value.trim() });
                  if (event.key === "Escape") (event.target as HTMLInputElement).value = room.name;
                }}
              />
              <button
                onClick={() => { if (window.confirm(t("inventory.deleteRoomConfirm", "Delete room {{name}}? Only works if it holds no shelved copies.", { name: room.name }))) roomDelete.mutate(room.id); }}
                className="rounded-lg bg-red-600/10 p-2 text-red-600 hover:bg-red-600/20"
                aria-label={t("delete", "Delete")}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input className="field-input" placeholder={t("inventory.roomName", "Room name")} value={name} onChange={(event) => setName(event.target.value)} />
          <button onClick={() => roomCreate.mutate()} disabled={!name.trim() || roomCreate.isPending} className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark">
            {t("inventory.addRoom", "Add room")}
          </button>
        </div>
      </Modal>
    );
  }

  function ColumnModal({ roomId: room, onClose }: { roomId: string; onClose: () => void }) {
    const codes = shelfRowCodes(settings.shelf_row_count);
    const [picked, setPicked] = useState<Set<string>>(new Set(codes.slice(0, 2)));
    const create = useMutation({
      mutationFn: () => createColumn(room, Array.from(picked)),
      onSuccess: () => { toast.success(t("inventory.columnCreated", "Bookcase created with its floor shelf and rows")); invalidate(); onClose(); },
      onError: (error: Error) => toast.error(error.message),
    });
    return (
      <Modal isOpen onClose={onClose} title={t("inventory.createColumn", "New bookcase")} size="md">
        <p className="mb-3 text-[13px] text-ink/60 dark:text-ivory/60">{t("inventory.addColumnHint", "Each bookcase gets a floor shelf plus the lettered rows you pick.")}</p>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {codes.map((code) => (
            <button
              key={code}
              onClick={() => {
                const next = new Set(picked);
                if (next.has(code)) next.delete(code);
                else next.add(code);
                setPicked(next);
              }}
              className={cn("h-9 w-9 rounded-lg text-sm font-bold transition", picked.has(code) ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/6 hover:bg-ink/12 dark:bg-white/8 dark:hover:bg-white/15")}
            >
              {code}
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            if (picked.size === 0) {
              toast.warning(t("inventory.selectRowsWarning", "Pick at least one lettered row"));
              return;
            }
            create.mutate();
          }}
          disabled={create.isPending}
          className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-accent-dark"
        >
          {create.isPending ? t("inventory.creatingColumn", "Creating…") : t("inventory.createColumn", "Create bookcase")}
        </button>
      </Modal>
    );
  }

  function ShelfEditModal({ shelf, onClose }: { shelf: Shelf; onClose: () => void }) {
    const [capacity, setCapacity] = useState(String(shelf.capacity));
    const [notes, setNotes] = useState(shelf.notes ?? "");
    const save = useMutation({
      mutationFn: () => updateShelf(shelf.id, { capacity: Math.max(1, parseInt(capacity, 10) || 1), notes: notes || null }),
      onSuccess: () => { toast.success(t("inventory.shelfUpdated", "Shelf updated")); invalidate(); onClose(); },
      onError: (error: Error) => toast.error(error.message),
    });
    return (
      <Modal isOpen onClose={onClose} title={shelf.shelf_type === "floor" ? t("inventory.editFloorShelfTitle", "Edit floor shelf") : t("inventory.editShelfTitle", "Edit shelf {{code}}", { code: shelf.code })} size="md">
        <div className="grid gap-4">
          <label>
            <span>{t("inventory.shelfCapacityLabel", "Capacity")} *</span>
            <input type="number" min={1} required className="field-input" value={capacity} onChange={(event) => setCapacity(event.target.value)} />
          </label>
          <label>
            <span>{t("inventory.notesOptional", "Notes (optional)")}</span>
            <textarea className="field-input" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-accent-dark">
            {t("inventory.saveChanges", "Save changes")}
          </button>
        </div>
      </Modal>
    );
  }

  function BrowseAssignModal({ target, allShelves, onClose }: { target: Shelf; allShelves: Shelf[]; onClose: () => void }) {
    const targetCopies = allCopies.filter((copy) => copy.shelf_id === target.id);
    const [termLocal, setTermLocal] = useState("");
    const [shelfFilter, setShelfFilter] = useState("");
    const move = useMutation({
      mutationFn: ({ copyId, shelfId }: { copyId: string; shelfId: string | null }) => updateCopy(copyId, { shelfId }),
      onSuccess: (_result, variables) => {
        toast.success(variables.shelfId ? t("inventory.assignedToast", "Placed on the shelf") : t("inventory.removedToast", "Removed from the shelf"));
        invalidate();
      },
      onError: (error: Error) => toast.error(error.message),
    });

    const candidates = useMemo(() => {
      const needle = termLocal.trim().toLowerCase();
      return allCopies.filter((copy) => {
        if (shelfFilter === "unassigned" && copy.shelf_id) return false;
        if (shelfFilter && shelfFilter !== "unassigned" && shelfFilter !== "all" && copy.shelf_id !== shelfFilter) return false;
        if (!needle) return true;
        return [copy.title, copy.author, copy.barcode, copy.accession_number].filter(Boolean).join(" ").toLowerCase().includes(needle);
      });
    }, [allCopies, termLocal, shelfFilter]);

    return (
      <Modal isOpen onClose={onClose} title={t("inventory.addAssignTitle", "Shelve items")} size="xl">
        <p className="mb-3 text-[13px] text-ink/60 dark:text-ivory/60">
          {t("inventory.browseHint", "Moving items onto")}{" "}
          <b>{target.shelf_type === "floor" ? t("inventory.floorShelf", "Floor shelf") : t("inventory.shelfLetter", "Shelf {{code}}", { code: target.code })}</b>
          {" · "}
          {t("inventory.occupancyLabel", "{{count}} of {{capacity}}", { count: targetCopies.length, capacity: target.capacity })}
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <input className="field-input max-w-xs" placeholder={t("inventory.browseSearchPlaceholder", "Title, author, barcode…")} value={termLocal} onChange={(event) => setTermLocal(event.target.value)} />
          <select className="field-select max-w-48" value={shelfFilter} onChange={(event) => setShelfFilter(event.target.value)}>
            <option value="unassigned">{t("inventory.unassignedOption", "Unassigned only")}</option>
            <option value="all">{t("inventory.allShelvesOption", "All shelves")}</option>
            {allShelves.filter((shelf) => shelf.id !== target.id).map((shelf) => (
              <option key={shelf.id} value={shelf.id}>{shelf.code} ({shelf.room})</option>
            ))}
          </select>
        </div>
        <ul className="max-h-80 space-y-1.5 overflow-y-auto">
          {candidates.length === 0 ? (
            <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">{t("inventory.noMatchingItems", "No items match")}</p>
          ) : (
            candidates.slice(0, 60).map((copy) => {
              const onTarget = copy.shelf_id === target.id;
              return (
                <li key={copy.id} className="flex items-center gap-3 rounded-xl border border-ink/8 p-2.5 dark:border-white/8">
                  {copy.cover_path ? <img src={copy.cover_path} alt="" className="h-10 w-7 rounded object-cover" /> : <DefaultCover type={copy.item_type} className="h-10 w-7 rounded" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{copy.title}</p>
                    <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">{copy.barcode} · {copy.accession_number}</p>
                  </div>
                  {onTarget ? (
                    <button onClick={() => move.mutate({ copyId: copy.id, shelfId: null })} className="rounded-lg bg-red-600/10 px-3 py-1.5 text-[11px] font-bold text-red-600">
                      {t("inventory.remove", "Remove")}
                    </button>
                  ) : (
                    <button onClick={() => move.mutate({ copyId: copy.id, shelfId: target.id })} className="rounded-lg bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent dark:text-accent-dark">
                      {t("inventory.addToShelfBtn", "Add to shelf")}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </Modal>
    );
  }
}
