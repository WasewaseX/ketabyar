import { Plus } from "lucide-react";
import type { MouseEvent as ReactMouseEvent, RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ArtReading } from "../../components/ui/art";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { EmptyState, PageLoader } from "../../components/ui/primitives";
import { PageTitle } from "../../components/ui/shared";
import type { Member, MemberStatus } from "../../types";
import { MemberCard } from "./MemberCard";
import { MemberFilters, MembersPagination } from "./MemberFilters";

/** Left column of the members screen: header, filters, card grid, pager. */
export function MembersMain({
  filters,
  isLoading,
  pageMembers,
  currentPage,
  totalPages,
  setPage,
  pageSize,
  selectedIds,
  setSelectedIds,
  showContextMenu,
  setStatus,
  archive,
  onAdd,
  filteredCount,
  onOpen,
}: {
  filters: {
    searchRef: RefObject<HTMLInputElement | null>;
    term: string;
    setTerm: (value: string) => void;
    departmentFilter: string;
    setDepartmentFilter: (value: string) => void;
    departments: string[];
    sortKey: "name" | "number" | "joined";
    setSortKey: (key: "name" | "number" | "joined") => void;
    sortDir: 1 | -1;
    setSortDir: (updater: (dir: 1 | -1) => 1 | -1) => void;
    statusView: "all" | "active" | "suspended";
    setStatusView: (view: "all" | "active" | "suspended") => void;
    setPage: (page: number) => void;
  };
  isLoading: boolean;
  pageMembers: Member[];
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  pageSize: number;
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  showContextMenu: (
    event: ReactMouseEvent,
    items: ContextMenuItem[],
    options?: { title?: string },
  ) => void;
  setStatus: {
    mutate: (input: { member: Member; status: MemberStatus }) => void;
  };
  archive: { mutate: (id: string) => void };
  onAdd: () => void;
  filteredCount: number;
  onOpen: (member: Member) => void;
}) {
  const { t } = useTranslation();
  const {
    searchRef,
    term,
    setTerm,
    departmentFilter,
    setDepartmentFilter,
    departments,
    sortKey,
    setSortKey,
    sortDir,
    setSortDir,
    statusView,
    setStatusView,
  } = filters;
  return (
    <div className="min-w-0 flex-1">
      <PageTitle
        title={t("members.title", "Members")}
        detail={t("members.subtitle", "{{count}} members match your filters", {
          count: filteredCount,
        })}
        action={
          <button
            type="button"
            onClick={onAdd}
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

      {isLoading ? (
        <PageLoader label={t("members.loading", "Loading members…")} />
      ) : filteredCount === 0 ? (
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
                onOpen={() => onOpen(member)}
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
            total={filteredCount}
            pageSize={pageSize}
          />
        </>
      )}
    </div>
  );
}
