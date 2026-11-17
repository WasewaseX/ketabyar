import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useContextMenu } from "../components/ui/ContextMenu";
import { EmptyState, PageLoader } from "../components/ui/primitives";
import { PageTitle, Table } from "../components/ui/shared";
import { loans as fetchLoans } from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import type { Loan } from "../types";
import { FinesPanel } from "./loans/FinesPanel";
import { LoanDetailsModal } from "./loans/LoanDetailsModal";
import { LoanRow } from "./loans/LoanRow";
import { LoansBulkBar, LoansToolbar } from "./loans/LoansControls";
import type { LoanFilter } from "./loans/loanUtils";
import { useLoanActions } from "./loans/useLoanActions";
import { useLoanTableData } from "./loans/useLoanTableData";

/** Stable empty array — keeps the filter memos from re-running every render. */
const EMPTY_LOANS: Loan[] = [];

/**
 * The circulation desk: every loan with live due-state (grace-aware),
 * returns, renewals, due-date overrides and the open-fines panel. Rows,
 * actions and panels live in ./loans/*.
 */
export function LoansPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<LoanFilter>("all");
  const [sortBy, setSortBy] = useState("dueAsc");
  const [details, setDetails] = useState<Loan | null>(null);
  const [dueDraft, setDueDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const graceDays = settings.grace_period_enabled
    ? settings.grace_period_days
    : 0;
  const dueSoonDays = settings.notify_due_soon_days ?? 0;

  const loansQuery = useQuery({
    queryKey: ["loans"],
    queryFn: () => fetchLoans(false),
  });
  const allLoans = loansQuery.data ?? EMPTY_LOANS;

  const { counts, visible } = useLoanTableData({
    allLoans: loansQuery.data,
    graceDays,
    dueSoonDays,
    term,
    filter,
    sortBy,
  });

  const invalidate = () => void queryClient.invalidateQueries();
  const { doReturn, renewOne, bulkRenew } = useLoanActions({
    t,
    invalidate,
    visible,
    selectedIds,
    setSelectedIds,
    setDetails,
  });

  const openDetails = (loan: Loan) => {
    setDetails(loan);
    setDueDraft(loan.due_at.slice(0, 10));
  };

  if (loansQuery.isLoading)
    return <PageLoader label={t("loans.loading", "Loading loans…")} />;

  return (
    <div>
      <PageTitle
        title={t("loans.title", "Loans")}
        detail={t(
          "loans.subtitle",
          "Checkout happens from a fulfilled hold — manage what's out from here.",
        )}
      />

      <FinesPanel
        onManage={(fine) => {
          const loan = allLoans.find((entry) => entry.id === fine.loan_id);
          if (loan) openDetails(loan);
        }}
      />

      <LoansToolbar
        term={term}
        setTerm={setTerm}
        filter={filter}
        setFilter={setFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        counts={counts}
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={RotateCcw}
          title={t("loans.noLoans", "No loans here")}
          description={t(
            "loans.noLoansHelp",
            "Loans appear when a ready hold is marked as picked up.",
          )}
        />
      ) : (
        <>
          <Table
            headers={[
              t("catalog.headers.title", "Title"),
              t("circulation.selectedMember", "Member"),
              t("circulation.barcode", "Barcode"),
              t("loans.borrowedDate", "Borrowed"),
              t("circulation.due", "Due"),
              t("status", "Status"),
              t("actions", "Actions"),
            ]}
            minWidth={980}
          >
            {visible.map((entry) => (
              <LoanRow
                key={entry.loan.id}
                entry={entry}
                selected={selectedIds.has(entry.loan.id)}
                renewLimit={settings.renew_limit}
                onToggle={(checked) => {
                  const next = new Set(selectedIds);
                  if (checked) next.add(entry.loan.id);
                  else next.delete(entry.loan.id);
                  setSelectedIds(next);
                }}
                onOpen={() => openDetails(entry.loan)}
                doReturn={doReturn}
                renewOne={renewOne}
                showContextMenu={showContextMenu}
              />
            ))}
          </Table>

          {selectedIds.size > 0 ? (
            <LoansBulkBar
              selectedIds={selectedIds}
              setSelectedIds={setSelectedIds}
              onReturnBulk={() => {
                if (
                  !window.confirm(
                    t(
                      "loans.alerts.confirmBulkReturn",
                      "Return {{count}} selected item(s)?",
                      { count: selectedIds.size },
                    ),
                  )
                )
                  return;
                void doReturn(
                  visible
                    .filter(({ loan }) => selectedIds.has(loan.id))
                    .map((entry) => entry.loan),
                );
              }}
              onRenewBulk={() => {
                if (
                  window.confirm(
                    t(
                      "loans.alerts.confirmBulkRenew",
                      "Renew {{count}} selected loan(s)?",
                      { count: selectedIds.size },
                    ),
                  )
                )
                  void bulkRenew();
              }}
            />
          ) : null}
        </>
      )}

      <LoanDetailsModal
        details={details}
        dueDraft={dueDraft}
        setDueDraft={setDueDraft}
        renewOne={renewOne}
        doReturn={doReturn}
        renewLimit={settings.renew_limit}
        invalidate={invalidate}
        onClose={() => setDetails(null)}
      />
    </div>
  );
}
