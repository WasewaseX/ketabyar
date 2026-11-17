import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useContextMenu } from "../components/ui/ContextMenu";
import {
  members as fetchMembers,
  getLoansForMember,
  getReservationsForMember,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import { MemberSidebar } from "./members/MemberSidebar";
import { MembersBulkBar, MembersDialogs } from "./members/MembersBulkBar";
import { MembersMain } from "./members/MembersMain";
import { useMemberFilters } from "./members/useMemberFilters";
import {
  useMemberCirculation,
  useMemberMutations,
} from "./members/useMemberMutations";
import { useMembersPageState } from "./members/useMembersPageState";

/**
 * Membership screen root: state comes from useMembersPageState, derivation
 * from useMemberFilters, and the grid/sidebar/dialogs are members/ modules.
 */
export function MembersPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;

  const {
    searchRef,
    term,
    setTerm,
    statusView,
    setStatusView,
    departmentFilter,
    setDepartmentFilter,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    page,
    setPage,
    selected,
    setSelected,
    sidebarTab,
    setSidebarTab,
    editOpen,
    setEditOpen,
    idCardOpen,
    setIdCardOpen,
    receipt,
    setReceipt,
    selectedIds,
    setSelectedIds,
    addOpen,
    setAddOpenState,
    closeAdd,
  } = useMembersPageState();

  const membersQuery = useQuery({
    queryKey: ["members", term],
    queryFn: () => fetchMembers(term),
  });
  const allMembers = membersQuery.data ?? [];

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
