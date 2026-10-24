import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "../hooks/useLibraryQuery";
import {
  Archive, Clock, Pencil, Phone, Plus, UserCheck, UserX,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  cancelReservation, deleteMember, getLoansForMember, getReservationsForMember, members as fetchMembers,
  renewLoan, returnCopies, saveMember, updateMember,
} from "../data/repositories/library";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { EmptyState, Modal, PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { ImageUpload } from "../components/ui/ImageUpload";
import { ArtReading } from "../components/ui/art";
import { cleanLastName, cleanMemberNumber, cleanPhone, cleanText, formatMemberNumber, normalizeDigits } from "../utils/isbn";
import { daysLate, dueDate, formatDisplayDate, today } from "../utils/dates";
import { cn } from "../utils/cn";
import type { Loan, Member, MemberStatus, Reservation } from "../types";

/**
 * Membership: registration, profiles with loans & holds, ID cards, status
 * management, and archive (soft-delete, guarded by open loans).
 */

/* ── Shared helpers (also used by Loans / Reservations) ──────────────── */

export function MemberStatusBadge({ status, iconOnly }: { status: string; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const map: Record<string, { icon: typeof UserCheck; tone: string }> = {
    active: { icon: UserCheck, tone: "bg-accent/12 text-accent dark:text-accent-dark" },
    suspended: { icon: UserX, tone: "bg-red-600/10 text-red-600" },
    expired: { icon: Clock, tone: "bg-amber-500/12 text-amber-600" },
    archived: { icon: Archive, tone: "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55" },
  };
  const entry = map[status] ?? map.archived;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold", entry.tone)} title={t(`members.${status}`, status)}>
      <entry.icon size={11} />
      {!iconOnly ? t(`members.${status}`, status) : null}
    </span>
  );
}

export function splitFullName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: (parts.slice(1).join(" ") || "").toUpperCase() };
}

export function formatMemberShortName(fullName: string): string {
  const { first, last } = splitFullName(fullName);
  if (!first) return last || "—";
  return last ? `${first[0]}. ${last}` : first;
}

export function getMemberInitials(fullName: string): string {
  const { first, last } = splitFullName(fullName);
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "ک";
}

/* ── Form schema ─────────────────────────────────────────────────────── */

const memberSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  // Student ID (کد دانشجویی) — the unique key every member is saved by.
  member_number: z.string().regex(/^[0-9A-Za-z-]{3,24}$/),
  email: z.union([z.literal(""), z.string().email()]),
  phone: z.string().optional(),
  role: z.string(),
  department: z.string().optional(),
  status: z.string(),
  avatar_path: z.string().nullable().optional(),
});
type MemberForm = z.infer<typeof memberSchema>;

const ROLES = ["visitor", "student", "staff", "medic", "other"] as const;
const STATUSES: MemberStatus[] = ["active", "suspended", "expired", "archived"];

/* ── Page ────────────────────────────────────────────────────────────── */

