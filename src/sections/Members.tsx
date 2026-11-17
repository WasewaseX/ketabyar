import { useQueryClient } from "@tanstack/react-query";
import { Archive, Clock, UserCheck, UserX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useContextMenu } from "../components/ui/ContextMenu";
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
import type { MemberReceipt } from "./members/MemberModals";
import { MemberSidebar } from "./members/MemberSidebar";
import { MembersBulkBar, MembersDialogs } from "./members/MembersBulkBar";
import { MembersMain } from "./members/MembersMain";
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
      <MembersMain
        filters={{
          searchRef,
          term,
          setTerm: (value) => {
            setTerm(value);
            setPage(1);
          },
          departmentFilter,
          setDepartmentFilter: (value) => {
            setDepartmentFilter(value);
            setPage(1);
          },
          departments,
          sortKey,
          setSortKey,
          sortDir,
          setSortDir,
          statusView,
          setStatusView: (view) => {
            setStatusView(view);
            setPage(1);
          },
          setPage,
        }}
        filteredCount={filtered.length}
        isLoading={membersQuery.isLoading}
        pageMembers={pageMembers}
        currentPage={currentPage}
        totalPages={totalPages}
        setPage={setPage}
        pageSize={pageSize}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        showContextMenu={showContextMenu}
        setStatus={setStatus}
        archive={archive}
        onAdd={() => setAddOpenState(true)}
        onOpen={(member) => {
          setSelected(member);
          setSidebarTab("profile");
        }}
      />

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
