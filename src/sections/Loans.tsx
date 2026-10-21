import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleDollarSign, Eye, RefreshCcw, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { fines, loans as fetchLoans, payFine, renewLoan, returnCopies, updateLoanDueDate, waiveFine } from "../data/repositories/library";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { DefaultCover, EmptyState, ItemTypeBadge, Modal, PageLoader } from "../components/ui/primitives";
import { PageTitle, Table } from "../components/ui/shared";
import { FilterPill } from "../components/ui/widgets";
import { formatDisplayDate } from "../utils/dates";
import { formatDisplayCurrency } from "../utils/currency";
import { cn } from "../utils/cn";
import type { FineRow } from "../data/repositories/library";
import type { Loan } from "../types";

/**
 * The circulation desk: every loan with live due-state (grace-aware),
 * returns, renewals (sequential in bulk so one refusal never aborts the
 * rest), due-date overrides, and the open-fines panel.
 */

export type LoanState = "active" | "dueSoon" | "overdue" | "returned";

export function loanState(loan: Loan, graceDays: number, dueSoonDays: number): LoanState {
  if (loan.returned_at) return "returned";
  const due = new Date(loan.due_at).getTime();
  const now = Date.now();
  if (now > due + graceDays * 86_400_000) return "overdue";
  if (dueSoonDays > 0 && due <= now + dueSoonDays * 86_400_000) return "dueSoon";
  return "active";
}

function daysOverdue(loan: Loan): number {
  return Math.max(0, Math.floor((Date.now() - new Date(loan.due_at).getTime()) / 86_400_000));
}

function daysUntilDue(loan: Loan): number {
  return Math.ceil((new Date(loan.due_at).getTime() - Date.now()) / 86_400_000);
}

/* ── Fines panel ─────────────────────────────────────────────────────── */

