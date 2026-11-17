import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Clock,
  Pencil,
  Phone,
  Plus,
  UserCheck,
  UserX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArtReading } from "../components/ui/art";
import { useContextMenu } from "../components/ui/ContextMenu";
import { EmptyState, Modal, PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import {
  cancelReservation,
  deleteMember,
  members as fetchMembers,
  getLoansForMember,
  getReservationsForMember,
  renewLoan,
  returnCopies,
  updateMember,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import type { Loan, Member, MemberStatus, Reservation } from "../types";
import { cn } from "../utils/cn";
import { daysLate, dueDate, formatDisplayDate, today } from "../utils/dates";
import { formatMemberNumber } from "../utils/isbn";

/**
 * Membership: registration, profiles with loans & holds, ID cards, status
 * management, and archive (soft-delete, guarded by open loans).
 */

/** Stable empty array — keeps the filter memos from re-running every render. */
const NO_MEMBERS: Member[] = [];

/* ── Shared helpers (also used by Loans / Reservations) ──────────────── */

export function MemberStatusBadge({
  status,
  iconOnly,
}: {
  status: string;
  iconOnly?: boolean;
}) {
  const { t } = useTranslation();
  const map: Record<string, { icon: typeof UserCheck; tone: string }> = {
    active: {
      icon: UserCheck,
      tone: "bg-accent/12 text-accent dark:text-accent-dark",
    },
    suspended: { icon: UserX, tone: "bg-red-600/10 text-red-600" },
    expired: { icon: Clock, tone: "bg-amber-500/12 text-amber-600" },
    archived: {
      icon: Archive,
      tone: "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55",
    },
  };
  const entry = map[status] ?? map.archived;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold",
        entry.tone,
      )}
      title={t(`members.${status}`, status)}
    >
      <entry.icon size={11} />
      {!iconOnly ? t(`members.${status}`, status) : null}
    </span>
  );
}

