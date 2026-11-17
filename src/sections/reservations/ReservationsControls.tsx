import { CalendarClock } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { EmptyState } from "../../components/ui/primitives";
import { FilterPill } from "../../components/ui/widgets";
import {
  acceptReservation,
  cancelReservation,
  deleteReservation,
  extendReservation,
} from "../../data/repositories/library";
import type { Reservation } from "../../types";
import { reservationMenuItems } from "./ReservationMenu";
import { ReservationRow } from "./ReservationRow";

/** Search field, status pills and the status dropdown above the holds table. */
export function ReservationsToolbar({
  term,
  setTerm,
  statusFilter,
  setStatusFilter,
  counts,
}: {
  term: string;
  setTerm: (value: string) => void;
  statusFilter: "all" | "ready" | "queued" | "cancelled";
  setStatusFilter: (value: "all" | "ready" | "queued" | "cancelled") => void;
  counts: { all: number; ready: number; queued: number; cancelled: number };
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        aria-label={t(
          "reservations.searchPlaceholder",
          "Title, member, barcode…",
        )}
        className="field-input max-w-xs"
        placeholder={t(
          "reservations.searchPlaceholder",
          "Title, member, barcode…",
        )}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        <FilterPill
          active={statusFilter === "all"}
          count={counts.all}
          onClick={() => setStatusFilter("all")}
        >
          {t("reservations.filters.all", "All")}
        </FilterPill>
        <FilterPill
          active={statusFilter === "ready"}
          count={counts.ready}
          onClick={() => setStatusFilter("ready")}
        >
          {t("reservations.status.ready", "Ready for pickup")}
        </FilterPill>
        <FilterPill
          active={statusFilter === "queued"}
          count={counts.queued}
          onClick={() => setStatusFilter("queued")}
        >
          {t("reservations.status.queued", "Queued")}
        </FilterPill>
        <FilterPill
          active={statusFilter === "cancelled"}
          count={counts.cancelled}
          onClick={() => setStatusFilter("cancelled")}
        >
          {t("reservations.status.cancelled", "Cancelled")}
        </FilterPill>
      </div>
      <select
        aria-label={t("reservations.filterStatus", "Status filter")}
        className="field-select ms-auto max-w-44"
        value={statusFilter}
        onChange={(event) =>
          setStatusFilter(event.target.value as typeof statusFilter)
        }
      >
        <option value="all">
          {t("reservations.allStatuses", "All statuses")}
        </option>
        <option value="ready">{t("reservations.status.ready", "Ready")}</option>
        <option value="queued">
          {t("reservations.status.queued", "Queued")}
        </option>
        <option value="pending">
          {t("reservations.status.pending", "Pending")}
        </option>
        <option value="cancelled">
          {t("reservations.status.cancelled", "Cancelled")}
        </option>
        <option value="declined">
          {t("reservations.status.declined", "Declined")}
        </option>
        <option value="expired">
          {t("reservations.status.expired", "Expired")}
        </option>
      </select>
    </div>
  );
}

/** Column headers of the holds table. */
export function ReservationTableHeader({
  allSelected,
  onSelectAll,
}: {
  allSelected: boolean;
  onSelectAll: (checked: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <thead>
      <tr className="bg-ivory text-[11px] uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
        <th className="w-10 px-3 py-3">
          <input
            type="checkbox"
            aria-label={t("reservations.selectAll", "Select all reservations")}
            checked={allSelected}
            onChange={(event) => onSelectAll(event.target.checked)}
          />
        </th>
        <th className="px-4 py-3 text-start">
          {t("catalog.headers.title", "Title")}
        </th>
        <th className="px-4 py-3 text-start">
          {t("circulation.selectedMember", "Member")}
        </th>
        <th className="px-4 py-3 text-start">
          {t("reservations.copyBarcode", "Copy barcode")}
        </th>
        <th className="px-4 py-3 text-start">
          {t("reservations.requestDate", "Requested")}
        </th>
        <th className="px-4 py-3 text-start">
          {t("reservations.expiresDate", "Hold expires")}
        </th>
        <th className="px-4 py-3 text-start">{t("status", "Status")}</th>
        <th className="px-4 py-3 text-start">{t("actions", "Actions")}</th>
      </tr>
    </thead>
  );
}

/** Empty state shown when no holds match the current filters. */
export function ReservationsEmpty() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={CalendarClock}
      title={t("reservations.noReservations", "No reservations")}
      description={t(
        "reservations.noReservationsHelp",
        "When a member asks for a title, create a hold here — it joins the queue automatically.",
      )}
    />
  );
}

