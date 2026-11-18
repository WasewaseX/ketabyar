import { useTranslation } from "react-i18next";
import {
  AreaChartCard,
  BarChartCard,
  type LoanCounts,
  PIE_COLORS,
  PieChartCard,
  SingleBarChart,
} from "./ReportsShared";

type TrendPoint = { name: string; circulation: number };
type Datum = { name: string; value: number };
type Rhythm = { time: string; checkouts: number; returns: number };
type ChartRefs = (key: string, element: HTMLDivElement | null) => void;

/** Overview tab: circulation trend, top categories, status pie, hourly rhythm. */
export function OverviewCharts({
  trendData,
  trendBadge,
  categoriesData,
  rhythm,
  loanCounts,
  registerChart,
}: {
  trendData: TrendPoint[];
  trendBadge: string | null;
  categoriesData: Datum[];
  rhythm: Rhythm[];
  loanCounts: LoanCounts;
  registerChart: ChartRefs;
}) {
  const { t } = useTranslation();
  return (
    <>
      <AreaChartCard
        name="circulationTrend"
        registerChart={registerChart}
        title={t("reports.charts.circulationTrend", "Circulation trend")}
        data={trendData}
        xKey="name"
        seriesKey="circulation"
        color="var(--color-accent)"
        gradientId="gradCirculation"
        badge={
          trendBadge
            ? {
                positive: !trendBadge.startsWith("-"),
                text: `${trendBadge} ${t("reports.charts.vsLastPeriodSuffix", "vs previous period")}`,
              }
            : undefined
        }
      />
      <BarChartCard
        name="topCategories"
        registerChart={registerChart}
        title={t("reports.charts.topCategories", "Most-borrowed categories")}
        data={categoriesData}
        xKey="name"
        layout="vertical"
        bars={[
          {
            dataKey: "value",
            fill: "var(--color-accent)",
            barSize: 18,
            radius: [0, 6, 6, 0],
          },
        ]}
      />
      <PieChartCard
        name="statusDistribution"
        registerChart={registerChart}
        title={t(
          "reports.charts.statusDistribution",
          "Loan status distribution",
        )}
        colors={PIE_COLORS.slice(0, 3)}
        data={[
          {
            name: t("reports.statusLabels.returned", "Returned"),
            value: loanCounts.total - loanCounts.open,
          },
          {
            name: t("reports.statusLabels.openActive", "Open & active"),
            value: loanCounts.open - loanCounts.overdue,
          },
          {
            name: t("reports.statusLabels.overdue", "Overdue"),
            value: loanCounts.overdue,
          },
        ]}
      />
      <BarChartCard
        name="hourlyRhythm"
        registerChart={registerChart}
        title={t("reports.charts.hourlyRhythm", "Today's hourly rhythm")}
        secondaryBadge={t(
          "reports.charts.checkoutsVsReturns",
          "Checkouts vs returns",
        )}
        data={rhythm}
        xKey="time"
        bars={[
          {
            dataKey: "checkouts",
            name: t("dashboard.checkouts", "Checkouts"),
            fill: "var(--color-accent)",
            barSize: 14,
          },
          {
            dataKey: "returns",
            name: t("dashboard.returns", "Returns"),
            fill: "#c06b3e",
            barSize: 14,
          },
        ]}
      />
    </>
  );
}

/** Circulation tab: peak hours, media types, loan states, daily pace. */
export function CirculationCharts({
  trendData,
  rhythm,
  itemTypesData,
  loanCounts,
  registerChart,
}: {
  trendData: TrendPoint[];
  rhythm: Rhythm[];
  itemTypesData: Datum[];
  loanCounts: LoanCounts;
  registerChart: ChartRefs;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SingleBarChart
        name="peakHours"
        registerChart={registerChart}
        title={t("reports.charts.peakHours", "Peak hours")}
        data={rhythm}
        dataKey="checkouts"
        fill="var(--color-accent)"
        barSize={22}
        xKey="time"
      />
      <SingleBarChart
        name="mediaTypeDist"
        registerChart={registerChart}
        title={t("reports.charts.mediaTypeDist", "Loans by media type")}
        data={itemTypesData}
        dataKey="value"
        fill="#c06b3e"
        barSize={28}
        xKey="name"
      />
      <BarChartCard
        name="fulfillmentStatus"
        registerChart={registerChart}
        title={t("reports.charts.fulfillmentStatus", "Loan states")}
        data={[
          {
            name: t("reports.statusLabels.openActive", "Open & active"),
            value: loanCounts.open - loanCounts.overdue,
          },
          {
            name: t("reports.statusLabels.overdue", "Overdue"),
            value: loanCounts.overdue,
          },
          {
            name: t("reports.statusLabels.returned", "Returned"),
            value: loanCounts.total - loanCounts.open,
          },
        ]}
        xKey="name"
        bars={[
          {
            dataKey: "value",
            fill: "var(--color-accent)",
            barSize: 30,
          },
        ]}
      />
      <AreaChartCard
        name="dailyPace"
        registerChart={registerChart}
        title={t("reports.charts.dailyPace", "Daily pace")}
        data={trendData}
        xKey="name"
        seriesKey="circulation"
        color="#0f6e9c"
        gradientId="gradDaily"
      />
    </>
  );
}
