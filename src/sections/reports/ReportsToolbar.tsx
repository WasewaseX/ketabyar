import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";
import { TAB_CHARTS, type TabId } from "./ReportsShared";

/** Tab pills and the date-range select. */
export function ReportsToolbar({
  activeTab,
  setActiveTab,
  range,
  setRange,
  rangeLabels,
}: {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  range: "7d" | "30d" | "1y" | "all";
  setRange: (value: "7d" | "30d" | "1y" | "all") => void;
  rangeLabels: Record<"7d" | "30d" | "1y" | "all", string>;
}) {
  const { t } = useTranslation();
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(TAB_CHARTS) as TabId[]).map((tab) => (
          <button
            type="button"
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-semibold transition",
              activeTab === tab
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
            )}
          >
            {t(`reports.tabs.${tab}`, tab)}
          </button>
        ))}
      </div>
      <select
        aria-label={t("reports.filterRange", "Date-range filter")}
        className="field-select max-w-40"
        value={range}
        onChange={(event) => setRange(event.target.value as typeof range)}
      >
        <option value="7d">{rangeLabels["7d"]}</option>
        <option value="30d">{rangeLabels["30d"]}</option>
        <option value="1y">{rangeLabels["1y"]}</option>
        <option value="all">{rangeLabels.all}</option>
      </select>
    </div>
  );
}