export function splitFullName(fullName: string): {
  first: string;
  last: string;
} {
  const parts = fullName.trim().split(/\s+/);
  return {
    first: parts[0] ?? "",
    last: (parts.slice(1).join(" ") || "").toUpperCase(),
  };
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

import { IdCardModal, MemberModal, ReceiptModal } from "./members/MemberModals";
import { STATUSES } from "./members/membersShared";

/* ── Page ────────────────────────────────────────────────────────────── */

export function MembersPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;

  const [term, setTerm] = useState("");
  const [statusView, setStatusView] = useState<"all" | "active" | "suspended">(
    "all",
  );
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [sortKey, setSortKey] = useState<"name" | "number" | "joined">("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Member | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"profile" | "loans" | "holds">(
    "profile",
  );
  const [editOpen, setEditOpen] = useState(false);
  const [idCardOpen, setIdCardOpen] = useState(false);
  const [receipt, setReceipt] = useState<{
    kind: "renew" | "return";
    title: string;
    date: string;
    printedAt: string;
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement | null>(null);

  const membersQuery = useQuery({
    queryKey: ["members", term],
    queryFn: () => fetchMembers(term),
  });
  const allMembers = membersQuery.data ?? NO_MEMBERS;

  /* Deep links (?action=add-member, ?focus=search) are one-shot: the modal is
    derived from the URL so it also opens when the palette fires mid-page,
    and the param is consumed immediately so back/reload never re-fires it. */
  const navigate = useNavigate();
  const addRequested = useMemo(
    () => new URLSearchParams(location.search).get("action") === "add-member",
    [location.search],
  );
  const [addOpenState, setAddOpenState] = useState(addRequested);
  const addOpen = addRequested || addOpenState;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("focus") === "search") searchRef.current?.focus();
    if (params.get("action") || params.get("focus"))
      history.replaceState(null, "", location.pathname);
  }, [location.pathname, location.search]);

  const closeAdd = () => {
    setAddOpenState(false);
    if (addRequested) navigate(location.pathname, { replace: true });
  };

  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          allMembers
            .map((member) => member.department)
            .filter(Boolean) as string[],
        ),
      ).sort(),
    [allMembers],
  );

  const filtered = useMemo(() => {
    const list = allMembers.filter((member) => {
      if (statusView !== "all" && member.status !== statusView) return false;
      if (departmentFilter && member.department !== departmentFilter)
        return false;
      return true;
    });
    return list.sort((a, b) => {
      const factor = sortDir;
      if (sortKey === "name")
        return factor * a.full_name.localeCompare(b.full_name, "fa");
      if (sortKey === "number")
        return (
          factor *
          a.member_number.localeCompare(b.member_number, "en", {
            numeric: true,
          })
        );
      return factor * a.joined_at.localeCompare(b.joined_at);
    });
  }, [allMembers, statusView, departmentFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageMembers = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

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
      toast.success(
        t("members.alerts.archived", "Member archived — history retained"),
      );
      setSelected(null);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: ({
      member,
      status,
    }: {
      member: Member;
      status: MemberStatus;
    }) => updateMember(member.id, { ...member, status }),
    onSuccess: () => {
      toast.success(t("members.statusUpdated", "Status updated"));
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const doRenew = async (loan: Loan) => {
    try {
      await renewLoan(loan.id);
      toast.success(t("circulation.alerts.renewSuccess", "Loan renewed"));
      setReceipt({
        kind: "renew",
        title: loan.title ?? "",
        date: dueDate(settings.loan_days),
        printedAt: today(),
      });
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doReturn = async (loan: Loan) => {
    try {
      await returnCopies([loan.copy_id]);
      toast.success(t("circulation.alerts.returnSuccess", "Item returned"));
      setReceipt({
        kind: "return",
        title: loan.title ?? "",
        date: today(),
        printedAt: today(),
      });
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doCancelHold = async (reservation: Reservation) => {
    try {
      await cancelReservation(reservation.id);
      toast.success(
        t("members.alerts.reservationCancelled", "Reservation cancelled"),
      );
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
          detail={t(
            "members.subtitle",
            "{{count}} members match your filters",
            { count: filtered.length },
          )}
          action={
            <button
              type="button"
              onClick={() => setAddOpenState(true)}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark"
            >
              <Plus size={16} />
              {t("members.addMember", "Add member")}
            </button>
          }
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            ref={searchRef}
            aria-label={t(
              "members.searchPlaceholder",
              "Search name, number, phone…",
            )}
            className="field-input max-w-xs"
            placeholder={t(
              "members.searchPlaceholder",
              "Search name, number, phone…",
            )}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setPage(1);
            }}
          />
          <select
            aria-label={t("members.filterDepartment", "Department filter")}
            className="field-select max-w-44"
            value={departmentFilter}
            onChange={(event) => {
              setDepartmentFilter(event.target.value);
              setPage(1);
            }}
          >
            <option value="">
              {t("members.allDepartments", "All departments")}
            </option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
          <select
            aria-label={t("members.sortBy", "Sort by")}
            className="field-select max-w-40"
            value={sortKey}
            onChange={(event) =>
              setSortKey(event.target.value as typeof sortKey)
            }
          >
            <option value="name">{t("members.sortByName", "By name")}</option>
            <option value="number">{t("members.sortById", "By number")}</option>
            <option value="joined">
              {t("members.sortByJoined", "By join date")}
            </option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((dir) => (dir === 1 ? -1 : 1))}
            className="rounded-[var(--radius-control)] bg-ink/5 px-3 py-2 text-xs font-bold text-ink/60 dark:bg-white/5 dark:text-ivory/60"
          >
            {sortDir === 1 ? t("asc", "A→Z") : t("desc", "Z→A")}
          </button>
        </div>

        <div className="mb-4 flex gap-1.5">
          {(["all", "active", "suspended"] as const).map((key) => (
            <button
              type="button"
              key={key}
              onClick={() => {
                setStatusView(key);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition",
                statusView === key
                  ? "bg-accent text-white dark:bg-accent-dark"
                  : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
              )}
            >
              {t(`members.${key === "all" ? "allMembers" : key}`, key)}
            </button>
          ))}
        </div>

        {membersQuery.isLoading ? (
          <PageLoader label={t("members.loading", "Loading members…")} />
        ) : filtered.length === 0 ? (
          <EmptyState
            artwork={<ArtReading />}
            title={t("members.noMembers", "No members here")}
            description={t(
              "members.noMembersHelp",
              "Register the library's first borrower to get circulation going.",
            )}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-4">
              {pageMembers.map((member) => (
                <div
                  key={member.id}
                  className="relative cursor-pointer rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 pt-8 shadow-card transition hover:border-accent/30 dark:border-white/8 dark:bg-[#1b2723] dark:hover:border-accent-dark/30"
                >
                  {/* Overlay button: opens the profile for the whole card
                      while the checkbox stays a sibling — a native button
                      cannot contain an input, and role="button" on the card
                      trips prefer-tag-over-role. Positioned children paint
                      above the transparent button; plain content sits
                      underneath it, so every click lands on the card action. */}
                  <button
                    type="button"
                    aria-label={member.full_name}
                    onClick={() => {
                      setSelected(member);
                      setSidebarTab("profile");
                    }}
                    onContextMenu={(event) =>
                      showContextMenu(
                        event,
                        [
                          {
                            id: "view",
                            label: t("members.viewDetails", "View details"),
                            onClick: () => {
                              setSelected(member);
                              setSidebarTab("profile");
                            },
                          },
                          {
                            id: "copyNum",
                            label: t(
                              "members.copyNumber",
                              "Copy member number",
                            ),
                            onClick: () => {
                              void navigator.clipboard.writeText(
                                member.member_number,
                              );
                              toast.success(
                                t(
                                  "members.copiedNumber",
                                  "Member number copied",
                                ),
                              );
                            },
                          },
                          ...(member.email
                            ? [
                                {
                                  id: "copyEmail",
                                  label: t("members.copyEmail", "Copy email"),
                                  onClick: () => {
                                    void navigator.clipboard.writeText(
                                      member.email ?? "",
                                    );
                                    toast.success(
                                      t("members.copiedEmail", "Email copied"),
                                    );
                                  },
                                },
                              ]
                            : []),
                          ...(member.phone
                            ? [
                                {
                                  id: "copyPhone",
                                  label: t("members.copyPhone", "Copy phone"),
                                  onClick: () => {
                                    void navigator.clipboard.writeText(
                                      member.phone ?? "",
                                    );
                                    toast.success(
                                      t("members.copiedPhone", "Phone copied"),
                                    );
                                  },
                                },
                              ]
                            : []),
                          { id: "d", divider: true },
                          ...STATUSES.filter(
                            (status) => status !== member.status,
                          ).map((status) => ({
                            id: `set-${status}`,
                            label: t(
                              `members.set${status[0].toUpperCase()}${status.slice(1)}`,
                              status,
                            ),
                            onClick: () => setStatus.mutate({ member, status }),
                          })),
                          { id: "d2", divider: true },
                          {
                            id: "archive",
                            label: t("members.deleteMember", "Archive member"),
                            icon: Archive,
                            variant: "danger",
                            onClick: () => {
                              if (
                                window.confirm(
                                  t(
                                    "members.confirmDelete",
                                    'Archive "{{name}}"? Their history is retained.',
                                    { name: member.full_name },
                                  ),
                                )
                              )
                                archive.mutate(member.id);
                            },
                          },
                        ],
                        { title: member.full_name },
                      )
                    }
                    className="absolute inset-0 z-0 cursor-pointer rounded-[inherit] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-accent dark:focus-visible:ring-accent-dark"
                  />
                  <div className="absolute end-3 top-3">
                    <MemberStatusBadge status={member.status} />
                  </div>
                  <input
                    type="checkbox"
                    className="absolute start-3 top-3"
                    aria-label={t(
                      "members.selectRow",
                      "Select member {{name}}",
                      { name: member.full_name },
                    )}
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
                      <img
                        src={member.avatar_path}
                        alt=""
                        className="h-12 w-12 rounded-full object-cover ring-2 ring-accent/20"
                      />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-sm font-bold text-white">
                        {getMemberInitials(member.full_name)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold">
                        {member.full_name}
                      </p>
                      <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">
                        {formatMemberNumber(member.member_number)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 space-y-0.5 text-[11px] text-ink/60 dark:text-ivory/60">
                    <p>
                      {t(
                        `members.roles.${member.role ?? "other"}`,
                        member.role ?? "",
                      )}
                      {member.department ? ` · ${member.department}` : ""}
                    </p>
                    {member.phone ? (
                      <p className="flex items-center gap-1">
                        <Phone size={10} /> {member.phone}
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
              <span>
                {t(
                  "catalog.showing",
                  "Showing {{start}}–{{end}} of {{total}}",
                  {
                    start: (currentPage - 1) * pageSize + 1,
                    end: Math.min(currentPage * pageSize, filtered.length),
                    total: filtered.length,
                  },
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                  className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
                >
                  ‹
                </button>
                <span className="tabular-nums">
                  {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage(currentPage + 1)}
                  className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
                >
                  ›
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Sidebar */}
      {selected ? (
        <aside
          key={selected.id}
          className="sticky top-0 w-[340px] shrink-0 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]"
        >
          <div className="flex items-center gap-3 border-b border-ink/8 p-4 dark:border-white/8">
            {selected.avatar_path ? (
              <img
                src={selected.avatar_path}
                alt=""
                className="h-12 w-12 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-sm font-bold text-white">
                {getMemberInitials(selected.full_name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{selected.full_name}</p>
              <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">
                {formatMemberNumber(selected.member_number)}
              </p>
            </div>
            <MemberStatusBadge status={selected.status} />
          </div>

          <div className="flex border-b border-ink/8 text-[13px] font-semibold dark:border-white/8">
            {(["profile", "loans", "holds"] as const).map((key) => (
              <button
                type="button"
                key={key}
                onClick={() => setSidebarTab(key)}
                className={cn(
                  "flex-1 py-2.5 transition",
                  sidebarTab === key
                    ? "border-b-2 border-accent text-accent dark:border-accent-dark dark:text-accent-dark"
                    : "text-ink/50 dark:text-ivory/50",
                )}
              >
                {t(`members.tabs.${key}`, key)}
                {key === "loans" && loansQuery.data
                  ? ` (${loansQuery.data.filter((loan) => !loan.returned_at).length})`
                  : ""}
                {key === "holds" && holdsQuery.data
                  ? ` (${holdsQuery.data.length})`
                  : ""}
              </button>
            ))}
          </div>

          <div className="max-h-[62vh] overflow-y-auto p-4">
            {sidebarTab === "profile" ? (
              <>
                <dl className="space-y-2 text-[13px]">
                  <div className="flex justify-between">
                    <dt className="text-ink/50 dark:text-ivory/50">
                      {t("members.roleLabel", "Role")}
                    </dt>
                    <dd className="font-medium">
                      {t(
                        `members.roles.${selected.role ?? "other"}`,
                        selected.role ?? "—",
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink/50 dark:text-ivory/50">
                      {t("members.departmentLabel", "Department")}
                    </dt>
                    <dd className="font-medium">
                      {selected.department || t("members.noDepartment", "—")}
                    </dd>
                  </div>
                  {selected.phone ? (
                    <div className="flex justify-between">
                      <dt className="text-ink/50 dark:text-ivory/50">
                        {t("members.phone", "Phone")}
                      </dt>
                      <dd className="font-medium" dir="ltr">
                        {selected.phone}
                      </dd>
                    </div>
                  ) : null}
                  {selected.email ? (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-ink/50 dark:text-ivory/50">
                        {t("members.email", "Email")}
                      </dt>
                      <dd className="truncate font-medium" dir="ltr">
                        <a
                          href={`mailto:${selected.email}`}
                          className="hover:underline"
                        >
                          {selected.email}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between">
                    <dt className="text-ink/50 dark:text-ivory/50">
                      {t("members.registeredOn", "Registered")}
                    </dt>
                    <dd className="font-medium">
                      {formatDisplayDate(selected.joined_at)}
                    </dd>
                  </div>
                </dl>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setIdCardOpen(true)}
                    className="rounded-xl bg-ink/5 py-2 text-xs font-bold hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
                  >
                    {t("members.viewIdCard", "View ID card")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-bold text-white dark:bg-accent-dark"
                  >
                    <Pencil size={12} /> {t("catalog.details.edit", "Edit")}
                  </button>
                </div>
              </>
            ) : sidebarTab === "loans" ? (
              (loansQuery.data ?? []).length === 0 ? (
                <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
                  {t("members.noActiveLoans", "No loans on record.")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {(loansQuery.data ?? []).map((loan) => {
                    const open = !loan.returned_at;
                    const late = open && daysLate(loan.due_at) > 0;
                    return (
                      <li
                        key={loan.id}
                        className="rounded-xl border border-ink/8 p-3 dark:border-white/8"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold">
                              {loan.title}
                            </p>
                            <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">
                              {loan.barcode}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[10px] font-bold",
                              !open
                                ? "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55"
                                : late
                                  ? "bg-red-600/10 text-red-600"
                                  : "bg-copper/12 text-copper",
                            )}
                          >
                            {open
                              ? late
                                ? t("reports.statusLabels.overdue", "Overdue")
                                : t("reports.statusLabels.onloan", "On loan")
                              : t("reports.statusLabels.returned", "Returned")}
                          </span>
                        </div>
                        {open ? (
                          <>
                            <p
                              className={cn(
                                "mt-1 text-[11px]",
                                late
                                  ? "font-bold text-red-600"
                                  : "text-ink/60 dark:text-ivory/60",
                              )}
                            >
                              {t("circulation.due", "Due")}:{" "}
                              {formatDisplayDate(loan.due_at)}
                              {late
                                ? ` · ${t("circulation.daysOverdue", "{{count}} days late", { count: daysLate(loan.due_at) })}`
                                : ""}
                            </p>
                            <div className="mt-2 flex gap-1.5">
                              <button
                                type="button"
                                onClick={() => void doRenew(loan)}
                                disabled={
                                  loan.renewed_count >= settings.renew_limit
                                }
                                title={
                                  loan.renewed_count >= settings.renew_limit
                                    ? t(
                                        "circulation.alerts.renewLimitReached",
                                        "Renewal limit reached",
                                      )
                                    : undefined
                                }
                                className="flex-1 rounded-lg bg-ink/5 py-1.5 text-[11px] font-bold hover:bg-ink/10 disabled:opacity-40 dark:bg-white/8 dark:hover:bg-white/15"
                              >
                                {t("circulation.renew", "Renew")} (
                                {loan.renewed_count}/{settings.renew_limit})
                              </button>
                              <button
                                type="button"
                                onClick={() => void doReturn(loan)}
                                className="flex-1 rounded-lg bg-accent py-1.5 text-[11px] font-bold text-white dark:bg-accent-dark"
                              >
                                {t("circulation.return", "Return")}
                              </button>
                            </div>
                          </>
                        ) : (
                          <p className="mt-1 text-[11px] text-ink/50 dark:text-ivory/50">
                            {t("circulation.returnedOn", "Returned")}:{" "}
                            {formatDisplayDate(loan.returned_at ?? "")}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (holdsQuery.data ?? []).length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
                {t("members.noReservations", "No holds on record.")}
              </p>
            ) : (
              <ul className="space-y-2">
                {(holdsQuery.data ?? []).map((reservation) => (
                  <li
                    key={reservation.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-ink/8 p-3 dark:border-white/8"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold">
                        {reservation.title}
                      </p>
                      <p
                        className={cn(
                          "text-[10px] font-bold",
                          reservation.status === "ready"
                            ? "text-accent dark:text-accent-dark"
                            : "text-copper",
                        )}
                      >
                        {reservation.status}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void doCancelHold(reservation)}
                      className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-[11px] font-bold hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
                    >
                      {t("common.cancel", "Cancel")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      ) : null}

      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
          <span className="font-bold">
            {t("members.bulk.selectedCount", "{{count}} selected", {
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
          <button
            type="button"
            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
            onClick={() => {
              if (
                !window.confirm(
                  t(
                    "members.alerts.confirmBulkArchive",
                    "Archive {{count}} members?",
                    { count: selectedIds.size },
                  ),
                )
              )
                return;
              Promise.allSettled(
                Array.from(selectedIds).map((id) => deleteMember(id)),
              ).then(() => {
                toast.success(
                  t("members.alerts.bulkArchived", "Members archived"),
                );
                setSelectedIds(new Set());
                invalidate();
              });
            }}
          >
            {t("catalog.bulk.archiveSelected", "Archive selected")}
          </button>
        </div>
      ) : null}

      {addOpen ? (
        <MemberModal
          onClose={() => closeAdd()}
          existingNumbers={allMembers.map((member) =>
            member.member_number.toLowerCase(),
          )}
        />
      ) : null}
      {editOpen && selected ? (
        <MemberModal
          member={selected}
          onClose={() => setEditOpen(false)}
          existingNumbers={allMembers
            .filter((member) => member.id !== selected.id)
            .map((member) => member.member_number.toLowerCase())}
        />
      ) : null}
      {idCardOpen && selected ? (
        <IdCardModal member={selected} onClose={() => setIdCardOpen(false)} />
      ) : null}
      {receipt ? (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      ) : null}
    </div>
  );
}

/* ── Add / edit modal ────────────────────────────────────────────────── */