/**
 * Floating bulk bar over the selected rows. One shared runner keeps the four
 * actions identical: confirm → allSettled over the matching rows → toast,
 * clear selection, invalidate.
 */
export function ReservationsBulkBar({
  visible,
  selectedIds,
  setSelectedIds,
  invalidate,
}: {
  visible: Reservation[];
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  invalidate: () => void;
}) {
  const { t } = useTranslation();

  const runBulk = (
    confirmKey: string,
    match: (reservation: Reservation) => boolean,
    action: (id: string) => Promise<unknown>,
    successKey: string,
  ) => {
    if (
      !window.confirm(
        t(confirmKey, "Are you sure?", { count: selectedIds.size }),
      )
    )
      return;
    Promise.allSettled(
      visible
        .filter((item) => selectedIds.has(item.id) && match(item))
        .map((item) => action(item.id)),
    ).then(() => {
      toast.success(t(successKey, "Done"));
      setSelectedIds(new Set());
      invalidate();
    });
  };

  const buttonCls = "rounded-lg px-3 py-1.5 font-semibold dark:bg-accent-dark";
  const bulk = (
    confirmKey: string,
    match: (reservation: Reservation) => boolean,
    action: (id: string) => Promise<unknown>,
    successKey: string,
    label: string,
    extraClass: string,
  ) => (
    <button
      type="button"
      className={`${extraClass} ${buttonCls}`}
      onClick={() => runBulk(confirmKey, match, action, successKey)}
    >
      {label}
    </button>
  );

  return (
    <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
      <span className="font-bold">
        {t("reservations.bulk.selectedCount", "{{count}} selected", {
          count: selectedIds.size,
        })}
      </span>
      <button
        type="button"
        className="rounded-lg px-2 py-1 hover:bg-white/10"
        onClick={() => setSelectedIds(new Set())}
      >
        {t("catalog.bulk.deselectAll", "Deselect all")}
      </button>
      {bulk(
        "reservations.alerts.confirmBulkAccept",
        (item) => item.status === "pending",
        (id) => acceptReservation(id),
        "reservations.alerts.bulkAccepted",
        t("reservations.accept", "Accept"),
        "bg-accent",
      )}
      {bulk(
        "reservations.alerts.confirmBulkExtend",
        (item) => item.status === "ready",
        (id) => extendReservation(id, 7),
        "reservations.alerts.bulkExtended",
        t("reservations.extendHold", "Extend +7d"),
        "bg-copper",
      )}
      {bulk(
        "reservations.alerts.confirmBulkCancel",
        () => true,
        (id) => cancelReservation(id),
        "reservations.alerts.bulkCancelled",
        t("reservations.cancelSelected", "Cancel selected"),
        "bg-white/15",
      )}
      {bulk(
        "reservations.alerts.confirmBulkDelete",
        () => true,
        (id) => deleteReservation(id),
        "reservations.alerts.bulkDeleted",
        t("reservations.deletePermanently", "Delete permanently"),
        "bg-red-600 hover:bg-red-700",
      )}
    </div>
  );
}

/** The holds table: header, rows and the per-row context menu wiring. */
export function ReservationsTable({
  visible,
  allSelected,
  selectedIds,
  setSelectedIds,
  onOpen,
  act,
  confirmAct,
  showContextMenu,
}: {
  visible: Reservation[];
  allSelected: boolean;
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  onOpen: (reservation: Reservation) => void;
  act: (action: () => Promise<unknown>, successKey: string) => Promise<void>;
  confirmAct: (
    confirmKey: string,
    values: Record<string, unknown> | undefined,
    action: () => Promise<unknown>,
    successKey: string,
  ) => void;
  showContextMenu: (
    event: ReactMouseEvent,
    items: ContextMenuItem[],
    options?: { title?: string },
  ) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <table className="w-full text-sm" style={{ minWidth: 1000 }}>
        <ReservationTableHeader
          allSelected={allSelected}
          onSelectAll={(checked) =>
            setSelectedIds(
              checked ? new Set(visible.map((item) => item.id)) : new Set(),
            )
          }
        />
        <tbody>
          {visible.map((reservation) => (
            <ReservationRow
              key={reservation.id}
              reservation={reservation}
              selected={selectedIds.has(reservation.id)}
              onToggle={(checked) => {
                const next = new Set(selectedIds);
                if (checked) next.add(reservation.id);
                else next.delete(reservation.id);
                setSelectedIds(next);
              }}
              onOpen={() => onOpen(reservation)}
              act={act}
              confirmAct={confirmAct}
              onContextMenu={(event) =>
                showContextMenu(
                  event,
                  reservationMenuItems(reservation, t, act, confirmAct),
                  { title: reservation.title ?? "" },
                )
              }
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
