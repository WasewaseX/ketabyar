import { PackageSearch } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CopyEditModal } from "../../components/CopyEditModal";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { EmptyState } from "../../components/ui/primitives";
import { PageTitle } from "../../components/ui/shared";
import { deleteCopy } from "../../data/repositories/library";
import type { Copy, Shelf } from "../../types";
import { BrowseAssignModal } from "./BrowseAssignModal";
import { InventoryList } from "./InventoryList";
import { ColumnModal, RoomsModal, ShelfEditModal } from "./InventoryModals";
import { InventoryHeaderActions, InventoryToolbar } from "./InventoryToolbar";
import { ShelfGrid } from "./ShelfGrid";

/** Left column: page header, toolbar and the map/list switch. */
export function InventoryMain({
  stats,
  term,
  setTerm,
  conditionFilter,
  setConditionFilter,
  gridView,
  setGridView,
  rowOrderDesc,
  setRowOrderDesc,
  onRefresh,
  refreshing,
  onNewColumn,
  roomColumns,
  roomShelves,
  rows,
  shelfAt,
  selectedShelfId,
  onSelectShelf,
  onCreateShelf,
  onDeleteColumn,
  listRows,
  selectedIds,
  setSelectedIds,
  onEditCopy,
  onRowContextMenu,
  currentPage,
  totalPages,
  setPage,
  total,
  pageSize,
  copyDelete,
  invalidate,
}: {
  stats: { total: number; shelved: number; repair: number; missing: number };
  term: string;
  setTerm: (value: string) => void;
  conditionFilter: string;
  setConditionFilter: (value: string) => void;
  gridView: boolean;
  setGridView: (value: boolean) => void;
  rowOrderDesc: boolean;
  setRowOrderDesc: (updater: (value: boolean) => boolean) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onNewColumn: () => void;
  roomColumns: { id: string; room_id: string; number: number }[];
  roomShelves: (Shelf & { copies: Copy[] })[];
  rows: { letters: string[]; floor: (Shelf & { copies: Copy[] })[] };
  shelfAt: (
    letter: string,
    columnId: string,
  ) => (Shelf & { copies: Copy[] }) | undefined;
  selectedShelfId: string | null;
  onSelectShelf: (shelfId: string) => void;
  onCreateShelf: (input: {
    columnId: string;
    code: string;
    shelfType: "top" | "floor";
  }) => void;
  onDeleteColumn: (columnId: string) => void;
  listRows: Copy[];
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  onEditCopy: (copy: Copy) => void;
  onRowContextMenu: (event: ReactMouseEvent, items: ContextMenuItem[]) => void;
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  total: number;
  pageSize: number;
  copyDelete: (id: string) => void;
  invalidate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 flex-1">
      <PageTitle
        title={t("inventory.title", "Inventory")}
        detail={t("inventory.subtitle", "Rooms, bookcases and the shelf map.")}
        action={
          <InventoryHeaderActions
            onRefresh={onRefresh}
            refreshing={refreshing}
            onNewColumn={onNewColumn}
          />
        }
      />

      <InventoryToolbar
        stats={stats}
        term={term}
        setTerm={setTerm}
        conditionFilter={conditionFilter}
        setConditionFilter={setConditionFilter}
        gridView={gridView}
        setGridView={setGridView}
        rowOrderDesc={rowOrderDesc}
        setRowOrderDesc={setRowOrderDesc}
      />

      {gridView ? (
        <ShelfGrid
          roomColumns={roomColumns}
          roomShelves={roomShelves}
          rows={rows}
          shelfAt={shelfAt}
          selectedShelfId={selectedShelfId}
          onSelectShelf={onSelectShelf}
          onCreateShelf={onCreateShelf}
          onDeleteColumn={onDeleteColumn}
        />
      ) : (
        <InventoryList
          listRows={listRows}
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          onEditCopy={onEditCopy}
          onRowContextMenu={onRowContextMenu}
          currentPage={currentPage}
          totalPages={totalPages}
          setPage={setPage}
          total={total}
          pageSize={pageSize}
          copyDelete={copyDelete}
          invalidate={invalidate}
        />
      )}
    </div>
  );
}