function FinesPanel({ onManage }: { onManage: (fine: FineRow) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [waiving, setWaiving] = useState<FineRow | null>(null);
  const [waiveReason, setWaiveReason] = useState("");

  const finesQuery = useQuery({ queryKey: ["fines"], queryFn: fines });
  const openFines = (finesQuery.data ?? []).filter((fine) => fine.status === "open");
  if (openFines.length === 0) return null;

  const total = openFines.reduce((sum, fine) => sum + fine.amount, 0);
  const visible = showAll ? openFines : openFines.slice(0, 3);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fines"] });
    void queryClient.invalidateQueries({ queryKey: ["loans"] });
    void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const pay = async (fine: FineRow) => {
    try {
      await payFine(fine.id);
      toast.success(t("loans.fines.paid", "Fine marked as paid"));
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const waive = async () => {
    if (!waiving) return;
    try {
      await waiveFine(waiving.id, waiveReason.trim() || "-");
      toast.success(t("loans.fines.waived", "Fine waived"));
      setWaiving(null);
      setWaiveReason("");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="mb-5 rounded-[var(--radius-card)] border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleDollarSign size={17} className="text-amber-600" />
          <p className="text-sm font-bold">{t("loans.fines.title", "Open fines")}</p>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">
            {t("loans.fines.openCount", "{{count}} open", { count: openFines.length })}
          </span>
        </div>
        <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
          {t("loans.fines.totalOpen", "Total open: {{amount}}", { amount: formatDisplayCurrency(total) })}
        </p>
      </div>
      <ul className="space-y-1.5">
        {visible.map((fine) => (
          <li key={fine.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-[13px] dark:bg-white/5">
            <div className="min-w-0">
              <p className="font-semibold">{fine.member_name}</p>
              <p className="truncate text-[11px] text-ink/55 dark:text-ivory/55">{fine.title ?? ""} — {fine.reason}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-700 dark:text-amber-400">{formatDisplayCurrency(fine.amount)}</span>
              <button onClick={() => void pay(fine)} className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-bold text-white dark:bg-accent-dark">{t("loans.fines.pay", "Mark paid")}</button>
              <button onClick={() => setWaiving(fine)} className="rounded-lg bg-ink/6 px-2.5 py-1 text-[11px] font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20">{t("loans.fines.waive", "Waive")}</button>
              <button onClick={() => onManage(fine)} className="rounded-lg p-1 text-ink/45 hover:text-ink dark:text-ivory/45 dark:hover:text-ivory" aria-label={t("loans.viewDetails", "View")}><Eye size={14} /></button>
            </div>
          </li>
        ))}
      </ul>
      {openFines.length > 3 ? (
        <button onClick={() => setShowAll((value) => !value)} className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400">
          {showAll ? t("loans.fines.showLess", "Show less") : t("loans.fines.showAll", "Show all {{count}}", { count: openFines.length })}
        </button>
      ) : null}

      {waiving ? (
        <Modal isOpen onClose={() => setWaiving(null)} title={t("loans.fines.waive", "Waive fine")} size="md">
          <p className="text-sm">
            {waiving.member_name} · <b>{formatDisplayCurrency(waiving.amount)}</b>
          </p>
          <textarea
            className="field-input mt-3"
            rows={2}
            placeholder={t("loans.fines.waiveReasonPlaceholder", "Reason (optional)")}
            value={waiveReason}
            onChange={(event) => setWaiveReason(event.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setWaiving(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60">{t("common.cancel", "Cancel")}</button>
            <button onClick={() => void waive()} className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white">{t("loans.fines.waive", "Waive")}</button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────────────────── */

type LoanFilter = "all" | "active" | "dueSoon" | "overdue" | "returned";

export function LoansPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<LoanFilter>("all");
  const [sortBy, setSortBy] = useState("dueAsc");
  const [details, setDetails] = useState<Loan | null>(null);
  const [dueDraft, setDueDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const graceDays = settings.grace_period_enabled ? settings.grace_period_days : 0;
  const dueSoonDays = settings.notify_due_soon_days ?? 0;

  const loansQuery = useQuery({ queryKey: ["loans"], queryFn: () => fetchLoans(false) });
  const allLoans = loansQuery.data ?? [];

  const enriched = useMemo(
    () => allLoans.map((loan) => ({ loan, state: loanState(loan, graceDays, dueSoonDays) })),
    [allLoans, graceDays, dueSoonDays],
  );

  const counts = useMemo(() => ({
    all: enriched.length,
    active: enriched.filter((entry) => entry.state === "active").length,
    dueSoon: enriched.filter((entry) => entry.state === "dueSoon").length,
    overdue: enriched.filter((entry) => entry.state === "overdue").length,
    returned: enriched.filter((entry) => entry.state === "returned").length,
  }), [enriched]);

  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const list = enriched.filter(({ loan, state }) => {
      if (filter !== "all" && state !== filter) return false;
      if (!needle) return true;
      return [loan.title, loan.author, loan.member_name, loan.member_number, loan.barcode, loan.copy_shelf]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const factor = sortBy.endsWith("Desc") ? -1 : 1;
    return list.sort((a, b) => {
      switch (sortBy) {
        case "dueAsc": case "dueDesc": return factor * a.loan.due_at.localeCompare(b.loan.due_at);
        case "borrowedAsc": case "borrowedDesc": return factor * a.loan.borrowed_at.localeCompare(b.loan.borrowed_at);
        case "member": return a.loan.member_name?.localeCompare(b.loan.member_name ?? "", "fa") ?? 0;
        case "title": return a.loan.title?.localeCompare(b.loan.title ?? "", "fa") ?? 0;
        default: return 0;
      }
    });
  }, [enriched, filter, sortBy, term]);

  const invalidate = () => void queryClient.invalidateQueries();

  const doReturn = async (loans: Loan[]) => {
    const open = loans.filter((loan) => !loan.returned_at);
    if (open.length === 0) return;
    try {
      await returnCopies(open.map((loan) => loan.copy_id));
      toast.success(t("loans.alerts.returned", "{{count}} item(s) returned", { count: open.length }));
      setSelectedIds(new Set());
      setDetails(null);
      invalidate();
    } catch (error) {
      toast.error(t("loans.alerts.returnFailed", "Return failed: {{message}}", { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  const renewOne = async (loan: Loan) => {
    try {
      await renewLoan(loan.id);
      toast.success(t("loans.alerts.renewed", "Loan renewed"));
      invalidate();
    } catch (error) {
      toast.error(t("loans.alerts.renewFailed", "Renew failed: {{message}}", { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  const bulkRenew = async () => {
    const targets = visible.filter(({ loan, state }) => selectedIds.has(loan.id) && state !== "returned").map((entry) => entry.loan);
    let succeeded = 0;
    let firstFailure = "";
    for (const loan of targets) {
      try {
        await renewLoan(loan.id);
        succeeded += 1;
      } catch (error) {
        if (!firstFailure) firstFailure = error instanceof Error ? error.message : String(error);
      }
    }
    if (succeeded > 0) toast.success(t("loans.alerts.bulkRenewed", "{{count}} loan(s) renewed", { count: succeeded }));
    if (firstFailure) toast.error(t("loans.alerts.bulkRenewPartial", "{{count}} failed: {{reason}}", { count: targets.length - succeeded, reason: firstFailure }));
    setSelectedIds(new Set());
    invalidate();
  };

  const stateTone: Record<LoanState, string> = {
    active: "bg-accent/10 text-accent dark:text-accent-dark",
    dueSoon: "bg-amber-500/12 text-amber-600",
    overdue: "bg-red-600/10 text-red-600",
    returned: "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55",
  };
  const stateLabel = (state: LoanState) =>
    t(`loans.state.${state}`, { active: t("loans.state.active", "Active"), dueSoon: t("loans.state.dueSoon", "Due soon"), overdue: t("loans.state.overdue", "Overdue"), returned: t("loans.state.returned", "Returned") }[state]);

  if (loansQuery.isLoading) return <PageLoader label={t("loans.loading", "Loading loans…")} />;

  return (
    <div>
      <PageTitle
        title={t("loans.title", "Loans")}
        detail={t("loans.subtitle", "Checkout happens from a fulfilled hold — manage what's out from here.")}
      />

      <FinesPanel onManage={(fine) => { const loan = allLoans.find((entry) => entry.id === fine.loan_id); if (loan) { setDetails(loan); setDueDraft(loan.due_at.slice(0, 10)); } }} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="field-input max-w-xs" placeholder={t("loans.searchPlaceholder", "Title, member, barcode…")} value={term} onChange={(event) => setTerm(event.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {(["all", "active", "dueSoon", "overdue", "returned"] as LoanFilter[]).map((key) => (
            <FilterPill key={key} active={filter === key} count={counts[key]} onClick={() => setFilter(key)}>
              {key === "all" ? t("loans.filters.all", "All") : stateLabel(key)}
            </FilterPill>
          ))}
        </div>
        <select className="field-select ms-auto max-w-44" value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
          <option value="dueAsc">{t("loans.sort.dueAsc", "Due ↑")}</option>
          <option value="dueDesc">{t("loans.sort.dueDesc", "Due ↓")}</option>
          <option value="borrowedDesc">{t("loans.sort.borrowedDesc", "Newest borrowed")}</option>
          <option value="borrowedAsc">{t("loans.sort.borrowedAsc", "Oldest borrowed")}</option>
          <option value="member">{t("loans.sort.member", "By member")}</option>
          <option value="title">{t("loans.sort.title", "By title")}</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={RotateCcw} title={t("loans.noLoans", "No loans here")} description={t("loans.noLoansHelp", "Loans appear when a ready hold is marked as picked up.")} />
      ) : (
        <>
          <Table headers={[t("catalog.headers.title", "Title"), t("circulation.selectedMember", "Member"), t("circulation.barcode", "Barcode"), t("loans.borrowedDate", "Borrowed"), t("circulation.due", "Due"), t("status", "Status"), t("actions", "Actions")]} minWidth={980}>
            {visible.map(({ loan, state }) => (
              <tr
                key={loan.id}
                onClick={() => { setDetails(loan); setDueDraft(loan.due_at.slice(0, 10)); }}
                onContextMenu={(event) =>
                  showContextMenu(event, [
                    ...(state !== "returned" ? [{ id: "return", label: t("loans.returnItem", "Return item"), onClick: () => void doReturn([loan]) }] : []),
                    ...(state !== "returned" ? [{ id: "renew", label: t("loans.renewLoan", "Renew loan"), onClick: () => void renewOne(loan) }] : []),
                    { id: "view", label: t("loans.viewDetails", "View loan details"), icon: Eye, onClick: () => { setDetails(loan); setDueDraft(loan.due_at.slice(0, 10)); } },
                    { id: "d", divider: true },
                    { id: "copyMember", label: t("loans.copyMember", "Copy member name"), onClick: () => { void navigator.clipboard.writeText(loan.member_name ?? ""); toast.success(t("loans.copiedMember", "Member name copied")); } },
                    { id: "copyBarcode", label: t("loans.copyBarcode", "Copy barcode"), onClick: () => { void navigator.clipboard.writeText(loan.barcode ?? ""); toast.success(t("loans.copiedBarcode", "Barcode copied")); } },
                  ], { title: loan.title ?? "" })
                }
                className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
              >
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <div className="flex items-center gap-3" onClick={(event) => event.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(loan.id)}
                      onChange={(event) => {
                        const next = new Set(selectedIds);
                        if (event.target.checked) next.add(loan.id);
                        else next.delete(loan.id);
                        setSelectedIds(next);
                      }}
                    />
                    {loan.cover_path ? (
                      <img src={loan.cover_path} alt="" className="h-10 w-7 rounded object-cover" />
                    ) : (
                      <DefaultCover type={loan.item_type} className="h-10 w-7 rounded" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">{loan.title}</p>
                      <p className="truncate text-[11px] text-ink/50 dark:text-ivory/50">{loan.author}</p>
                    </div>
                  </div>
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <p className="text-[13px] font-medium">{loan.member_name}</p>
                  <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">{loan.member_number}</p>
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <p className="font-mono text-xs">{loan.barcode}</p>
                  {loan.copy_shelf ? <p className="text-[10px] text-ink/50 dark:text-ivory/50">{loan.copy_shelf}</p> : null}
                </td>
                <td className="border-b border-ink/6 px-4 py-3 text-xs text-ink/60 dark:border-white/6 dark:text-ivory/60">{formatDisplayDate(loan.borrowed_at)}</td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <p className={cn("text-[13px] font-semibold", state === "overdue" && "text-red-600", state === "dueSoon" && "text-amber-600")}>{formatDisplayDate(loan.due_at)}</p>
                  {state === "overdue" ? <p className="text-[10px] font-bold text-red-600">{t("circulation.daysOverdue", "{{count}} days overdue", { count: daysOverdue(loan) })}</p> : null}
                  {state === "dueSoon" ? <p className="text-[10px] font-bold text-amber-600">{t("loans.dueInDays", "due in {{count}} day(s)", { count: daysUntilDue(loan) })}</p> : null}
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", stateTone[state])}>{stateLabel(state)}</span>
                  {loan.renewed_count > 0 ? <p className="mt-0.5 text-[10px] text-ink/50 dark:text-ivory/50">{t("loans.renewedTimes", "renewed {{count}}×", { count: loan.renewed_count })}</p> : null}
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6" onClick={(event) => event.stopPropagation()}>
                  {state !== "returned" ? (
                    <div className="flex gap-1">
                      <button onClick={() => void doReturn([loan])} className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15" title={t("loans.returnItem", "Return item")}><RotateCcw size={13} /></button>
                      <button
                        onClick={() => void renewOne(loan)}
                        disabled={loan.renewed_count >= settings.renew_limit}
                        title={loan.renewed_count >= settings.renew_limit ? t("loans.renewLimitReached", "Renewal limit reached") : undefined}
                        className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 disabled:opacity-40 dark:bg-white/8 dark:hover:bg-white/15"
                      >
                        <RefreshCcw size={13} />
                      </button>
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </Table>

          {selectedIds.size > 0 ? (
            <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
              <span className="font-bold">{t("loans.bulk.selectedCount", "{{count}} selected", { count: selectedIds.size })}</span>
              <button className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>{t("catalog.bulk.deselectAll", "Deselect all")}</button>
              <button
                className="rounded-lg bg-accent px-3 py-1.5 font-semibold dark:bg-accent-dark"
                onClick={() => { if (window.confirm(t("loans.alerts.confirmBulkReturn", "Return {{count}} selected item(s)?", { count: selectedIds.size }))) void doReturn(visible.filter(({ loan }) => selectedIds.has(loan.id)).map((entry) => entry.loan)); }}
              >
                {t("loans.bulk.return", "Return ({{count}})", { count: selectedIds.size })}
              </button>
              <button
                className="rounded-lg bg-copper px-3 py-1.5 font-semibold"
                onClick={() => { if (window.confirm(t("loans.alerts.confirmBulkRenew", "Renew {{count}} selected loan(s)?", { count: selectedIds.size }))) void bulkRenew(); }}
              >
                {t("loans.bulk.renew", "Renew ({{count}})", { count: selectedIds.size })}
              </button>
            </div>
          ) : null}
        </>
      )}

      {/* Details modal */}
      <Modal isOpen={!!details} onClose={() => setDetails(null)} title={t("loans.detailsModal.title", "Loan details")} size="xl">
        {details ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex gap-3 rounded-2xl border border-ink/8 p-4 dark:border-white/8">
              {details.cover_path ? <img src={details.cover_path} alt="" className="h-24 w-16 rounded-lg object-cover" /> : <DefaultCover type={details.item_type} className="h-24 w-16 rounded-lg" iconSize={24} />}
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-snug">{details.title}</p>
                {details.subtitle ? <p className="text-xs text-ink/55 dark:text-ivory/55">{details.subtitle}</p> : null}
                <p className="mt-1 text-xs text-ink/60 dark:text-ivory/60">{details.author}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <ItemTypeBadge type={details.item_type} />
                  <span className="rounded-full bg-ink/6 px-2 py-0.5 font-mono text-[10px] dark:bg-white/8">{details.barcode}</span>
                </div>
                <p className="mt-1.5 text-[11px] text-ink/50 dark:text-ivory/50">
                  {details.copy_shelf ? t("loans.shelfLabel", "Shelf: {{shelf}}", { shelf: details.copy_shelf }) : t("loans.unassignedShelf", "No shelf assigned")}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-ink/8 p-4 dark:border-white/8">
              <p className="text-[13px] font-bold">{details.member_name}</p>
              <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">{details.member_number}{details.member_dept ? ` · ${details.member_dept}` : ""}</p>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("loans.borrowedOn", "Borrowed on")}</dt><dd>{formatDisplayDate(details.borrowed_at)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("loans.dueOn", "Due on")}</dt><dd>{formatDisplayDate(details.due_at)}</dd></div>
                {details.returned_at ? <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("circulation.returnedOn", "Returned on")}</dt><dd>{formatDisplayDate(details.returned_at)}</dd></div> : null}
                <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("loans.renewals", "Renewals")}</dt><dd>{details.renewed_count} / {settings.renew_limit}</dd></div>
                {details.scope ? <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("reservations.addModal.scopeLabel", "Scope")}</dt><dd>{t(`reservations.scope.${details.scope}`, details.scope)}</dd></div> : null}
              </dl>

              {!details.returned_at ? (
                <div className="mt-3 flex items-end gap-2 border-t border-ink/8 pt-3 dark:border-white/8">
                  <label className="flex-1">
                    <span className="text-[11px] font-bold">{t("loans.editDueDate", "Edit due date")}</span>
                    <input type="date" className="field-input" value={dueDraft} onChange={(event) => setDueDraft(event.target.value)} />
                  </label>
                  <button
                    onClick={async () => {
                      try {
                        await updateLoanDueDate(details.id, new Date(`${dueDraft}T23:59:59`).toISOString());
                        toast.success(t("loans.alerts.dueUpdated", "Due date updated"));
                        setDetails(null);
                        invalidate();
                      } catch (error) {
                        toast.error(t("loans.alerts.dueUpdateFailed", "Update failed: {{message}}", { message: error instanceof Error ? error.message : String(error) }));
                      }
                    }}
                    className="rounded-xl bg-ink/6 px-3 py-2 text-xs font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
                  >
                    {t("common.save", "Save")}
                  </button>
                </div>
              ) : null}
            </div>

            {details.notes ? (
              <div className="md:col-span-2 rounded-2xl bg-ink/4 p-3 text-[13px] dark:bg-white/5">
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-copper">{t("loans.notes", "Notes")}</p>
                <p>{details.notes}</p>
              </div>
            ) : null}

            {!details.returned_at ? (
              <div className="flex justify-end gap-2 md:col-span-2">
                <button
                  onClick={() => void renewOne(details)}
                  disabled={details.renewed_count >= settings.renew_limit}
                  className="rounded-xl bg-copper px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {t("loans.renewLoan", "Renew loan")}
                </button>
                <button onClick={() => void doReturn([details])} className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white dark:bg-accent-dark">
                  {t("loans.returnItem", "Return item")}
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2 md:col-span-2">
                <span className="flex items-center gap-1.5 rounded-full bg-ink/8 px-3 py-1 text-xs font-bold text-ink/55 dark:bg-white/10 dark:text-ivory/55">
                  <Ban size={12} /> {t("loans.state.returned", "Returned")}
                </span>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
