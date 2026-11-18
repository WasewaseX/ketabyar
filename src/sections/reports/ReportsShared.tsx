import type { TFunction } from "i18next";
import { TrendingDown, TrendingUp } from "lucide-react";
import type { ReactElement, Ref, RefObject } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { captureChart, waitForChartsToSettle } from "../../utils/chartCapture";
import { cn } from "../../utils/cn";
import { exportCsvZip } from "../../utils/exportFile";
import { generateReportsPdf } from "../../utils/reportsPdf";

/**
 * Reports screen chrome shared by the page and its tab chart components:
 * the chart card, axis/tooltip/grid constants, the pie palette, the tab
 * registry and the CSV/ZIP + PDF export builders.
 */

export type TabId = "overview" | "circulation" | "inventory" | "members";

export type LoanCounts = { total: number; open: number; overdue: number };

export const TAB_CHARTS: Record<TabId, string[]> = {
  overview: [
    "circulationTrend",
    "topCategories",
    "statusDistribution",
    "hourlyRhythm",
  ],
  circulation: ["peakHours", "mediaTypeDist", "fulfillmentStatus", "dailyPace"],
  inventory: [
    "copyStatusDist",
    "conditionHealth",
    "categoryShare",
    "formatHoldingsCount",
  ],
  members: ["membersByRole", "activeDepts", "memberStatus", "memberJoins"],
};

const tooltipStyle = {
  background: "#17211f",
  color: "#ffffff",
  borderRadius: 12,
  fontSize: 12,
} as const;

export const AXIS_TICK = {
  fontSize: 11,
  fill: "currentColor",
  opacity: 0.6,
} as const;

export const CHART_GRID: ReactElement = (
  <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
);
export const CHART_TOOLTIP: ReactElement = (
  <Tooltip contentStyle={tooltipStyle} />
);

export const PIE_COLORS = [
  "#1a4d40",
  "#c06b3e",
  "#2f5d8a",
  "#6d3fa8",
  "#0f6e9c",
  "#d98d5f",
  "#1b9277",
  "#b23244",
];

/** Buckets raw row labels and sorts them by count — feeds most charts. */
export function countBy(
  values: string[],
  fallback: string,
): { name: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (const raw of values) {
    const trimmed = raw?.trim();
    const key = trimmed === undefined || trimmed === "" ? fallback : trimmed;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

type Translate = TFunction<"translation", undefined>;

export const reportStatusLabel = (t: Translate, value: string) =>
  t(`reports.statusLabels.${value.replace("-", "")}`, value);
export const reportConditionLabel = (t: Translate, value: string) =>
  t(`catalog.condition.${value}`, value);
export const reportRoleLabel = (t: Translate, value: string) =>
  t(`members.roles.${value}`, value);
export const reportMemberStatusLabel = (t: Translate, value: string) =>
  ({
    active: t("reports.statusLabels.memberActive", "Active"),
    expired: t("reports.statusLabels.memberExpired", "Expired"),
    suspended: t("reports.statusLabels.memberSuspended", "Suspended"),
    archived: t("reports.statusLabels.memberSuspended", "Archived"),
  })[value] ?? value;

export function ChartWidget({
  title,
  ref,
  badge,
  secondaryBadge,
  children,
}: {
  title: string;
  ref?: Ref<HTMLDivElement | null>;
  badge?: { positive: boolean; text: string };
  secondaryBadge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-bold">{title}</p>
        <div className="flex items-center gap-1.5">
          {badge ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
                badge.positive
                  ? "bg-accent/10 text-accent dark:text-accent-dark"
                  : "bg-red-600/10 text-red-600",
              )}
            >
              {badge.positive ? (
                <TrendingUp size={10} />
              ) : (
                <TrendingDown size={10} />
              )}
              {badge.text}
            </span>
          ) : null}
          {secondaryBadge ? (
            <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-bold text-ink/60 dark:bg-white/8 dark:text-ivory/60">
              {secondaryBadge}
            </span>
          ) : null}
        </div>
      </div>
      <div ref={ref}>{children}</div>
    </div>
  );
}

type ReportDatum = { name: string; value: number };