/** Archive the selected copies from the list view. */
export function InventoryBulkBar({
  selectedIds,
  setSelectedIds,
  invalidate,
}: {
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  invalidate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
      <span className="font-bold">
        {t("inventory.bulk.selectedCount", "{{count}} selected", {
          count: selectedIds.size,
        })}
      </span>
      <button
        type="button"
        className="rounded-lg px-2 py-1 hover:bg-white/10"
        onClick={() => setSelectedIds(new Set())}
      >
        {t("inventory.deselectAll", "Deselect all")}
      </button>
      <button
        type="button"
        className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
        onClick={async () => {
          if (
            !window.confirm(
              t(
                "inventory.archiveSelectedConfirm",
                "Archive {{count}} copies?",
                {
                  count: selectedIds.size,
                },
              ),
            )
          )
            return;
          for (const id of selectedIds)
            await deleteCopy(id).catch(() => undefined);
          toast.success(
            t("inventory.alerts.bulkArchived", "Selected copies archived"),
          );
          setSelectedIds(new Set());
          invalidate();
        }}
      >
        {t("inventory.archiveSelectedBtn", "Archive selected")}
      </button>
    </div>
  );
}

/** The page's modal cluster, driven by the page's dialog state. */
export function InventoryDialogs({
  editCopy,
  setEditCopy,
  allShelves,
  allCopies,
  manageRoomsOpen,
  setManageRoomsOpen,
  newColumnOpen,
  activeRoomId,
  editShelfOpen,
  setEditShelfOpen,
  browseOpen,
  setBrowseOpen,
  rooms,
  onCloseColumn,
}: {
  editCopy: Copy | null;
  setEditCopy: (copy: Copy | null) => void;
  allShelves: Shelf[];
  allCopies: Copy[];
  manageRoomsOpen: boolean;
  setManageRoomsOpen: (open: boolean) => void;
  newColumnOpen: boolean;
  onCloseColumn: () => void;
  activeRoomId: string;
  editShelfOpen: Shelf | null;
  setEditShelfOpen: (shelf: Shelf | null) => void;
  browseOpen: Shelf | null;
  setBrowseOpen: (shelf: Shelf | null) => void;
  rooms: import("../../types").Room[];
}) {
  return (
    <>
      {editCopy ? (
        <CopyEditModal
          copy={editCopy}
          onClose={() => setEditCopy(null)}
          shelves={allShelves}
        />
      ) : null}
      {manageRoomsOpen ? (
        <RoomsModal rooms={rooms} onClose={() => setManageRoomsOpen(false)} />
      ) : null}
      {newColumnOpen ? (
        <ColumnModal roomId={activeRoomId} onClose={() => onCloseColumn()} />
      ) : null}
      {editShelfOpen ? (
        <ShelfEditModal
          shelf={editShelfOpen}
          onClose={() => setEditShelfOpen(null)}
        />
      ) : null}
      {browseOpen ? (
        <BrowseAssignModal
          target={browseOpen}
          allShelves={allShelves}
          allCopies={allCopies}
          onClose={() => setBrowseOpen(null)}
        />
      ) : null}
    </>
  );
}

/** Shown before the first room exists — the map starts empty. */
export function NoRoomsState({ onManageRooms }: { onManageRooms: () => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <PageTitle
        title={t("inventory.title", "Inventory")}
        detail={t("inventory.subtitle", "Rooms, bookcases and the shelf map.")}
      />
      <EmptyState
        icon={PackageSearch}
        title={t("inventory.noRooms", "No rooms yet")}
        description={t(
          "inventory.noRoomsHint",
          "Add the first room to start mapping your shelves.",
        )}
        action={
          <button
            type="button"
            onClick={onManageRooms}
            className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white dark:bg-accent-dark"
          >
            {t("inventory.addRoom", "Add a room")}
          </button>
        }
      />
    </div>
  );
}
