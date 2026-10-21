import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CalendarClock, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  acceptReservation, addReservation, banMember, books as fetchBooks, cancelReservation, declineReservation,
  deleteReservation, extendReservation, fulfilReservation, getCopiesForBook, members as fetchMembers,
  reservations as fetchReservations, saveMember, updateReservation,
} from "../data/repositories/library";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { DefaultCover, EmptyState, Modal, PageLoader, StatusBadge } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { FilterPill } from "../components/ui/widgets";
import { dueDate, formatDisplayDate } from "../utils/dates";
import { generateRandomMemberNumber, cleanPhone, cleanText } from "../utils/isbn";
import { cn } from "../utils/cn";
import { getMemberInitials, MemberStatusBadge } from "./Members";
import type { Book, Copy, Member, Reservation, ReservationScope } from "../types";

/**
 * Holds lifecycle: request → (accept → ready / queued) → fulfilled | expired.
 * Includes the 4-step staff wizard (member/visitor → item → copy → duration)
 * and the bulk operations. The chosen copy in the wizard is advisory: the
 * repository binds an actually-available copy at accept / promotion time.
 */

/* ── Page ────────────────────────────────────────────────────────────── */

export function ReservationsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();

  const [term, setTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready" | "queued" | "cancelled">("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Reservation | null>(null);
  const [expiryDraft, setExpiryDraft] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);

  const resQuery = useQuery({ queryKey: ["reservations-page"], queryFn: fetchReservations });
  const all = resQuery.data ?? [];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "new-reservation" || params.get("action") === "add-reservation") setWizardOpen(true);
    if (params.get("book_id")) setWizardOpen(true);
    if (params.get("action") || params.get("book_id")) history.replaceState(null, "", location.pathname);
  }, [location.search]);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return all
      .filter((reservation) => {
        if (statusFilter !== "all" && reservation.status !== statusFilter) return false;
        if (!needle) return true;
        return [reservation.title, reservation.member_name, reservation.copy_barcode, reservation.copy_shelf]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  }, [all, statusFilter, term]);

  const counts = useMemo(() => ({
    all: all.length,
    ready: all.filter((item) => item.status === "ready").length,
    queued: all.filter((item) => item.status === "queued").length,
    cancelled: all.filter((item) => item.status === "cancelled" || item.status === "declined" || item.status === "expired").length,
  }), [all]);

  const invalidate = () => void queryClient.invalidateQueries();

  const act = async (action: () => Promise<unknown>, successKey: string) => {
    try {
      await action();
      toast.success(t(successKey, "Done"));
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const statusChip = (status: string) => {
    const tones: Record<string, string> = {
      ready: "bg-accent/12 text-accent dark:text-accent-dark",
      queued: "bg-copper/15 text-copper",
      pending: "bg-amber-500/12 text-amber-600",
      declined: "bg-red-600/10 text-red-600",
      fulfilled: "bg-[#2f5d8a]/12 text-[#2f5d8a]",
    };
    return (
      <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", tones[status] ?? "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55")}>
        {t(`reservations.status.${status}`, status)}
      </span>
    );
  };

  if (resQuery.isLoading) return <PageLoader label={t("reservations.loading", "Loading holds…")} />;

  return (
    <div>
      <PageTitle
        title={t("reservations.title", "Reservations")}
        detail={t("reservations.subtitle", "The hold shelf and its queue.")}
        action={
          <button
            onClick={() => setWizardOpen(true)}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark"
          >
            <Plus size={16} />
            {t("reservations.newReservation", "New reservation")}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="field-input max-w-xs" placeholder={t("reservations.searchPlaceholder", "Title, member, barcode…")} value={term} onChange={(event) => setTerm(event.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          <FilterPill active={statusFilter === "all"} count={counts.all} onClick={() => setStatusFilter("all")}>{t("reservations.filters.all", "All")}</FilterPill>
          <FilterPill active={statusFilter === "ready"} count={counts.ready} onClick={() => setStatusFilter("ready")}>{t("reservations.status.ready", "Ready for pickup")}</FilterPill>
          <FilterPill active={statusFilter === "queued"} count={counts.queued} onClick={() => setStatusFilter("queued")}>{t("reservations.status.queued", "Queued")}</FilterPill>
          <FilterPill active={statusFilter === "cancelled"} count={counts.cancelled} onClick={() => setStatusFilter("cancelled")}>{t("reservations.status.cancelled", "Cancelled")}</FilterPill>
        </div>
        <select className="field-select ms-auto max-w-44" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <option value="all">{t("reservations.allStatuses", "All statuses")}</option>
          <option value="ready">{t("reservations.status.ready", "Ready")}</option>
          <option value="queued">{t("reservations.status.queued", "Queued")}</option>
          <option value="pending">{t("reservations.status.pending", "Pending")}</option>
          <option value="cancelled">{t("reservations.status.cancelled", "Cancelled")}</option>
          <option value="declined">{t("reservations.status.declined", "Declined")}</option>
          <option value="expired">{t("reservations.status.expired", "Expired")}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={CalendarClock} title={t("reservations.noReservations", "No reservations")} description={t("reservations.noReservationsHelp", "When a member asks for a title, create a hold here — it joins the queue automatically.")} />
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <table className="w-full text-sm" style={{ minWidth: 1000 }}>
            <thead>
              <tr className="bg-ivory text-[11px] uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && visible.every((item) => selectedIds.has(item.id))}
                    onChange={(event) => setSelectedIds(event.target.checked ? new Set(visible.map((item) => item.id)) : new Set())}
                  />
                </th>
                <th className="px-4 py-3 text-start">{t("catalog.headers.title", "Title")}</th>
                <th className="px-4 py-3 text-start">{t("circulation.selectedMember", "Member")}</th>
                <th className="px-4 py-3 text-start">{t("reservations.copyBarcode", "Copy barcode")}</th>
                <th className="px-4 py-3 text-start">{t("reservations.requestDate", "Requested")}</th>
                <th className="px-4 py-3 text-start">{t("reservations.expiresDate", "Hold expires")}</th>
                <th className="px-4 py-3 text-start">{t("status", "Status")}</th>
                <th className="px-4 py-3 text-start">{t("actions", "Actions")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((reservation) => (
                <tr
                  key={reservation.id}
                  onClick={() => { setDetails(reservation); setExpiryDraft(reservation.expires_at?.slice(0, 10) ?? ""); }}
                  onContextMenu={(event) =>
                    showContextMenu(event, [
                      ...(reservation.status === "pending" ? [
                        { id: "accept", label: t("reservations.accept", "Accept"), icon: Check, variant: "success" as const, onClick: () => void act(() => acceptReservation(reservation.id), "reservations.alerts.accepted") },
                        { id: "decline", label: t("reservations.decline", "Decline"), icon: X, variant: "danger" as const, onClick: () => { const reason = window.prompt(t("reservations.declineReasonPrompt", "Reason (optional)")); if (reason !== null) void act(() => declineReservation(reservation.id, reason), "reservations.alerts.declined"); } },
                      ] : []),
                      ...(reservation.status === "ready" ? [{ id: "extend", label: t("reservations.extendHold", "Extend hold +7 days"), onClick: () => void act(() => extendReservation(reservation.id, 7), "reservations.alerts.extended") }] : []),
                      ...(reservation.status === "ready" || reservation.status === "queued" ? [{ id: "cancel", label: t("reservations.cancelRes", "Cancel reservation"), onClick: () => { if (window.confirm(t("reservations.alerts.confirmCancel", "Cancel this reservation?"))) void act(() => cancelReservation(reservation.id), "members.alerts.reservationCancelled"); } }] : []),
                      { id: "d", divider: true },
                      { id: "ban", label: t("reservations.banMember", "Ban member from reservations"), icon: Archive, variant: "danger" as const, onClick: () => { const reason = window.prompt(t("reservations.banReasonPrompt", "Ban reason (required)")); if (reason && reason.trim()) void act(() => banMember(reservation.member_id, reason.trim()), "reservations.alerts.banned"); } },
                      { id: "copyMember", label: t("reservations.copyMember", "Copy member name"), onClick: () => { void navigator.clipboard.writeText(reservation.member_name ?? ""); toast.success(t("reservations.copiedMember", "Copied")); } },
                      ...(reservation.copy_barcode ? [{ id: "copyBarcode", label: t("reservations.copyBarcodeAction", "Copy barcode"), onClick: () => { void navigator.clipboard.writeText(reservation.copy_barcode ?? ""); toast.success(t("reservations.copiedBarcode", "Copied")); } }] : []),
                      { id: "d2", divider: true },
                      { id: "delete", label: t("reservations.deleteRes", "Delete permanently"), icon: Trash2, variant: "danger" as const, onClick: () => { if (window.confirm(t("reservations.alerts.confirmHardDelete", "Permanently delete this reservation? This cannot be undone."))) void act(() => deleteReservation(reservation.id), "reservations.alerts.deleted"); } },
                    ], { title: reservation.title ?? "" })
                  }
                  className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
                >
                  <td className="border-b border-ink/6 px-3 py-3 dark:border-white/6" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(reservation.id)}
                      onChange={(event) => {
                        const next = new Set(selectedIds);
                        if (event.target.checked) next.add(reservation.id);
                        else next.delete(reservation.id);
                        setSelectedIds(next);
                      }}
                    />
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                    <div className="flex items-center gap-3">
                      {reservation.cover_path ? <img src={reservation.cover_path} alt="" className="h-10 w-7 rounded object-cover" /> : <DefaultCover type={reservation.item_type} className="h-10 w-7 rounded" />}
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{reservation.title}</p>
                        <p className="truncate text-[11px] text-ink/50 dark:text-ivory/50">{reservation.author}</p>
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-copper text-[10px] font-bold text-white">{getMemberInitials(reservation.member_name ?? "")}</span>
                      <div>
                        <p className="text-[13px] font-medium">{reservation.member_name}</p>
                        <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">{reservation.member_number}</p>
                      </div>
                      {reservation.member_banned ? <MemberStatusBadge status="suspended" iconOnly /> : null}
                    </div>
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                    {reservation.copy_barcode ? (
                      <>
                        <p className="font-mono text-xs">{reservation.copy_barcode}</p>
                        {reservation.copy_shelf ? <p className="text-[10px] text-ink/50 dark:text-ivory/50">{reservation.copy_shelf}</p> : null}
                      </>
                    ) : (
                      <p className="text-xs italic text-ink/45 dark:text-ivory/45">{t("reservations.autoAssigned", "Auto-assigned")}</p>
                    )}
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 text-xs text-ink/60 dark:border-white/6 dark:text-ivory/60">{formatDisplayDate(reservation.requested_at)}</td>
                  <td className="border-b border-ink/6 px-4 py-3 text-xs dark:border-white/6">
                    {reservation.expires_at ? <span className="font-semibold text-amber-600">{formatDisplayDate(reservation.expires_at)}</span> : "—"}
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">{statusChip(reservation.status)}</td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">
                      {reservation.status === "pending" ? (
                        <>
                          <button onClick={() => void act(() => acceptReservation(reservation.id), "reservations.alerts.accepted")} className="rounded-lg bg-accent/10 p-1.5 text-accent dark:text-accent-dark" title={t("reservations.accept", "Accept")}><Check size={13} /></button>
                          <button onClick={() => void act(() => declineReservation(reservation.id), "reservations.alerts.declined")} className="rounded-lg bg-red-600/10 p-1.5 text-red-600" title={t("reservations.decline", "Decline")}><X size={13} /></button>
                        </>
                      ) : null}
                      {reservation.status === "ready" || reservation.status === "queued" ? (
                        <>
                          <button onClick={() => void act(() => extendReservation(reservation.id, 7), "reservations.alerts.extended")} className="rounded-lg bg-copper/12 p-1.5 text-copper" title={t("reservations.extendHold", "Extend +7d")}><CalendarClock size={13} /></button>
                          <button onClick={() => { if (window.confirm(t("reservations.alerts.confirmCancel", "Cancel this reservation?"))) void act(() => cancelReservation(reservation.id), "members.alerts.reservationCancelled"); }} className="rounded-lg bg-ink/6 p-1.5 dark:bg-white/10" title={t("reservations.cancelRes", "Cancel")}><X size={13} /></button>
                        </>
                      ) : null}
                      <button
                        onClick={() => { if (window.confirm(t("reservations.alerts.confirmHardDelete", "Permanently delete this reservation? This cannot be undone."))) void act(() => deleteReservation(reservation.id), "reservations.alerts.deleted"); }}
                        className="rounded-lg bg-red-600/10 p-1.5 text-red-600"
                        title={t("reservations.deletePermanently", "Delete permanently")}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
          <span className="font-bold">{t("reservations.bulk.selectedCount", "{{count}} selected", { count: selectedIds.size })}</span>
          <button className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>{t("catalog.bulk.deselectAll", "Deselect all")}</button>
          <button
            className="rounded-lg bg-accent px-3 py-1.5 font-semibold dark:bg-accent-dark"
            onClick={() => { if (window.confirm(t("reservations.alerts.confirmBulkAccept", "Accept {{count}} pending reservation(s)?", { count: selectedIds.size }))) Promise.allSettled(visible.filter((item) => selectedIds.has(item.id) && item.status === "pending").map((item) => acceptReservation(item.id))).then(() => { toast.success(t("reservations.alerts.bulkAccepted", "Reservations accepted")); setSelectedIds(new Set()); invalidate(); }); }}
          >
            {t("reservations.accept", "Accept")}
          </button>
          <button
            className="rounded-lg bg-copper px-3 py-1.5 font-semibold"
            onClick={() => { if (window.confirm(t("reservations.alerts.confirmBulkExtend", "Extend hold for {{count}} reservation(s) by 7 days?", { count: selectedIds.size }))) Promise.allSettled(visible.filter((item) => selectedIds.has(item.id) && item.status === "ready").map((item) => extendReservation(item.id, 7))).then(() => { toast.success(t("reservations.alerts.bulkExtended", "Holds extended")); setSelectedIds(new Set()); invalidate(); }); }}
          >
            {t("reservations.extendHold", "Extend +7d")}
          </button>
          <button
            className="rounded-lg bg-white/15 px-3 py-1.5 font-semibold"
            onClick={() => { if (window.confirm(t("reservations.alerts.confirmBulkCancel", "Cancel {{count}} reservation(s)?", { count: selectedIds.size }))) Promise.allSettled(visible.filter((item) => selectedIds.has(item.id)).map((item) => cancelReservation(item.id))).then(() => { toast.success(t("reservations.alerts.bulkCancelled", "Reservations cancelled")); setSelectedIds(new Set()); invalidate(); }); }}
          >
            {t("reservations.cancelSelected", "Cancel selected")}
          </button>
          <button
            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
            onClick={() => { if (window.confirm(t("reservations.alerts.confirmBulkDelete", "PERMANENTLY DELETE {{count}} reservation(s)? This cannot be undone.", { count: selectedIds.size }))) Promise.allSettled(visible.filter((item) => selectedIds.has(item.id)).map((item) => deleteReservation(item.id))).then(() => { toast.success(t("reservations.alerts.bulkDeleted", "Reservations deleted")); setSelectedIds(new Set()); invalidate(); }); }}
          >
            {t("reservations.deletePermanently", "Delete permanently")}
          </button>
        </div>
      ) : null}

      {/* Details modal */}
      <Modal isOpen={!!details} onClose={() => setDetails(null)} title={t("reservations.detailsModal.title", "Reservation details")} size="xl">
        {details ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ivory p-3 dark:bg-white/5">
              {statusChip(details.status)}
              <span className="rounded-full bg-ink/6 px-2.5 py-0.5 text-[11px] font-bold dark:bg-white/10">{t(`reservations.scope.${details.scope}`, details.scope)}</span>
              {details.status === "queued" ? (
                <span className="rounded-full bg-copper/15 px-2.5 py-0.5 text-[11px] font-bold text-copper">
                  {t("reservations.queuePosition", "Queue position #{{position}}", { position: details.position || 1 })}
                </span>
              ) : null}
              <span className="ms-auto font-mono text-[10px] text-ink/40 dark:text-ivory/40">{details.id.slice(0, 8)}</span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex gap-3 rounded-2xl border border-ink/8 p-4 dark:border-white/8">
                {details.cover_path ? <img src={details.cover_path} alt="" className="h-24 w-16 rounded-lg object-cover" /> : <DefaultCover type={details.item_type} className="h-24 w-16 rounded-lg" iconSize={24} />}
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold leading-snug">{details.title}</p>
                  {details.subtitle ? <p className="text-xs text-ink/55 dark:text-ivory/55">{details.subtitle}</p> : null}
                  <p className="mt-1 text-xs text-ink/60 dark:text-ivory/60">{details.author}</p>
                  <p className="mt-2 text-[11px] text-ink/50 dark:text-ivory/50">
                    {details.copy_shelf ? `${t("loans.shelfLabel", "Shelf")}: ${details.copy_shelf}` : t("reservations.unassignedShelf", "Unassigned shelf")}
                    {details.copy_barcode ? ` · ${details.copy_barcode}` : ""}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-ink/8 p-4 dark:border-white/8">
                <p className="text-[13px] font-bold">{details.member_name}</p>
                <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">{details.member_number}</p>
                <dl className="mt-3 space-y-1.5 text-[13px]">
                  <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("reservations.detailsModal.requestDate", "Requested")}</dt><dd>{formatDisplayDate(details.requested_at)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("reservations.detailsModal.expiresOn", "Hold expires")}</dt><dd>{details.expires_at ? formatDisplayDate(details.expires_at) : "—"}</dd></div>
                </dl>
                <div className="mt-3 flex items-end gap-2 border-t border-ink/8 pt-3 dark:border-white/8">
                  <label className="flex-1">
                    <span className="text-[11px] font-bold">{t("reservations.editExpiry", "Edit expiry")}</span>
                    <input type="date" className="field-input" value={expiryDraft} onChange={(event) => setExpiryDraft(event.target.value)} />
                  </label>
                  <button
                    onClick={() =>
                      void act(
                        () => updateReservation(details.id, { expiresAt: expiryDraft ? new Date(`${expiryDraft}T23:59:59`).toISOString() : null }),
                        "reservations.alerts.updated",
                      )
                    }
                    className="rounded-xl bg-ink/6 px-3 py-2 text-xs font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
                  >
                    <Pencil size={12} /> {t("common.save", "Save")}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {details.status === "pending" ? (
                <>
                  <button onClick={() => { void act(() => acceptReservation(details.id), "reservations.alerts.accepted"); setDetails(null); }} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white dark:bg-accent-dark">{t("reservations.accept", "Accept")}</button>
                  <button onClick={() => { void act(() => declineReservation(details.id), "reservations.alerts.declined"); setDetails(null); }} className="rounded-xl bg-red-600/10 px-4 py-2 text-sm font-bold text-red-600">{t("reservations.decline", "Decline")}</button>
                </>
              ) : null}
              {details.status === "ready" ? (
                <button onClick={() => { void act(() => fulfilReservation(details.id), "reservations.alerts.pickedUp"); setDetails(null); }} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white dark:bg-accent-dark">
                  {t("reservations.markPickedUp", "Mark as picked up")}
                </button>
              ) : null}
              {details.status === "ready" || details.status === "queued" ? (
                <>
                  <button onClick={() => void act(() => extendReservation(details.id, 7), "reservations.alerts.extended")} className="rounded-xl bg-copper px-4 py-2 text-sm font-bold text-white">{t("reservations.extendHold", "Extend hold")}</button>
                  <button onClick={() => { void act(() => cancelReservation(details.id), "members.alerts.reservationCancelled"); setDetails(null); }} className="rounded-xl bg-ink/6 px-4 py-2 text-sm font-bold dark:bg-white/10">{t("reservations.cancelReservation", "Cancel reservation")}</button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {wizardOpen ? <Wizard onClose={() => setWizardOpen(false)} /> : null}
    </div>
  );
}

/* ── 4-step wizard ───────────────────────────────────────────────────── */

function Wizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const settings = useLibrarySettingsStore((state) => state.settings);

  const [step, setStep] = useState(0);
  const [memberMode, setMemberMode] = useState<"registered" | "visitor">("registered");
  const [memberTerm, setMemberTerm] = useState("");
  const [memberDept, setMemberDept] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberId, setMemberId] = useState("");
  const [visitor, setVisitor] = useState({ name: "", email: "", phone: "", dept: "" });

  const [itemTerm, setItemTerm] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemType, setItemType] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "out">("all");
  const [bookId, setBookId] = useState("");

  const [copyChoice, setCopyChoice] = useState<string>("");

  const [scope, setScope] = useState<ReservationScope>("internal");
  const [expires, setExpires] = useState(dueDate(settings.reservation_hold_days));
  const [submitting, setSubmitting] = useState(false);

  const membersQuery = useQuery({ queryKey: ["members", memberTerm], queryFn: () => fetchMembers(memberTerm) });
  const booksQuery = useQuery({ queryKey: ["books", itemTerm, itemType], queryFn: () => fetchBooks(itemTerm, itemType) });
  const copiesQuery = useQuery({ queryKey: ["wizard-copies", bookId], queryFn: () => getCopiesForBook(bookId), enabled: !!bookId });

  const allMembers = membersQuery.data ?? [];
  const memberOptions = useMemo(
    () => allMembers
      .filter((member) => member.status !== "archived")
      .filter((member) => !memberDept || member.department === memberDept)
      .filter((member) => !memberRole || member.role === memberRole)
      .slice(0, 30),
    [allMembers, memberDept, memberRole],
  );
  const departments = useMemo(() => Array.from(new Set(allMembers.map((member) => member.department).filter(Boolean) as string[])), [allMembers]);

  const allBooks = booksQuery.data ?? [];
  const itemOptions = useMemo(
    () => allBooks
      .filter((book: Book) => !itemCategory || book.category === itemCategory)
      .filter((book: Book) => availability === "all" || (availability === "available" ? (book.available_copies ?? 0) > 0 : (book.available_copies ?? 0) === 0))
      .slice(0, 30),
    [allBooks, itemCategory, availability],
  );
  const categories = useMemo(() => Array.from(new Set(allBooks.map((book: Book) => book.category).filter(Boolean) as string[])), [allBooks]);
  const selectedBook = allBooks.find((book: Book) => book.id === bookId) ?? null;
  const copies = copiesQuery.data ?? [];

  const canNext = [
    memberMode === "registered" ? !!memberId : !!visitor.name.trim(),
    !!bookId,
    true,
    true,
  ][step];

  const submit = async () => {
    setSubmitting(true);
    try {
      let finalMemberId = memberId;
      if (memberMode === "visitor") {
        const name = cleanText(visitor.name);
        if (!name) throw new Error(t("reservations.alerts.fillVisitorName", "The visitor needs a name."));
        const created = await saveMember({
          full_name: name,
          member_number: `VIS-${generateRandomMemberNumber(6)}`,
          email: visitor.email || null,
          phone: visitor.phone ? cleanPhone(visitor.phone) : null,
          role: "visitor",
          department: visitor.dept || t("reservations.visitor", "Visitor"),
          status: "active",
        } as Parameters<typeof saveMember>[0]);
        finalMemberId = created.id;
      }
      const reservationId = await addReservation(bookId, finalMemberId, scope);
      await acceptReservation(reservationId);
      await updateReservation(reservationId, { expiresAt: new Date(`${expires}T23:59:59`).toISOString() });
      const name = memberMode === "visitor" ? visitor.name : allMembers.find((member) => member.id === memberId)?.full_name ?? "";
      toast.success(t("reservations.alerts.reservationCreated", "Reservation created for {{name}}", { name }));
      void queryClient.invalidateQueries();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = [t("reservations.addModal.stepMember", "Member"), t("reservations.addModal.stepItem", "Item"), t("reservations.addModal.stepCopy", "Copy"), t("reservations.addModal.stepDuration", "Duration")];
  const externalBlocked = memberMode === "visitor" || (selectedBook ? (selectedBook.total_copies ?? 0) <= 1 : false);

  useEffect(() => {
    if (externalBlocked && scope === "external") setScope("internal");
  }, [externalBlocked, scope]);

  return (
    <Modal isOpen onClose={onClose} title={t("reservations.addModal.title", "New reservation")} size="2xl">
      {/* Stepper */}
      <div className="mb-5 flex items-center gap-2">
        {steps.map((label, index) => (
          <div key={label} className="flex flex-1 items-center gap-2">
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", index === step ? "bg-accent text-white dark:bg-accent-dark" : index < step ? "bg-accent/15 text-accent dark:text-accent-dark" : "bg-ink/8 text-ink/45 dark:bg-white/10 dark:text-ivory/45")}>
              {index < step ? <Check size={13} /> : index + 1}
            </span>
            <span className={cn("hidden text-xs font-semibold sm:block", index === step ? "" : "text-ink/45 dark:text-ivory/45")}>{label}</span>
            {index < steps.length - 1 ? <span className="h-px flex-1 bg-ink/10 dark:bg-white/10" /> : null}
          </div>
        ))}
      </div>

      {/* Step 1: member */}
      {step === 0 ? (
        <div>
          <div className="mb-3 flex gap-1.5">
            {(["registered", "visitor"] as const).map((mode) => (
              <button key={mode} onClick={() => { setMemberMode(mode); setMemberId(""); }} className={cn("rounded-full px-4 py-1.5 text-[13px] font-semibold", memberMode === mode ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/5 text-ink/60 dark:bg-white/5 dark:text-ivory/60")}>
                {mode === "registered" ? t("reservations.addModal.tabRegistered", "Registered member") : t("reservations.addModal.tabVisitor", "Visitor / guest")}
              </button>
            ))}
          </div>

          {memberMode === "registered" ? (
            <>
              <div className="mb-3 flex flex-wrap gap-2">
                <input className="field-input max-w-xs" placeholder={t("reservations.addModal.searchMemberPlaceholder", "Search members…")} value={memberTerm} onChange={(event) => setMemberTerm(event.target.value)} />
                <select className="field-select max-w-44" value={memberDept} onChange={(event) => setMemberDept(event.target.value)}>
                  <option value="">{t("reservations.addModal.filterDept", "All departments")}</option>
                  {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                </select>
                <select className="field-select max-w-36" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>
                  <option value="">{t("reservations.addModal.filterRole", "All roles")}</option>
                  {["visitor", "student", "staff", "medic", "other"].map((role) => <option key={role} value={role}>{t(`members.roles.${role}`, role)}</option>)}
                </select>
              </div>
              <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                {memberOptions.length === 0 ? (
                  <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">{t("reservations.addModal.noMembersFound", "No members match")}</p>
                ) : (
                  memberOptions.map((member: Member) => (
                    <li key={member.id}>
                      <button
                        onClick={() => setMemberId(member.id)}
                        className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition", memberId === member.id ? "border-accent bg-accent/8 dark:border-accent-dark" : "border-ink/8 hover:border-ink/20 dark:border-white/8")}
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-copper text-xs font-bold text-white">{getMemberInitials(member.full_name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{member.full_name}</span>
                          <span className="block font-mono text-[10px] text-ink/50 dark:text-ivory/50">{member.member_number} · {member.department || t("members.noDepartment", "—")} · {t(`members.roles.${member.role ?? "other"}`, "")}</span>
                        </span>
                        {memberId === member.id ? <Check size={16} className="text-accent dark:text-accent-dark" /> : null}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </>
          ) : (
            <div className="rounded-2xl border border-copper/30 bg-copper/5 p-4">
              <p className="mb-3 rounded-xl bg-copper/10 px-3 py-2 text-xs font-semibold text-copper">
                {t("reservations.addModal.visitorNotice", "A guest profile will be created and linked to this hold automatically.")}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label><span>{t("reservations.addModal.visitorName", "Full name")}<span className="text-copper"> *</span></span><input className="field-input" value={visitor.name} onChange={(event) => setVisitor({ ...visitor, name: event.target.value })} placeholder={t("reservations.addModal.visitorNamePlaceholder", "e.g. Ali Rezaei")} /></label>
                <label><span>{t("reservations.addModal.visitorDept", "Department / organization")}</span><input className="field-input" value={visitor.dept} onChange={(event) => setVisitor({ ...visitor, dept: event.target.value })} /></label>
                <label><span>{t("reservations.addModal.visitorEmail", "Email")}</span><input className="field-input" dir="ltr" value={visitor.email} onChange={(event) => setVisitor({ ...visitor, email: event.target.value })} /></label>
                <label><span>{t("reservations.addModal.visitorPhone", "Phone")}</span><input className="field-input" dir="ltr" value={visitor.phone} onChange={(event) => setVisitor({ ...visitor, phone: event.target.value })} /></label>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* Step 2: item */}
      {step === 1 ? (
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <input className="field-input max-w-xs" placeholder={t("reservations.addModal.searchItemPlaceholder", "Search the catalog…")} value={itemTerm} onChange={(event) => setItemTerm(event.target.value)} />
            <select className="field-select max-w-44" value={itemCategory} onChange={(event) => setItemCategory(event.target.value)}>
              <option value="">{t("reservations.addModal.filterCategory", "All categories")}</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
            <select className="field-select max-w-36" value={itemType} onChange={(event) => setItemType(event.target.value)}>
              <option value="">{t("reservations.addModal.filterType", "All types")}</option>
              {["book", "fyp", "journal", "other"].map((type) => <option key={type} value={type}>{t(`itemTypes.${type}`, type)}</option>)}
            </select>
            <select className="field-select max-w-40" value={availability} onChange={(event) => setAvailability(event.target.value as typeof availability)}>
              <option value="all">{t("reservations.addModal.filterAvailability", "Any availability")}</option>
              <option value="available">{t("reservations.addModal.availableOnly", "Available only")}</option>
              <option value="out">{t("reservations.addModal.outOfStockOnly", "Out of stock only")}</option>
            </select>
          </div>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {itemOptions.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">{t("reservations.addModal.noItemsFound", "Nothing matches")}</p>
            ) : (
              itemOptions.map((book: Book) => (
                <li key={book.id}>
                  <button
                    onClick={() => { setBookId(book.id); setCopyChoice(""); }}
                    className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition", bookId === book.id ? "border-accent bg-accent/8 dark:border-accent-dark" : "border-ink/8 hover:border-ink/20 dark:border-white/8")}
                  >
                    {book.cover_path ? <img src={book.cover_path} alt="" className="h-11 w-8 rounded object-cover" /> : <DefaultCover type={book.item_type} className="h-11 w-8 rounded" />}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{book.title}</span>
                      <span className="block truncate text-[11px] text-ink/50 dark:text-ivory/50">{book.author || "—"}{book.category ? ` · ${book.category}` : ""}</span>
                    </span>
                    {(book.available_copies ?? 0) > 0 ? (
                      <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-[10px] font-bold text-accent dark:text-accent-dark">
                        {t("reservations.addModal.availableCopies", "{{available}} of {{total}} available", { available: book.available_copies, total: book.total_copies ?? 0 })}
                      </span>
                    ) : (
                      <span className="rounded-full bg-copper/15 px-2.5 py-0.5 text-[10px] font-bold text-copper">
                        {t("reservations.addModal.outOfStock", "{{total}} copies, none available", { total: book.total_copies ?? 0 })}
                      </span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {/* Step 3: copy (advisory) */}
      {step === 2 ? (
        <div>
          {selectedBook ? (
            <p className="mb-3 rounded-xl bg-ivory px-3 py-2 text-xs text-ink/60 dark:bg-white/5 dark:text-ivory/60">
              {t("reservations.addModal.copyTotals", "{{total}} physical copies · {{available}} available right now", { total: selectedBook.total_copies ?? 0, available: selectedBook.available_copies ?? 0 })}
            </p>
          ) : null}
          <button
            onClick={() => setCopyChoice("")}
            className={cn("mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-start transition", copyChoice === "" ? "border-accent bg-accent/8 dark:border-accent-dark" : "border-ink/8 dark:border-white/8")}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-accent dark:text-accent-dark"><Check size={16} /></span>
            <span>
              <span className="block text-[13px] font-bold">{t("reservations.addModal.anyAvailableCopy", "Any available copy")}</span>
              <span className="block text-[11px] text-ink/50 dark:text-ivory/50">{t("reservations.addModal.anyAvailableDesc", "Recommended — the system binds a free copy when the hold becomes ready.")}</span>
            </span>
          </button>
          <ul className="max-h-56 space-y-1.5 overflow-y-auto">
            {copies.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink/50 dark:text-ivory/50">{t("reservations.addModal.noCopiesFound", "This title has no physical copies yet.")}</p>
            ) : (
              copies.map((copy: Copy) => (
                <li key={copy.id}>
                  <button
                    onClick={() => setCopyChoice(copy.id)}
                    className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition", copyChoice === copy.id ? "border-accent bg-accent/8 dark:border-accent-dark" : "border-ink/8 hover:border-ink/20 dark:border-white/8")}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[12px] font-bold">{copy.barcode}</span>
                      <span className="block text-[11px] text-ink/50 dark:text-ivory/50">
                        {copy.shelf ? `${t("loans.shelfLabel", "Shelf")}: ${copy.shelf}` : t("reservations.unassignedShelf", "Unassigned shelf")}
                        {" · "}{t("reservations.addModal.copyIndex", "Index")}: {copy.accession_number}
                        {" · "}{t("reservations.addModal.copyCondition", "Condition")}: {t(`catalog.condition.${copy.condition}`, copy.condition)}
                      </span>
                    </span>
                    <StatusBadge value={copy.status} />
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {/* Step 4: duration + review */}
      {step === 3 ? (
        <div>
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            <button
              onClick={() => setScope("internal")}
              disabled={externalBlocked && false}
              className={cn("rounded-2xl border p-4 text-start transition", scope === "internal" ? "border-accent bg-accent/8 dark:border-accent-dark" : "border-ink/10 dark:border-white/10")}
            >
              <p className="text-sm font-bold">{t("reservations.scope.internal", "Internal — stays in the library")}</p>
              <p className="mt-1 text-[11px] text-ink/55 dark:text-ivory/55">{t("reservations.scopeInternalDesc", "Reading-room loan for {{days}} day(s).", { days: settings.reservation_internal_days })}</p>
            </button>
            <button
              onClick={() => { if (!externalBlocked) setScope("external"); }}
              disabled={externalBlocked}
              className={cn("rounded-2xl border p-4 text-start transition", externalBlocked && "cursor-not-allowed opacity-45", scope === "external" ? "border-accent bg-accent/8 dark:border-accent-dark" : "border-ink/10 dark:border-white/10")}
            >
              <p className="text-sm font-bold">{t("reservations.scope.external", "External — taken home")}</p>
              <p className="mt-1 text-[11px] text-ink/55 dark:text-ivory/55">
                {externalBlocked
                  ? (memberMode === "visitor" ? t("reservations.addModal.visitorsInternalOnly", "Visitors can only borrow internal.") : t("reservations.addModal.singleCopyInternalOnly", "Single-copy titles are internal-only."))
                  : t("reservations.scopeExternalDesc", "Take-home loan for {{days}} day(s).", { days: settings.loan_days })}
              </p>
            </button>
          </div>

          <label className="mb-4 block max-w-xs">
            <span>{t("reservations.addModal.expiryLabel", "Hold expires on")}</span>
            <input type="date" className="field-input" value={expires} onChange={(event) => setExpires(event.target.value)} />
            <span className="mt-1 block text-[11px] text-ink/45 dark:text-ivory/45">{t("reservations.addModal.expiryHint", "After this date an uncollected hold expires automatically.")}</span>
          </label>

          <div className="rounded-2xl bg-ivory p-4 text-[13px] dark:bg-white/5">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-copper">{t("reservations.addModal.summaryTitle", "Summary")}</p>
            <div className="grid gap-1.5 md:grid-cols-2">
              <p><b>{t("reservations.addModal.summaryMember", "Member")}:</b> {memberMode === "visitor" ? `${visitor.name} (${t("reservations.guest", "Guest")})` : allMembers.find((member) => member.id === memberId)?.full_name}</p>
              <p><b>{t("reservations.addModal.summaryItem", "Item")}:</b> {selectedBook?.title}</p>
              <p><b>{t("reservations.copyBarcode", "Copy")}:</b> {copyChoice ? copies.find((copy) => copy.id === copyChoice)?.barcode : t("reservations.autoAssigned", "Auto-assigned")}</p>
              <p><b>{t("reservations.addModal.scopeLabel", "Scope")}:</b> {t(`reservations.scope.${scope}`, scope)}</p>
            </div>
            <p className="mt-2 text-[11px] text-ink/45 dark:text-ivory/45">{t("reservations.addModal.approvalHint", "Staff-created holds are accepted immediately; the loan duration follows the scope.")}</p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex justify-between border-t border-ink/8 pt-4 dark:border-white/8">
        <button
          onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
          className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5"
        >
          {step === 0 ? t("common.cancel", "Cancel") : t("reservations.addModal.back", "Back")}
        </button>
        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={!canNext}
            className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark"
          >
            {t("reservations.addModal.next", "Next")}
          </button>
        ) : (
          <button onClick={() => void submit()} disabled={submitting} className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark">
            {submitting ? t("reservations.addModal.submitting", "Creating…") : t("reservations.addModal.submit", "Create reservation")}
          </button>
        )}
      </div>
    </Modal>
  );
}
