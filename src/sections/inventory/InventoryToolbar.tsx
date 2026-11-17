import { Check, PackageSearch, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatPill } from "../../components/ui/widgets";
import { cn } from "../../utils/cn";

const CONDITIONS = ["mint", "good", "fair", "worn", "damaged"] as const;

/** Summary pills, the search/filter row and the map/list view toggles. */
export function InventoryToolbar({
  stats,
  term,
  setTerm,
  conditionFilter,
  setConditionFilter,
  gridView,
  setGridView,
  rowOrderDesc,
  setRowOrderDesc,
}: {
  stats: { total: number; shelved: number; repair: number; missing: number };
  term: string;
  setTerm: (value: string) => void;
  conditionFilter: string;
  setConditionFilter: (value: string) => void;
  gridView: boolean;
  setGridView: (value: boolean) => void;
  rowOrderDesc: boolean;
  setRowOrderDesc: (updater: (value: boolean) => boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatPill
          icon={PackageSearch}
          label={t("inventory.totalCopies", "Total copies")}
          value={stats.total}
        />
        <StatPill
          icon={Check}
          label={t("inventory.shelved", "Shelved")}
          value={`${stats.shelved} (${stats.total ? Math.round((stats.shelved / stats.total) * 100) : 0}%)`}
        />
        <StatPill
          icon={Pencil}
          label={t("inventory.needsRepair", "Needs repair")}
          value={stats.repair}
          tone="amber"
        />
        <StatPill
          icon={X}
          label={t("inventory.missing", "Missing / repair")}
          value={stats.missing}
          tone="danger"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          aria-label={t(
            "inventory.searchPlaceholder",
            "Barcode, title or shelf…",
          )}
          className="field-input max-w-xs"
          placeholder={t(
            "inventory.searchPlaceholder",
            "Barcode, title or shelf…",
          )}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <select
          aria-label={t("inventory.filterCondition", "Copy condition filter")}
          className="field-select max-w-40"
          value={conditionFilter}
          onChange={(event) => setConditionFilter(event.target.value)}
        >
          <option value="">
            {t("inventory.allConditions", "All conditions")}
          </option>
          {CONDITIONS.map((value) => (
            <option key={value} value={value}>
              {t(`catalog.condition.${value}`, value)}
            </option>
          ))}
        </select>
        <div className="ms-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setGridView(true)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold",
              gridView
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 dark:bg-white/5 dark:text-ivory/60",
            )}
          >
            {t("inventory.gridView", "Map")}
          </button>
          <button
            type="button"
            onClick={() => setGridView(false)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-bold",
              !gridView
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 dark:bg-white/5 dark:text-ivory/60",
            )}
          >
            {t("inventory.listView", "List")}
          </button>
          {gridView ? (
            <button
              type="button"
              onClick={() => setRowOrderDesc((value) => !value)}
              className="rounded-full bg-ink/5 px-3 py-1.5 text-xs font-bold text-ink/60 dark:bg-white/5 dark:text-ivory/60"
            >
              {rowOrderDesc
                ? t("inventory.rowOrderDesc", "A at bottom")
                : t("inventory.rowOrderAsc", "A at top")}
            </button>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Refresh + new-bookcase buttons for the page header. */
export function InventoryHeaderActions({
  onRefresh,
  refreshing,
  onNewColumn,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  onNewColumn: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={onRefresh}
        className="rounded-[var(--radius-control)] bg-ink/5 p-2 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10"
        aria-label="Refresh"
      >
        <RefreshCw size={15} className={cn(refreshing && "animate-spin")} />
      </button>
      <button
        type="button"
        onClick={onNewColumn}
        className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark"
      >
        <Plus size={15} />
        {t("inventory.addColumn", "New bookcase")}
      </button>
    </div>
  );
}
