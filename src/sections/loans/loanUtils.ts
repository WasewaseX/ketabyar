import type { TFunction } from "i18next";
import type { Loan, LoanState } from "../../types";

export type LoanFilter = "all" | "active" | "dueSoon" | "overdue" | "returned";

/** Live due-state of a loan, grace-period aware. */
export function loanState(
  loan: Loan,
  graceDays: number,
  dueSoonDays: number,
): LoanState {
  if (loan.returned_at) return "returned";
  const due = new Date(loan.due_at).getTime();
  const now = Date.now();
  if (now > due + graceDays * 86_400_000) return "overdue";
  if (dueSoonDays > 0 && due <= now + dueSoonDays * 86_400_000)
    return "dueSoon";
  return "active";
}

export function daysOverdue(loan: Loan): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(loan.due_at).getTime()) / 86_400_000),
  );
}

export function daysUntilDue(loan: Loan): number {
  return Math.ceil((new Date(loan.due_at).getTime() - Date.now()) / 86_400_000);
}

/** Pill tone per loan state. */
export const stateTone: Record<LoanState, string> = {
  active: "bg-accent/10 text-accent dark:text-accent-dark",
  dueSoon: "bg-amber-500/12 text-amber-600",
  overdue: "bg-red-600/10 text-red-600",
  returned: "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55",
};

export function loanStateLabel(state: LoanState, t: TFunction): string {
  return t(
    `loans.state.${state}`,
    {
      active: t("loans.state.active", "Active"),
      dueSoon: t("loans.state.dueSoon", "Due soon"),
      overdue: t("loans.state.overdue", "Overdue"),
      returned: t("loans.state.returned", "Returned"),
    }[state],
  );
}
