import { Info } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { PageLoader } from "../../components/ui/primitives";
import { InventoryCharts, MembersCharts } from "./InventoryMembersCharts";
import { CirculationCharts, OverviewCharts } from "./OverviewCirculationCharts";
import type { TabId } from "./ReportsShared";

type RegisterChart = (key: string, element: HTMLDivElement | null) => void;

/** KPI tiles and the active tab's chart grid. */
export function ReportsChartsGrid({
  loading,
  kpis,
  locale,
  activeTab,
  registerChart,
  data,
  activeDepartments,
}: {
  loading: boolean;
  kpis: {
    icon: typeof Info;
    label: string;
    sub: string;
    value: number | string;
  }[];
  locale: string;
  activeTab: TabId;
  registerChart: RegisterChart;
  data: {
    trendData: ComponentProps<typeof OverviewCharts>["trendData"];
    trendBadge: string | null;
    categoriesData: ComponentProps<typeof OverviewCharts>["categoriesData"];
    rhythm: ComponentProps<typeof OverviewCharts>["rhythm"];
    loanCounts: ComponentProps<typeof OverviewCharts>["loanCounts"];
    itemTypesData: ComponentProps<typeof CirculationCharts>["itemTypesData"];
    copyStatusData: ComponentProps<typeof InventoryCharts>["copyStatusData"];
    conditionsData: ComponentProps<typeof InventoryCharts>["conditionsData"];
    inventoryCategoriesData: ComponentProps<
      typeof InventoryCharts
    >["inventoryCategoriesData"];
    rolesData: ComponentProps<typeof MembersCharts>["rolesData"];
    memberStatusData: ComponentProps<typeof MembersCharts>["memberStatusData"];
    memberJoinsData: ComponentProps<typeof MembersCharts>["memberJoinsData"];
  };
  activeDepartments: ComponentProps<typeof MembersCharts>["activeDepartments"];
}) {
  const { t } = useTranslation();
  const {
    trendData,
    trendBadge,
    categoriesData,
    rhythm,
    loanCounts,
    itemTypesData,
    copyStatusData,
    conditionsData,
    inventoryCategoriesData,
    rolesData,
    memberStatusData,
    memberJoinsData,
  } = data;
  if (loading)
    return (
      <PageLoader label={t("reports.loading", "Crunching the numbers…")} />
    );

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]"
          >
            <div className="flex items-center gap-2 text-ink/55 dark:text-ivory/55">
              <kpi.icon size={15} />
              <p className="text-xs font-semibold">{kpi.label}</p>
            </div>
            <p className="mt-2 font-display text-2xl font-bold tabular-nums">
              {typeof kpi.value === "number"
                ? kpi.value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US")
                : kpi.value}
            </p>
            <p className="text-[11px] text-ink/45 dark:text-ivory/45">
              {kpi.sub}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {activeTab === "overview" ? (
          <OverviewCharts
            trendData={trendData}
            trendBadge={trendBadge}
            categoriesData={categoriesData}
            rhythm={rhythm}
            loanCounts={loanCounts}
            registerChart={registerChart}
          />
        ) : null}

        {activeTab === "circulation" ? (
          <CirculationCharts
            trendData={trendData}
            rhythm={rhythm}
            itemTypesData={itemTypesData}
            loanCounts={loanCounts}
            registerChart={registerChart}
          />
        ) : null}

        {activeTab === "inventory" ? (
          <InventoryCharts
            copyStatusData={copyStatusData}
            conditionsData={conditionsData}
            inventoryCategoriesData={inventoryCategoriesData}
            itemTypesData={itemTypesData}
            registerChart={registerChart}
          />
        ) : null}

        {activeTab === "members" ? (
          <MembersCharts
            rolesData={rolesData}
            activeDepartments={activeDepartments}
            memberStatusData={memberStatusData}
            memberJoinsData={memberJoinsData}
            registerChart={registerChart}
          />
        ) : null}

        <div className="md:col-span-2">
          <p className="flex items-center gap-2 text-xs text-ink/45 dark:text-ivory/45">
            <Info size={13} />
            {t(
              "reports.emptyChartNote",
              "Charts with no data stay empty — KetabYar never invents numbers.",
            )}
          </p>
        </div>
      </div>
    </>
  );
}
