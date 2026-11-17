import { useQueryClient } from "@tanstack/react-query";
import { Archive, Clock, Plus, UserCheck, UserX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ArtReading } from "../components/ui/art";
import { useContextMenu } from "../components/ui/ContextMenu";
import { EmptyState, PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import {
  members as fetchMembers,
  getLoansForMember,
  getReservationsForMember,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import type { Member } from "../types";
import { cn } from "../utils/cn";
import { MemberCard } from "./members/MemberCard";
import { MemberFilters, MembersPagination } from "./members/MemberFilters";
import type { MemberReceipt } from "./members/MemberModals";
import { MemberSidebar } from "./members/MemberSidebar";
import { MembersBulkBar, MembersDialogs } from "./members/MembersBulkBar";
import { useMemberFilters } from "./members/useMemberFilters";
import {
  useMemberCirculation,
  useMemberMutations,
} from "./members/useMemberMutations";

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
  const [receipt, setReceipt] = useState<MemberReceipt | null>(null);
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

  const { departments, filtered, totalPages, currentPage, pageMembers } =
    useMemberFilters({
      allMembers,
      statusView,
      departmentFilter,
      sortKey,
      sortDir,
      page,
      pageSize,
    });

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

  const { archive, setStatus } = useMemberMutations({
    t,
    invalidate,
    setSelected,
    setSelectedIds,
  });
  const { doRenew, doReturn, doCancelHold } = useMemberCirculation({
    t,
    invalidate,
    setReceipt,
    loanDays: settings.loan_days,
  });

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

        <MemberFilters
          searchRef={searchRef}
          term={term}
          setTerm={(value) => {
            setTerm(value);
            setPage(1);
          }}
          departmentFilter={departmentFilter}
          setDepartmentFilter={(value) => {
            setDepartmentFilter(value);
            setPage(1);
          }}
          departments={departments}
          sortKey={sortKey}
          setSortKey={setSortKey}
          sortDir={sortDir}
          setSortDir={setSortDir}
          statusView={statusView}
          setStatusView={(view) => {
            setStatusView(view);
            setPage(1);
          }}
          setPage={setPage}
        />

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
                <MemberCard
                  key={member.id}
                  member={member}
                  selected={selectedIds.has(member.id)}
                  onToggle={(checked) => {
                    const next = new Set(selectedIds);
                    if (checked) next.add(member.id);
                    else next.delete(member.id);
                    setSelectedIds(next);
                  }}
                  onOpen={() => {
                    setSelected(member);
                    setSidebarTab("profile");
                  }}
                  showContextMenu={showContextMenu}
                  setStatus={setStatus}
                  archive={archive}
                />
              ))}
            </div>

            <MembersPagination
              currentPage={currentPage}
              totalPages={totalPages}
              setPage={setPage}
              total={filtered.length}
              pageSize={pageSize}
            />
          </>
        )}
      </div>

      {selected ? (
        <MemberSidebar
          selected={selected}
          sidebarTab={sidebarTab}
          setSidebarTab={setSidebarTab}
          loans={loansQuery.data ?? []}
          holds={holdsQuery.data ?? []}
          doRenew={doRenew}
          doReturn={doReturn}
          doCancelHold={doCancelHold}
          renewLimit={settings.renew_limit}
          onEdit={() => setEditOpen(true)}
          onIdCard={() => setIdCardOpen(true)}
        />
      ) : null}

      {selectedIds.size > 0 ? (
        <MembersBulkBar
          selectedIds={selectedIds}
          setSelectedIds={setSelectedIds}
          invalidate={invalidate}
        />
      ) : null}

      <MembersDialogs
        addOpen={addOpen}
        closeAdd={closeAdd}
        editOpen={editOpen}
        selected={selected}
        setEditOpen={setEditOpen}
        idCardOpen={idCardOpen}
        setIdCardOpen={setIdCardOpen}
        receipt={receipt}
        setReceipt={setReceipt}
        existingNumbers={allMembers.map((member) =>
          member.member_number.toLowerCase(),
        )}
      />
    </div>
  );
}