/** Build the multi-sheet CSV/ZIP export from the report data sets. */
export function buildReportZip(data: {
  t: Translate;
  kpis: { label: string; value: string | number }[];
  trendData: { name: string; circulation: number }[];
  categoriesData: ReportDatum[];
  copyStatusData: { label: string; n: number }[];
  conditionsData: { label: string; n: number }[];
  itemTypesData: ReportDatum[];
  rolesData: ReportDatum[];
  memberStatusData: ReportDatum[];
  memberJoinsData: { name: string; joins: number }[];
  rhythm: { time: string; checkouts: number; returns: number }[];
}): void {
  const { t } = data;
  const stamp = new Date().toISOString().slice(0, 10);
  void exportCsvZip(
    `ketabyar-library-report-${stamp}.zip`,
    [
      {
        name: "summary.csv",
        columns: ["Metric", "Value"],
        rows: data.kpis.map((kpi) => [kpi.label, kpi.value]),
      },
      {
        name: "circulation-trend.csv",
        columns: [
          t("reports.columns.day", "Day"),
          t("reports.columns.circulation", "Circulation"),
        ],
        rows: data.trendData.map((point) => [point.name, point.circulation]),
      },
      {
        name: "top-categories.csv",
        columns: [
          t("reports.columns.category", "Category"),
          t("reports.columns.loans", "Loans"),
        ],
        rows: data.categoriesData.map((row) => [row.name, row.value]),
      },
      {
        name: "copy-status.csv",
        columns: [
          t("reports.columns.status", "Status"),
          t("reports.columns.count", "Count"),
        ],
        rows: data.copyStatusData.map((row) => [
          reportStatusLabel(t, row.label),
          row.n,
        ]),
      },
      {
        name: "condition-health.csv",
        columns: [
          t("reports.columns.condition", "Condition"),
          t("reports.columns.copies", "Copies"),
        ],
        rows: data.conditionsData.map((row) => [
          reportConditionLabel(t, row.label),
          row.n,
        ]),
      },
      {
        name: "media-types.csv",
        columns: [
          t("reports.columns.type", "Type"),
          t("reports.columns.count", "Count"),
        ],
        rows: data.itemTypesData.map((row) => [row.name, row.value]),
      },
      {
        name: "members-by-role.csv",
        columns: [
          t("reports.columns.role", "Role"),
          t("reports.columns.count", "Count"),
        ],
        rows: data.rolesData.map((row) => [
          reportRoleLabel(t, row.name),
          row.value,
        ]),
      },
      {
        name: "member-status.csv",
        columns: [
          t("reports.columns.status", "Status"),
          t("reports.columns.count", "Count"),
        ],
        rows: data.memberStatusData.map((row) => [
          reportMemberStatusLabel(t, row.name),
          row.value,
        ]),
      },
      {
        name: "new-members-over-time.csv",
        columns: [
          t("reports.columns.month", "Month"),
          t("reports.columns.count", "Count"),
        ],
        rows: data.memberJoinsData.map((row) => [row.name, row.joins]),
      },
      {
        name: "peak-circulation-hours.csv",
        columns: [
          t("reports.columns.time", "Time"),
          t("reports.columns.checkouts", "Checkouts"),
          t("reports.columns.returns", "Returns"),
        ],
        rows: data.rhythm.map((slot) => [
          slot.time,
          slot.checkouts,
          slot.returns,
        ]),
      },
    ],
    t("reports.csvExportedNamed", "Report exported: {{filename}}", {
      filename: `ketabyar-library-report-${stamp}.zip`,
    }),
    t("common.openFolder", "Open folder"),
  );
}

/** Cycle through every tab, capture each chart, and build the PDF report. */
export async function runReportsPdfExport(opts: {
  setActiveTab: (tab: TabId) => void;
  chartRefs: RefObject<Record<string, HTMLDivElement | null>>;
  libraryName: string;
  librarySubtitle: string;
  locale: string;
  rangeLabel: string;
  kpis: { label: string; value: string | number; sub: string }[];
  t: Translate;
}): Promise<void> {
  const { setActiveTab, chartRefs, t } = opts;
  const toastId = toast.loading(
    t("reports.generatingPdf", "Building the PDF report…"),
  );
  try {
    const charts: {
      title: string;
      dataUrl: string;
      width: number;
      height: number;
    }[] = [];
    for (const tab of Object.keys(TAB_CHARTS) as TabId[]) {
      setActiveTab(tab);
      await waitForChartsToSettle();
      for (const key of TAB_CHARTS[tab]) {
        const captured = await captureChart(chartRefs.current[key]);
        if (captured) {
          charts.push({
            title: t(`reports.charts.${key}`, key),
            ...captured,
          });
        }
      }
    }

    const sections = (Object.keys(TAB_CHARTS) as TabId[]).map((tab) => ({
      id: tab,
      title: t(`reports.tabs.${tab}`, tab),
      subtitle: t(
        `reports.sectionSubtitles.${tab === "overview" ? "circulation" : tab}`,
        "",
      ),
      charts: charts.filter((chart) =>
        TAB_CHARTS[tab].some(
          (key) => chart.title === t(`reports.charts.${key}`, key),
        ),
      ),
      tables: [],
    }));

    await generateReportsPdf({
      libraryName: opts.libraryName,
      librarySubtitle: opts.librarySubtitle,
      generatedAt: new Date(),
      rangeLabel: opts.rangeLabel,
      locale: opts.locale,
      kpis: opts.kpis.map((kpi) => ({
        label: kpi.label,
        value: String(kpi.value),
        sub: kpi.sub,
      })),
      sections,
    });
    toast.success(t("reports.pdfExported", "PDF report is ready"), {
      id: toastId,
      duration: 8000,
    });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error), {
      id: toastId,
    });
  }
}

