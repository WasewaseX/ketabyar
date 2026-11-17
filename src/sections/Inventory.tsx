import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageLoader } from "../components/ui/primitives";
import {
  copies as fetchCopies,
  getColumns,
  getRooms,
  getShelves,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import type { Copy, Shelf } from "../types";
import {
  InventoryBulkBar,
  InventoryDialogs,
  InventoryMain,
  NoRoomsState,
} from "./inventory/InventoryChrome";
import { InventoryRail } from "./inventory/InventoryRail";
import type { ShelfWithCopies } from "./inventory/types";
import { useInventoryLayout } from "./inventory/useInventoryLayout";
import { useInventoryMutations } from "./inventory/useInventoryMutations";
import { useInvalidateAll } from "./inventory/useNotifyMutation";
import { useScanSession } from "./inventory/useScanSession";

/**
 * Inventory: rooms, bookcases and the shelf map, with list view, bulk
 * archiving and the shelf-audit scan session. Layout derivation lives in
 * inventory/useInventoryLayout; the map, list, rail and modals are separate
 * components in inventory/.
 */
export function InventoryPage() {
  const { t } = useTranslation();
  const { showContextMenu } = useContextMenu();
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 15;
  const settings = useLibrarySettingsStore((state) => state.settings);

  const copiesQuery = useQuery({
    queryKey: ["copies"],
    queryFn: () => fetchCopies(),
  });
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

  const invalidate = useInvalidateAll();

  // Circulation mutations live above every early return: hooks must run on
  // every render or their bindings stay uninitialized (TDZ) when handlers fire.
  const { columnDelete, copyDelete, shelfCreate } = useInventoryMutations();

  const activeRoomId = roomId || (roomsQuery.data ?? [])[0]?.id || "";

  const {
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
  } = useInventoryLayout({
    allCopies: copiesQuery.data,
    allShelves: shelvesQuery.data,
    allRooms: roomsQuery.data,
    columns: columnsQuery.data,
    activeRoomId,
    rowOrderDesc,
    shelfRowCount: settings.shelf_row_count,
    term,
    conditionFilter,
  });

  const scan = useScanSession({ allCopies, allShelves, invalidate });

  const totalPages = Math.max(1, Math.ceil(filteredCopies.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const listRows = gridView
    ? []
    : filteredCopies.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize,
      );

  const refreshAll = () => {
    void copiesQuery.refetch();
    void shelvesQuery.refetch();
    void roomsQuery.refetch();
    void columnsQuery.refetch();
  };

  const selectedShelf: ShelfWithCopies | null =
    shelvesWithCopies.find((shelf) => shelf.id === selectedShelfId) ?? null;

  if (copiesQuery.isLoading || shelvesQuery.isLoading) {
    return <PageLoader label={t("inventory.loading", "Loading the stacks…")} />;
  }

  if (allRooms.length === 0)
    return <NoRoomsState onManageRooms={() => setManageRoomsOpen(true)} />;

  return (
    <div className="flex gap-5">
      <InventoryMain
        stats={stats}
        term={term}
        setTerm={(value) => {
          setTerm(value);
          setPage(1);
        }}
        conditionFilter={conditionFilter}
        setConditionFilter={(value) => {
          setConditionFilter(value);
          setPage(1);
        }}
        gridView={gridView}
        setGridView={setGridView}
        rowOrderDesc={rowOrderDesc}
        setRowOrderDesc={setRowOrderDesc}
        onRefresh={refreshAll}
        refreshing={copiesQuery.isFetching}
        onNewColumn={() => setNewColumnOpen(true)}
        roomColumns={roomColumns}
        roomShelves={roomShelves}
        rows={rows}
        shelfAt={shelfAt}
        selectedShelfId={selectedShelfId}
        onSelectShelf={(shelfId) =>
          setSelectedShelfId(selectedShelfId === shelfId ? null : shelfId)
        }
        onCreateShelf={(input) => shelfCreate.mutate(input)}
        onDeleteColumn={(columnId) => columnDelete.mutate(columnId)}
        listRows={listRows}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onEditCopy={setEditCopy}
        onRowContextMenu={(event, items) => showContextMenu(event, items)}
        currentPage={currentPage}
        totalPages={totalPages}
        setPage={setPage}
        total={filteredCopies.length}
        pageSize={pageSize}
        copyDelete={(id) => copyDelete.mutate(id)}
        invalidate={invalidate}
      />

      <InventoryRail
        rooms={allRooms}
        activeRoomId={activeRoomId}
        onSelectRoom={(id) => {
          setRoomId(id);
          setSelectedShelfId(null);
        }}
        onManageRooms={() => setManageRoomsOpen(true)}
        scan={scan}
        selectedShelf={selectedShelf}
        selectedShelfId={selectedShelfId}
        onEditShelf={setEditShelfOpen}
        onEditCopy={setEditCopy}
        onBrowse={setBrowseOpen}
        onBeginScan={scan.begin}
      />

      <InventoryDialogs
        editCopy={editCopy}
        setEditCopy={setEditCopy}
        allShelves={allShelves}
        allCopies={allCopies}
        manageRoomsOpen={manageRoomsOpen}
        setManageRoomsOpen={setManageRoomsOpen}
        newColumnOpen={newColumnOpen}
        onCloseColumn={() => setNewColumnOpen(false)}
        activeRoomId={activeRoomId}
        editShelfOpen={editShelfOpen}
        setEditShelfOpen={setEditShelfOpen}
        browseOpen={browseOpen}
        setBrowseOpen={setBrowseOpen}
        rooms={allRooms}
      />
      {selectedIds.size > 0 && !gridView ? (
        <InventoryBulkBar
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          invalidate={invalidate}
        />
      ) : null}
    </div>
  );
}
