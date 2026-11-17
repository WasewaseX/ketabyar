import { useTranslation } from "react-i18next";
import { FilterPill } from "../../components/ui/widgets";
import type { LoanFilter } from "./loanUtils";
import { loanStateLabel } from "./loanUtils";

/** Search field, state pills and the sort select above the loans table. */
export function LoansToolbar({
  term,
  setTerm,
  filter,
  setFilter,
  sortBy,
  setSortBy,
  counts,
}: {
  term: string;
  setTerm: (value: string) => void;
  filter: LoanFilter;
  setFilter: (filter: LoanFilter) => void;
  sortBy: string;
  setSortBy: (value: string) => void;
  counts: {
    all: number;
    active: number;
    dueSoon: number;
    overdue: number;
    returned: number;
  };
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <input
        aria-label={t("loans.searchPlaceholder", "Title, member, barcode…")}
        className="field-input max-w-xs"
        placeholder={t("loans.searchPlaceholder", "Title, member, barcode…")}
        value={term}
        onChange={(event) => setTerm(event.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {(
          ["all", "active", "dueSoon", "overdue", "returned"] as LoanFilter[]
        ).map((key) => (
          <FilterPill
            key={key}
            active={filter === key}
            count={counts[key]}
            onClick={() => setFilter(key)}
          >
            {key === "all"
              ? t("loans.filters.all", "All")
              : loanStateLabel(key, t)}
          </FilterPill>
        ))}
      </div>
      <select
        aria-label={t("loans.sortBy", "Sort by")}
        className="field-select ms-auto max-w-44"
        value={sortBy}
        onChange={(event) => setSortBy(event.target.value)}
      >
        <option value="dueAsc">{t("loans.sort.dueAsc", "Due ↑")}</option>
        <option value="dueDesc">{t("loans.sort.dueDesc", "Due ↓")}</option>
        <option value="borrowedDesc">
          {t("loans.sort.borrowedDesc", "Newest borrowed")}
        </option>
        <option value="borrowedAsc">
          {t("loans.sort.borrowedAsc", "Oldest borrowed")}
        </option>
        <option value="member">{t("loans.sort.member", "By member")}</option>
        <option value="title">{t("loans.sort.title", "By title")}</option>
      </select>
    </div>
  );
}

/** Floating bulk bar: return or renew the selected loans. */
export function LoansBulkBar({
  selectedIds,
  setSelectedIds,
  onReturnBulk,
  onRenewBulk,
}: {
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  onReturnBulk: () => void;
  onRenewBulk: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
      <span className="font-bold">
        {t("loans.bulk.selectedCount", "{{count}} selected", {
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
        className="rounded-lg bg-accent px-3 py-1.5 font-semibold dark:bg-accent-dark"
        onClick={onReturnBulk}
      >
        {t("loans.bulk.return", "Return ({{count}})", {
          count: selectedIds.size,
        })}
      </button>
      <button
        type="button"
        className="rounded-lg bg-copper px-3 py-1.5 font-semibold"
        onClick={onRenewBulk}
      >
        {t("loans.bulk.renew", "Renew ({{count}})", {
          count: selectedIds.size,
        })}
      </button>
    </div>
  );
}