type ChartName = string;
type Register = (key: string, element: HTMLDivElement | null) => void;

/** One bar series inside a BarChartCard. */
export type BarSeries = {
  dataKey: string;
  name?: string;
  fill: string;
  barSize: number;
  radius?: [number, number, number, number];
};

/** Data-driven bar chart card (horizontal via layout="vertical"). */
export function BarChartCard({
  name,
  registerChart,
  title,
  data,
  xKey,
  layout,
  bars,
  yWidth,
  badge,
  secondaryBadge,
}: {
  name: ChartName;
  registerChart: Register;
  title: string;
  data: unknown[];
  xKey: string;
  layout?: "vertical" | "horizontal";
  bars: BarSeries[];
  yWidth?: number;
  badge?: { positive: boolean; text: string };
  secondaryBadge?: string;
}) {
  const vertical = layout === "vertical";
  return (
    <ChartWidget
      ref={(element) => registerChart(name, element)}
      title={title}
      badge={badge}
      secondaryBadge={secondaryBadge}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} layout={layout}>
          {vertical ? <XAxis type="number" hide /> : CHART_GRID}
          {vertical ? (
            <YAxis
              type="category"
              dataKey={xKey}
              width={yWidth ?? 120}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
          ) : (
            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
          )}
          {CHART_TOOLTIP}
          {bars.map((bar) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.fill}
              radius={bar.radius ?? [6, 6, 0, 0]}
              barSize={bar.barSize}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartWidget>
  );
}

/** Data-driven area chart card with a vertical fade gradient. */
export function AreaChartCard({
  name,
  registerChart,
  title,
  data,
  xKey,
  seriesKey,
  color,
  gradientId,
  badge,
  tickFontSize,
}: {
  name: ChartName;
  registerChart: Register;
  title: string;
  data: unknown[];
  xKey: string;
  seriesKey: string;
  color: string;
  gradientId: string;
  badge?: { positive: boolean; text: string };
  tickFontSize?: number;
}) {
  return (
    <ChartWidget
      ref={(element) => registerChart(name, element)}
      title={title}
      badge={badge}
    >
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey={xKey}
            tick={{
              fontSize: tickFontSize ?? 11,
              fill: "currentColor",
              opacity: 0.6,
            }}
            axisLine={false}
            tickLine={false}
          />
          {CHART_TOOLTIP}
          <Area
            type="monotone"
            dataKey={seriesKey}
            stroke={color}
            strokeWidth={2.5}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartWidget>
  );
}

/** Data-driven donut chart card with legend. */
export function PieChartCard({
  name,
  registerChart,
  title,
  data,
  colors,
}: {
  name: ChartName;
  registerChart: Register;
  title: string;
  data: { name: string; value: number }[];
  colors?: string[];
}) {
  const palette = colors ?? PIE_COLORS;
  return (
    <ChartWidget ref={(element) => registerChart(name, element)} title={title}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            innerRadius={45}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
          >
            {data.map((_entry, index) => (
              <Cell
                key={index}
                fill={palette[index % palette.length]}
                stroke="none"
              />
            ))}
          </Pie>
          <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          {CHART_TOOLTIP}
        </PieChart>
      </ResponsiveContainer>
    </ChartWidget>
  );
}

/** One-series bar chart: the standard bars array assembled for you. */
export function SingleBarChart({
  name,
  registerChart,
  title,
  data,
  dataKey = "value",
  fill = "#c06b3e",
  barSize = 26,
  radius,
  xKey = "name",
  layout,
}: {
  name: ChartName;
  registerChart: Register;
  title: string;
  data: { name: string; value: number }[] | { name: string; count: number }[];
  dataKey?: string;
  fill?: string;
  barSize?: number;
  radius?: [number, number, number, number];
  xKey?: string;
  layout?: "vertical";
}) {
  return (
    <BarChartCard
      name={name}
      registerChart={registerChart}
      title={title}
      data={data}
      xKey={xKey}
      layout={layout}
      bars={[{ dataKey, fill, barSize, radius }]}
    />
  );
}

/** Map label/value rows into chart datum with a label formatter. */
export function labelledData<Row>(
  rows: Row[],
  label: (row: Row) => string,
): { name: string; value: number }[] {
  return rows.map((row) => ({
    name: label(row),
    value:
      (row as { value?: number; n?: number }).value ??
      (row as { n?: number }).n ??
      0,
  }));
}