export function MembersPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;

  const [term, setTerm] = useState("");
  const [statusView, setStatusView] = useState<"all" | "active" | "suspended">("all");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "number" | "joined">("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Member | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"profile" | "loans" | "holds">("profile");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [receipt, setReceipt] = useState<{ kind: "renew" | "return"; title: string; date: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchRef, setSearchRef] = useState<HTMLInputElement | null>(null);

  const membersQuery = useQuery({ queryKey: ["members", term], queryFn: () => fetchMembers(term) });
  const allMembers = membersQuery.data ?? [];

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("action") === "add-member") setAddOpen(true);
    if (params.get("focus") === "search") searchRef?.focus();
    if (params.get("action") || params.get("focus")) history.replaceState(null, "", location.pathname);
  }, [location.search, searchRef]);

  const departments = useMemo(
    () => Array.from(new Set(allMembers.map((member) => member.department).filter(Boolean) as string[])).sort(),
    [allMembers],
  );

  const filtered = useMemo(() => {
    const list = allMembers.filter((member) => {
      if (statusView !== "all" && member.status !== statusView) return false;
      if (departmentFilter && member.department !== departmentFilter) return false;
      return true;
    });
    return list.sort((a, b) => {
      const factor = sortDir;
      if (sortKey === "name") return factor * a.full_name.localeCompare(b.full_name, "fa");
      if (sortKey === "number") return factor * a.member_number.localeCompare(b.member_number, "en", { numeric: true });
      return factor * a.joined_at.localeCompare(b.joined_at);
    });
  }, [allMembers, statusView, departmentFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageMembers = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const loansQuery = useQuery({
    queryKey: ["member-loans", selected?.id],
    queryFn: () => getLoansForMember(selected!.id),
    enabled: !!selected,
  });
  const holdsQuery = useQuery({
    queryKey: ["member-res", selected?.id],
    queryFn: () => getReservationsForMember(selected!.id),
    enabled: !!selected,
  });

  const invalidate = () => void queryClient.invalidateQueries();

  const archive = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      toast.success(t("members.alerts.archived", "Member archived — history retained"));
      setSelected(null);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: ({ member, status }: { member: Member; status: MemberStatus }) => updateMember(member.id, { ...member, status }),
    onSuccess: () => { toast.success(t("members.statusUpdated", "Status updated")); invalidate(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const doRenew = async (loan: Loan) => {
    try {
      await renewLoan(loan.id);
      toast.success(t("circulation.alerts.renewSuccess", "Loan renewed"));
      setReceipt({ kind: "renew", title: loan.title ?? "", date: dueDate(settings.loan_days) });
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doReturn = async (loan: Loan) => {
    try {
      await returnCopies([loan.copy_id]);
      toast.success(t("circulation.alerts.returnSuccess", "Item returned"));
      setReceipt({ kind: "return", title: loan.title ?? "", date: today() });
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doCancelHold = async (reservation: Reservation) => {
    try {
      await cancelReservation(reservation.id);
      toast.success(t("members.alerts.reservationCancelled", "Reservation cancelled"));
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1">
        <PageTitle
          title={t("members.title", "Members")}
          detail={t("members.subtitle", "{{count}} members match your filters", { count: filtered.length })}
          action={
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark"
            >
              <Plus size={16} />
              {t("members.addMember", "Add member")}
            </button>
          }
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            ref={setSearchRef}
            className="field-input max-w-xs"
            placeholder={t("members.searchPlaceholder", "Search name, number, phone…")}
            value={term}
            onChange={(event) => { setTerm(event.target.value); setPage(1); }}
          />
          <select className="field-select max-w-44" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1); }}>
            <option value="">{t("members.allDepartments", "All departments")}</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <select className="field-select max-w-40" value={sortKey} onChange={(event) => setSortKey(event.target.value as typeof sortKey)}>
            <option value="name">{t("members.sortByName", "By name")}</option>
            <option value="number">{t("members.sortById", "By number")}</option>
            <option value="joined">{t("members.sortByJoined", "By join date")}</option>
          </select>
          <button
            onClick={() => setSortDir((dir) => (dir === 1 ? -1 : 1))}
            className="rounded-[var(--radius-control)] bg-ink/5 px-3 py-2 text-xs font-bold text-ink/60 dark:bg-white/5 dark:text-ivory/60"
          >
            {sortDir === 1 ? t("asc", "A→Z") : t("desc", "Z→A")}
          </button>
        </div>

        <div className="mb-4 flex gap-1.5">
          {(["all", "active", "suspended"] as const).map((key) => (
            <button
              key={key}
              onClick={() => { setStatusView(key); setPage(1); }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition",
                statusView === key ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
              )}
            >
              {t(`members.${key === "all" ? "allMembers" : key}`, key)}
            </button>
          ))}
        </div>

        {membersQuery.isLoading ? (
          <PageLoader label={t("members.loading", "Loading members…")} />
        ) : filtered.length === 0 ? (
          <EmptyState artwork={<ArtReading />} title={t("members.noMembers", "No members here")} description={t("members.noMembersHelp", "Register the library's first borrower to get circulation going.")} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {pageMembers.map((member) => (
                <div
                  key={member.id}
                  onClick={() => { setSelected(member); setSidebarTab("profile"); }}
                  onContextMenu={(event) =>
                    showContextMenu(event, [
                      { id: "view", label: t("members.viewDetails", "View details"), onClick: () => { setSelected(member); setSidebarTab("profile"); } },
                      { id: "copyNum", label: t("members.copyNumber", "Copy member number"), onClick: () => { void navigator.clipboard.writeText(member.member_number); toast.success(t("members.copiedNumber", "Member number copied")); } },
                      ...(member.email ? [{ id: "copyEmail", label: t("members.copyEmail", "Copy email"), onClick: () => { void navigator.clipboard.writeText(member.email ?? ""); toast.success(t("members.copiedEmail", "Email copied")); } }] : []),
                      ...(member.phone ? [{ id: "copyPhone", label: t("members.copyPhone", "Copy phone"), onClick: () => { void navigator.clipboard.writeText(member.phone ?? ""); toast.success(t("members.copiedPhone", "Phone copied")); } }] : []),
                      { id: "d", divider: true },
                      ...STATUSES.filter((status) => status !== member.status).map((status) => ({
                        id: `set-${status}`,
                        label: t(`members.set${status[0].toUpperCase()}${status.slice(1)}`, status),
                        onClick: () => setStatus.mutate({ member, status }),
                      })),
                      { id: "d2", divider: true },
                      { id: "archive", label: t("members.deleteMember", "Archive member"), icon: Archive, variant: "danger", onClick: () => { if (window.confirm(t("members.confirmDelete", 'Archive "{{name}}"? Their history is retained.', { name: member.full_name }))) archive.mutate(member.id); } },
                    ], { title: member.full_name })
                  }
                  className="relative cursor-pointer rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 pt-8 shadow-card transition hover:border-accent/30 dark:border-white/8 dark:bg-[#1b2723] dark:hover:border-accent-dark/30"
                >
                  <div className="absolute end-3 top-3"><MemberStatusBadge status={member.status} /></div>
                  <input
                    type="checkbox"
                    className="absolute start-3 top-3"
                    onClick={(event) => event.stopPropagation()}
                    checked={selectedIds.has(member.id)}
                    onChange={(event) => {
                      const next = new Set(selectedIds);
                      if (event.target.checked) next.add(member.id);
                      else next.delete(member.id);
                      setSelectedIds(next);
                    }}
                  />
                  <div className="flex items-center gap-3">
                    {member.avatar_path ? (
                      <img src={member.avatar_path} alt="" className="h-12 w-12 rounded-full object-cover ring-2 ring-accent/20" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-sm font-bold text-white">{getMemberInitials(member.full_name)}</span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">{member.full_name}</p>
                      <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">{formatMemberNumber(member.member_number)}</p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-0.5 text-[11px] text-ink/60 dark:text-ivory/60">
                    <p>{t(`members.roles.${member.role ?? "other"}`, member.role ?? "")}{member.department ? ` · ${member.department}` : ""}</p>
                    {member.phone ? <p className="flex items-center gap-1"><Phone size={10} /> {member.phone}</p> : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
              <span>{t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, filtered.length), total: filtered.length })}</span>
              <div className="flex items-center gap-2">
                <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">‹</button>
                <span className="tabular-nums">{currentPage} / {totalPages}</span>
                <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">›</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sidebar */}
      {selected ? (
        <aside key={selected.id} className="sticky top-0 w-[340px] shrink-0 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
          <div className="flex items-center gap-3 border-b border-ink/8 p-4 dark:border-white/8">
            {selected.avatar_path ? (
              <img src={selected.avatar_path} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-sm font-bold text-white">{getMemberInitials(selected.full_name)}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{selected.full_name}</p>
              <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">{formatMemberNumber(selected.member_number)}</p>
            </div>
            <MemberStatusBadge status={selected.status} />
          </div>

          <div className="flex border-b border-ink/8 text-[13px] font-semibold dark:border-white/8">
            {(["profile", "loans", "holds"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={cn("flex-1 py-2.5 transition", sidebarTab === key ? "border-b-2 border-accent text-accent dark:border-accent-dark dark:text-accent-dark" : "text-ink/50 dark:text-ivory/50")}
              >
                {t(`members.tabs.${key}`, key)}
                {key === "loans" && loansQuery.data ? ` (${loansQuery.data.filter((loan) => !loan.returned_at).length})` : ""}
                {key === "holds" && holdsQuery.data ? ` (${holdsQuery.data.length})` : ""}
              </button>
            ))}
          </div>

          <div className="max-h-[62vh] overflow-y-auto p-4">
            {sidebarTab === "profile" ? (
              <>
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("members.roleLabel", "Role")}</dt><dd className="font-medium">{t(`members.roles.${selected.role ?? "other"}`, selected.role ?? "—")}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("members.departmentLabel", "Department")}</dt><dd className="font-medium">{selected.department || t("members.noDepartment", "—")}</dd></div>
                  {selected.phone ? <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("members.phone", "Phone")}</dt><dd className="font-medium" dir="ltr">{selected.phone}</dd></div> : null}
                  {selected.email ? <div className="flex justify-between gap-3"><dt className="shrink-0 text-ink/50 dark:text-ivory/50">{t("members.email", "Email")}</dt><dd className="truncate font-medium" dir="ltr"><a href={`mailto:${selected.email}`} className="hover:underline">{selected.email}</a></dd></div> : null}
                  <div className="flex justify-between"><dt className="text-ink/50 dark:text-ivory/50">{t("members.registeredOn", "Registered")}</dt><dd className="font-medium">{formatDisplayDate(selected.joined_at)}</dd></div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => setIdCardOpen(true)} className="rounded-xl bg-ink/5 py-2 text-xs font-bold hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15">
                    {t("members.viewIdCard", "View ID card")}
                  </button>
                  <button onClick={() => setEditOpen(true)} className="flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-bold text-white dark:bg-accent-dark">
                    <Pencil size={12} /> {t("catalog.details.edit", "Edit")}
                  </button>
                </div>
              </>
            ) : sidebarTab === "loans" ? (
              (loansQuery.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">{t("members.noActiveLoans", "No loans on record.")}</p>
              ) : (
                <ul className="space-y-2">
                  {(loansQuery.data ?? []).map((loan) => {
                    const open = !loan.returned_at;
                    const late = open && daysLate(loan.due_at) > 0;
                    return (
                      <li key={loan.id} className="rounded-xl border border-ink/8 p-3 dark:border-white/8">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">{loan.title}</p>
                            <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">{loan.barcode}</p>
                          </div>
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", !open ? "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55" : late ? "bg-red-600/10 text-red-600" : "bg-copper/12 text-copper")}>
                            {open ? (late ? t("reports.statusLabels.overdue", "Overdue") : t("reports.statusLabels.onloan", "On loan")) : t("reports.statusLabels.returned", "Returned")}
                          </span>
                        </div>
                        {open ? (
                          <>
                            <p className={cn("mt-1 text-[11px]", late ? "font-bold text-red-600" : "text-ink/60 dark:text-ivory/60")}>
                              {t("circulation.due", "Due")}: {formatDisplayDate(loan.due_at)}
                              {late ? ` · ${t("circulation.daysOverdue", "{{count}} days late", { count: daysLate(loan.due_at) })}` : ""}
                            </p>
                            <div className="mt-2 flex gap-1.5">
                              <button
                                onClick={() => void doRenew(loan)}
                                disabled={loan.renewed_count >= settings.renew_limit}
                                title={loan.renewed_count >= settings.renew_limit ? t("circulation.alerts.renewLimitReached", "Renewal limit reached") : undefined}
                                className="flex-1 rounded-lg bg-ink/5 py-1.5 text-[11px] font-bold hover:bg-ink/10 disabled:opacity-40 dark:bg-white/8 dark:hover:bg-white/15"
                              >
                                {t("circulation.renew", "Renew")} ({loan.renewed_count}/{settings.renew_limit})
                              </button>
                              <button onClick={() => void doReturn(loan)} className="flex-1 rounded-lg bg-accent py-1.5 text-[11px] font-bold text-white dark:bg-accent-dark">
                                {t("circulation.return", "Return")}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-[11px] text-ink/50 dark:text-ivory/50">{t("circulation.returnedOn", "Returned")}: {formatDisplayDate(loan.returned_at ?? "")}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
              (holdsQuery.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">{t("members.noReservations", "No holds on record.")}</p>
              ) : (
                <ul className="space-y-2">
                  {(holdsQuery.data ?? []).map((reservation) => (
                    <li key={reservation.id} className="flex items-center justify-between gap-2 rounded-xl border border-ink/8 p-3 dark:border-white/8">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{reservation.title}</p>
                        <p className={cn("text-[10px] font-bold", reservation.status === "ready" ? "text-accent dark:text-accent-dark" : "text-copper")}>{reservation.status}</p>
                      </div>
                      <button onClick={() => void doCancelHold(reservation)} className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-[11px] font-bold hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15">
                        {t("common.cancel", "Cancel")}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </aside>
      ) : null}

      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
          <span className="font-bold">{t("members.bulk.selectedCount", "{{count}} selected", { count: selectedIds.size })}</span>
          <button className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>{t("catalog.bulk.deselectAll", "Deselect all")}</button>
          <button
            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
            onClick={() => {
              if (!window.confirm(t("members.alerts.confirmBulkArchive", "Archive {{count}} members?", { count: selectedIds.size }))) return;
              Promise.allSettled(Array.from(selectedIds).map((id) => deleteMember(id)))
                .then(() => { toast.success(t("members.alerts.bulkArchived", "Members archived")); setSelectedIds(new Set()); invalidate(); });
            }}
          >
            {t("catalog.bulk.archiveSelected", "Archive selected")}
          </button>
        </div>
      ) : null}

      {addOpen ? <MemberModal onClose={() => setAddOpen(false)} existingNumbers={allMembers.map((member) => member.member_number.toLowerCase())} /> : null}
      {editOpen && selected ? <MemberModal member={selected} onClose={() => setEditOpen(false)} existingNumbers={allMembers.filter((member) => member.id !== selected.id).map((member) => member.member_number.toLowerCase())} /> : null}
      {idCardOpen && selected ? <IdCardModal member={selected} onClose={() => setIdCardOpen(false)} /> : null}
      {receipt ? <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} /> : null}
    </div>
  );
}

/* ── Add / edit modal ────────────────────────────────────────────────── */

function MemberModal({ member, onClose, existingNumbers }: { member?: Member; onClose: () => void; existingNumbers: string[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const form = useForm<MemberForm>({
    resolver: zodResolver(memberSchema),
    defaultValues: member
      ? {
          ...splitFullName(member.full_name),
          member_number: member.member_number,
          email: member.email ?? "",
          phone: member.phone ?? "",
          role: String(member.role ?? "student"),
          department: member.department ?? "",
          status: member.status,
          avatar_path: member.avatar_path ?? null,
        }
      : {
          // New members are registered by their real student ID — the
          // librarian types it; nothing is auto-generated for students.
          first_name: "", last_name: "", member_number: "",
          email: "", phone: "", role: "student", department: "", status: "active", avatar_path: null,
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: MemberForm) => {
      const number = cleanMemberNumber(values.member_number);
      if (number.length < 3) {
        throw new Error(t("members.alerts.badStudentId", "کد دانشجویی باید حداقل ۳ نویسه باشد."));
      }
      if (existingNumbers.includes(number.toLowerCase())) {
        throw new Error(t("members.alerts.exists", "This member number is already taken."));
      }
      const payload = {
        full_name: `${cleanText(values.first_name)} ${cleanLastName(values.last_name)}`.trim(),
        member_number: number,
        email: values.email || null,
        phone: values.phone ? cleanPhone(values.phone) : null,
        role: values.role,
        department: values.department || null,
        status: values.status as Member["status"],
        avatar_path: values.avatar_path || null,
      };
      if (member) await updateMember(member.id, payload);
      else await saveMember(payload);
    },
    onSuccess: () => {
      toast.success(t(member ? "members.alerts.updated" : "members.alerts.memberSaved", member ? "Member updated" : "Member registered"));
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal isOpen onClose={onClose} title={member ? t("members.addModal.editTitle", "Edit member") : t("members.addMember", "Add member")} size="lg">
      <form className="grid gap-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <div className="flex items-center gap-4">
          <ImageUpload
            shape="circle"
            fallbackInitials={getMemberInitials(`${form.watch("first_name")} ${form.watch("last_name")}`)}
            value={form.watch("avatar_path") ?? null}
            onChange={(value) => form.setValue("avatar_path", value)}
          />
          <div className="grid flex-1 grid-cols-2 gap-3">
            <label>
              <span>{t("members.firstName", "First name")}<span className="text-copper"> *</span></span>
              <input className="field-input" required {...form.register("first_name")} />
            </label>
            <label>
              <span>{t("members.lastName", "Last name")}<span className="text-copper"> *</span></span>
              <input className="field-input uppercase" required {...form.register("last_name")} />
            </label>
          </div>
        </div>

        <label>
          <span>{t("members.membershipNumber", "Student ID")}<span className="text-copper"> *</span></span>
          <input
            className="field-input font-mono"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("members.studentIdPlaceholder", "40212345")}
            required
            {...form.register("member_number", {
              // Persian keyboard digits (۴۰۲…) are normalised to ASCII at the
              // input, so the stored student ID always matches searches/scans.
              setValueAs: (value: string) => normalizeDigits(value ?? "").replace(/[^0-9A-Za-z-]/g, ""),
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                event.target.value = normalizeDigits(event.target.value).replace(/[^0-9A-Za-z-]/g, "");
              },
            })}
          />
          {form.formState.errors.member_number ? (
            <p className="mt-1 text-[11px] text-red-600">{t("members.alerts.badStudentId", "کد دانشجویی باید حداقل ۳ نویسه باشد.")}</p>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span>{t("members.email", "Email")}</span>
            <input className="field-input" type="email" dir="ltr" {...form.register("email")} />
            {form.formState.errors.email ? <p className="mt-1 text-[11px] text-red-600">{t("members.alerts.badEmail", "Enter a valid email or leave it empty")}</p> : null}
          </label>
          <label>
            <span>{t("members.phone", "Phone")}</span>
            <input className="field-input" dir="ltr" {...form.register("phone")} />
          </label>
          <label>
            <span>{t("members.roleLabel", "Role")}</span>
            <select className="field-select" {...form.register("role")}>
              {ROLES.map((role) => <option key={role} value={role}>{t(`members.roles.${role}`, role)}</option>)}
            </select>
          </label>
          <label>
            <span>{t("members.departmentLabel", "Department")}</span>
            <input className="field-input" {...form.register("department")} />
          </label>
          <label>
            <span>{t("members.statusLabel", "Status")}</span>
            <select className="field-select" {...form.register("status")}>
              {STATUSES.map((status) => <option key={status} value={status}>{t(`members.${status}`, status)}</option>)}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink/8 pt-4 dark:border-white/8">
          <button type="button" onClick={onClose} className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5">{t("members.addModal.cancel", "Cancel")}</button>
          <button type="submit" disabled={mutation.isPending} className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark">
            {t("members.addModal.save", "Save member")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── ID card + receipt modals ────────────────────────────────────────── */

function IdCardModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal isOpen onClose={onClose} title={t("members.idCardTitle", "Library ID card")} size="md">
      <div className="relative mx-auto w-72 overflow-hidden rounded-2xl bg-gradient-to-b from-[#1a4d40] to-[#122222] p-5 text-white shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <img src="/brand/ketabyar-symbol.png" alt="" className="h-8 w-8 rounded-lg" />
          <div>
            <p className="font-display text-sm font-bold">کتابیار</p>
            <p className="text-[9px] text-white/60">KETABYAR LIBRARY CARD</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {member.avatar_path ? (
            <img src={member.avatar_path} alt="" className="h-16 w-16 rounded-xl object-cover ring-2 ring-white/30" />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">{getMemberInitials(member.full_name)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{member.full_name}</p>
            <p className="text-[10px] text-white/70">{t(`members.roles.${member.role ?? "other"}`, member.role ?? "")}{member.department ? ` · ${member.department}` : ""}</p>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-white/12 py-2 text-center font-mono text-base font-bold tracking-[0.2em]">
          {formatMemberNumber(member.member_number)}
        </div>
        <p className="mt-3 text-center text-[9px] text-white/50">{member.joined_at.slice(0, 10)}</p>
      </div>
      <p className="mt-3 text-center text-xs text-ink/50 dark:text-ivory/50">
        {member.full_name} · {t(`members.roles.${member.role ?? "other"}`, member.role ?? "")}
      </p>
    </Modal>
  );
}

function ReceiptModal({ receipt, onClose }: { receipt: { kind: "renew" | "return"; title: string; date: string }; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal isOpen onClose={onClose} title={receipt.kind === "renew" ? t("circulation.renewReceiptTitle", "Renewal receipt") : t("circulation.returnReceiptTitle", "Return receipt")} size="md">
      <div className="rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 p-6 text-center dark:border-accent-dark/40 dark:bg-accent-dark/5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-copper">
          {receipt.kind === "renew" ? t("circulation.renew", "Renew") : t("circulation.return", "Return")}
        </p>
        <p className="mt-2 font-display text-base font-bold">{receipt.title}</p>
        <p className="mt-3 text-sm">
          {receipt.kind === "renew" ? t("circulation.newDueDate", "New due date") : t("circulation.returnedOn", "Returned on")}:{" "}
          <b>{formatDisplayDate(receipt.date)}</b>
        </p>
        <p className="mt-3 text-[10px] text-ink/45 dark:text-ivory/45">KetabYar · {formatDisplayDate(new Date().toISOString())}</p>
      </div>
    </Modal>
  );
}
