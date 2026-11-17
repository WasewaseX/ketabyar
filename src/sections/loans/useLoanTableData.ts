import { useMemo } from "react";
import type { Loan, LoanState } from "../../types";
import { type LoanFilter, loanState } from "./loanUtils";

/** Stable empty array — keeps the filter memos from re-running every render. */
const EMPTY_LOANS: Loan[] = [];

/**
 * Loans table derivation: due-state enrichment, filter counts and the
 * visible (filtered + sorted) list.
 */
export function useLoanTableData(deps: {
  allLoans: Loan[] | undefined;
  graceDays: number;
  dueSoonDays: number;
  term: string;
  filter: LoanFilter;
  sortBy: string;
}) {
  const allLoans = deps.allLoans ?? EMPTY_LOANS;

  const enriched = useMemo(
    () =>
      allLoans.map((loan) => ({
        loan,
        state: loanState(loan, deps.graceDays, deps.dueSoonDays),
      })),
    [allLoans, deps.graceDays, deps.dueSoonDays],
  );

  const counts = useMemo(
    () => ({
      all: enriched.length,
      active: enriched.filter((entry) => entry.state === "active").length,
      dueSoon: enriched.filter((entry) => entry.state === "dueSoon").length,
      overdue: enriched.filter((entry) => entry.state === "overdue").length,
      returned: enriched.filter((entry) => entry.state === "returned").length,
    }),
    [enriched],
  );

  const visible = useMemo(() => {
    const needle = deps.term.trim().toLowerCase();
    const list = enriched.filter(({ loan, state }) => {
      if (deps.filter !== "all" && state !== deps.filter) return false;
      if (!needle) return true;
      return [
        loan.title,
        loan.author,
        loan.member_name,
        loan.member_number,
        loan.barcode,
        loan.copy_shelf,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const factor = deps.sortBy.endsWith("Desc") ? -1 : 1;
    return list.sort((a, b) => {
      switch (deps.sortBy) {
        case "dueAsc":
        case "dueDesc":
          return factor * a.loan.due_at.localeCompare(b.loan.due_at);
        case "borrowedAsc":
        case "borrowedDesc":
          return factor * a.loan.borrowed_at.localeCompare(b.loan.borrowed_at);
        case "member":
          return (
            a.loan.member_name?.localeCompare(b.loan.member_name ?? "", "fa") ??
            0
          );
        case "title":
          return a.loan.title?.localeCompare(b.loan.title ?? "", "fa") ?? 0;
        default:
          return 0;
      }
    });
  }, [enriched, deps.filter, deps.sortBy, deps.term]);

  return { counts, visible };
}

export type { LoanState };
