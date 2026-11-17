import { useMemo } from "react";
import type { Member } from "../../types";

/** Stable empty array — keeps the filter memos from re-running every render. */
const NO_MEMBERS: Member[] = [];

/** Member list derivation: departments, filter+sort, pagination window. */
export function useMemberFilters(deps: {
  allMembers: Member[] | undefined;
  statusView: "all" | "active" | "suspended";
  departmentFilter: string;
  sortKey: "name" | "number" | "joined";
  sortDir: 1 | -1;
  page: number;
  pageSize: number;
}) {
  const allMembers = deps.allMembers ?? NO_MEMBERS;

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
      if (deps.statusView !== "all" && member.status !== deps.statusView)
        return false;
      if (deps.departmentFilter && member.department !== deps.departmentFilter)
        return false;
      return true;
    });
    return list.sort((a, b) => {
      const factor = deps.sortDir;
      if (deps.sortKey === "name")
        return factor * a.full_name.localeCompare(b.full_name, "fa");
      if (deps.sortKey === "number")
        return (
          factor *
          a.member_number.localeCompare(b.member_number, "en", {
            numeric: true,
          })
        );
      return factor * a.joined_at.localeCompare(b.joined_at);
    });
  }, [
    allMembers,
    deps.statusView,
    deps.departmentFilter,
    deps.sortKey,
    deps.sortDir,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / deps.pageSize));
  const currentPage = Math.min(deps.page, totalPages);
  const pageMembers = filtered.slice(
    (currentPage - 1) * deps.pageSize,
    currentPage * deps.pageSize,
  );

  return { departments, filtered, totalPages, currentPage, pageMembers };
}
