import type { TFunction } from "i18next";
import { toast } from "sonner";
import { renewLoan, returnCopies } from "../../data/repositories/library";
import type { Loan } from "../../types";

type Entry = { loan: Loan; state: string };

/**
 * Return / renew / bulk-renew flows for the loans desk. Bulk renews run
 * sequentially so one refusal never aborts the rest (v1.2.4 audit).
 */
export function useLoanActions(deps: {
  t: TFunction;
  invalidate: () => void;
  visible: Entry[];
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  setDetails: (loan: Loan | null) => void;
}) {
  const doReturn = async (loans: Loan[]) => {
    const open = loans.filter((loan) => !loan.returned_at);
    if (open.length === 0) return;
    try {
      await returnCopies(open.map((loan) => loan.copy_id));
      toast.success(
        deps.t("loans.alerts.returned", "{{count}} item(s) returned", {
          count: open.length,
        }),
      );
      deps.setSelectedIds(new Set());
      deps.setDetails(null);
      deps.invalidate();
    } catch (error) {
      toast.error(
        deps.t("loans.alerts.returnFailed", "Return failed: {{message}}", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const renewOne = async (loan: Loan) => {
    try {
      await renewLoan(loan.id);
      toast.success(deps.t("loans.alerts.renewed", "Loan renewed"));
      deps.invalidate();
    } catch (error) {
      toast.error(
        deps.t("loans.alerts.renewFailed", "Renew failed: {{message}}", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

  const bulkRenew = async () => {
    const targets = deps.visible
      .filter(
        ({ loan, state }) =>
          deps.selectedIds.has(loan.id) && state !== "returned",
      )
      .map((entry) => entry.loan);
    let succeeded = 0;
    let firstFailure = "";
    for (const loan of targets) {
      try {
        await renewLoan(loan.id);
        succeeded += 1;
      } catch (error) {
        if (!firstFailure)
          firstFailure = error instanceof Error ? error.message : String(error);
      }
    }
    if (succeeded > 0)
      toast.success(
        deps.t("loans.alerts.bulkRenewed", "{{count}} loan(s) renewed", {
          count: succeeded,
        }),
      );
    if (firstFailure)
      toast.error(
        deps.t(
          "loans.alerts.bulkRenewPartial",
          "{{count}} failed: {{reason}}",
          {
            count: targets.length - succeeded,
            reason: firstFailure,
          },
        ),
      );
    deps.setSelectedIds(new Set());
    deps.invalidate();
  };

  return { doReturn, renewOne, bulkRenew };
}
