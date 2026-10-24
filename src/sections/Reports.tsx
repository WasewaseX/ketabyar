import { useQuery } from "../hooks/useLibraryQuery";
import {
  BarChart3, BookOpen, CheckCircle2, Copy, Download, Info, Printer, RefreshCw, TrendingDown, TrendingUp,
} from "lucide-react";
import { useMemo, useRef, useState, type RefObject } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dashboard, loans, reportBreakdowns } from "../data/repositories/library";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { captureChart, waitForChartsToSettle } from "../utils/chartCapture";
import { exportCsvZip } from "../utils/exportFile";
import { generateReportsPdf } from "../utils/reportsPdf";
import { daysLate } from "../utils/dates";
import { cn } from "../utils/cn";

/**
 * Analytics: 4 tabs × 4 charts, a KPI strip, CSV (ZIP) export and a printed
 * PDF report. Only the active tab's charts are mounted; the PDF exporter
 * cycles through all tabs, captures each, then restores the original tab.
 */

type TabId = "overview" | "circulation" | "inventory" | "members";

const PIE_COLORS = ["#1a4d40", "#c06b3e", "#2f5d8a", "#6d3fa8", "#0f6e9c", "#d98d5f", "#1b9277", "#b23244"];

function countBy(values: (string | null | undefined)[], fallback: string): { name: string; value: number }[] {
  const buckets = new Map<string, number>();
  for (const raw of values) {
    const key = raw?.trim() || fallback;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

const tooltipStyle = { background: "#17211f", color: "#ffffff", borderRadius: 12, fontSize: 12 } as const;

export function ReportsPage() {
  const { t } = useTranslation();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const locale = useUiStore((state) => state.preferences.locale);

  const dashQuery = useQuery({ queryKey: ["dashboard-reports"], queryFn: dashboard });
  const loansQuery = useQuery({ queryKey: ["loans-reports"], queryFn: () => loans(false) });

  // All GROUP BY aggregates arrive in one repository round-trip.
  const breakdownsQuery = useQuery({ queryKey: ["report-breakdowns"], queryFn: reportBreakdowns });
  const bd = breakdownsQuery.data;

  const categoriesData = useMemo(
    () => countBy((bd?.loanCategories ?? []).map((row) => row.label), t("catalog.uncategorized", "Uncategorized")).slice(0, 6),
    [bd, t],
  );
  const conditionsData = bd?.copyConditions ?? [];
  const rolesData = useMemo(
    () => countBy((bd?.memberRoles ?? []).map((row) => row.label), t("members.roles.other", "Member")),
    [bd, t],
  );
  const copyStatusData = bd?.copyStatuses ?? [];
  const itemTypesData = useMemo(() => countBy((bd?.itemTypes ?? []).map((row) => row.label), "book"), [bd]);
  const inventoryCategoriesData = useMemo(
    () => countBy((bd?.inventoryCategories ?? []).map((row) => row.label), t("catalog.uncategorized", "Uncategorized")).slice(0, 6),
    [bd, t],
  );
  const memberStatusData = useMemo(() => countBy((bd?.memberStatuses ?? []).map((row) => row.label), "active"), [bd]);
  const memberJoinsData = (bd?.memberJoins ?? []).slice(-12).map((row) => ({ name: row.label, joins: row.n }));

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [range, setRange] = useState<"7d" | "30d" | "1y" | "all">("30d");
  const [pdfExporting, setPdfExporting] = useState(false);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const allLoans = loansQuery.data ?? [];
  const openLoans = allLoans.filter((loan) => !loan.returned_at);
  const overdueOpen = openLoans.filter((loan) => daysLate(loan.due_at) > 0);
  const overdueRate = openLoans.length > 0 ? ((overdueOpen.length / openLoans.length) * 100).toFixed(1) + "%" : "0.0%";

  const trendData = useMemo(() => {
    const weekdayTag = locale === "fa" ? "fa-IR" : locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-US";
    return (dashQuery.data?.activity ?? []).map((point) => ({
      name: new Intl.DateTimeFormat(weekdayTag, { weekday: "short" }).format(new Date(point.date)),
      circulation: point.count,
    }));
  }, [dashQuery.data, locale]);

  const trendBadge = useMemo(() => {
    if (trendData.length < 4) return null;
    const half = Math.floor(trendData.length / 2);
    const first = trendData.slice(0, half).reduce((sum, point) => sum + point.circulation, 0);
    const second = trendData.slice(half).reduce((sum, point) => sum + point.circulation, 0);
    if (first === 0) return second > 0 ? "+100%" : null;
    const delta = Math.round(((second - first) / first) * 100);
    return (delta >= 0 ? "+" : "") + delta + "%";
  }, [trendData]);

  const rhythm = dashQuery.data?.circulationRhythm ?? [];
  const statusLabel = (value: string) => t(`reports.statusLabels.${value.replace("-", "")}`, value);
  const conditionLabel = (value: string) => t(`catalog.condition.${value}`, value);
  const roleLabel = (value: string) => t(`members.roles.${value}`, value);
  const memberStatusLabel = (value: string) =>
    ({ active: t("reports.statusLabels.memberActive", "Active"), expired: t("reports.statusLabels.memberExpired", "Expired"), suspended: t("reports.statusLabels.memberSuspended", "Suspended"), archived: t("reports.statusLabels.memberSuspended", "Archived") })[value] ?? value;

  const kpis = [
    { icon: BookOpen, label: t("reports.metrics.totalCheckouts", "Total checkouts"), sub: t("reports.metrics.totalCheckoutsSub", "all-time loans"), value: allLoans.length },
    { icon: CheckCircle2, label: t("reports.metrics.activeBorrowers", "Active borrowers"), sub: t("reports.metrics.activeBorrowersSub", "current members"), value: dashQuery.data?.members ?? 0 },
    { icon: TrendingUp, label: t("reports.metrics.overdueRate", "Overdue rate"), sub: t("reports.metrics.overdueRateSub", "of open loans"), value: overdueRate },
    { icon: BarChart3, label: t("reports.metrics.physicalHoldings", "Physical holdings"), sub: t("reports.metrics.physicalHoldingsSub", "copies on record"), value: dashQuery.data?.copies ?? 0 },
  ];

  const TAB_CHARTS: Record<TabId, string[]> = {
    overview: ["circulationTrend", "topCategories", "statusDistribution", "hourlyRhythm"],
    circulation: ["peakHours", "mediaTypeDist", "fulfillmentStatus", "dailyPace"],
    inventory: ["copyStatusDist", "conditionHealth", "categoryShare", "formatHoldingsCount"],
    members: ["membersByRole", "activeDepts", "memberStatus", "memberJoins"],
  };

  const rangeLabels: Record<typeof range, string> = {
    "7d": t("reports.ranges.7d", "Last 7 days"),
    "30d": t("reports.ranges.30d", "Last 30 days"),
    "1y": t("reports.ranges.1y", "Last year"),
    all: t("reports.ranges.all", "All time"),
  };

  const exportZip = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    void exportCsvZip(
      `ketabyar-library-report-${stamp}.zip`,
      [
        { name: "summary.csv", columns: ["Metric", "Value"], rows: kpis.map((kpi) => [kpi.label, kpi.value]) },
        { name: "circulation-trend.csv", columns: [t("reports.columns.day", "Day"), t("reports.columns.circulation", "Circulation")], rows: trendData.map((point) => [point.name, point.circulation]) },
        { name: "top-categories.csv", columns: [t("reports.columns.category", "Category"), t("reports.columns.loans", "Loans")], rows: categoriesData.map((row) => [row.name, row.value]) },
        { name: "copy-status.csv", columns: [t("reports.columns.status", "Status"), t("reports.columns.count", "Count")], rows: copyStatusData.map((row) => [statusLabel(row.label), row.n]) },
        { name: "condition-health.csv", columns: [t("reports.columns.condition", "Condition"), t("reports.columns.copies", "Copies")], rows: conditionsData.map((row) => [conditionLabel(row.label), row.n]) },
        { name: "media-types.csv", columns: [t("reports.columns.type", "Type"), t("reports.columns.count", "Count")], rows: itemTypesData.map((row) => [row.name, row.value]) },
        { name: "members-by-role.csv", columns: [t("reports.columns.role", "Role"), t("reports.columns.count", "Count")], rows: rolesData.map((row) => [roleLabel(row.name), row.value]) },
        { name: "member-status.csv", columns: [t("reports.columns.status", "Status"), t("reports.columns.count", "Count")], rows: memberStatusData.map((row) => [memberStatusLabel(row.name), row.value]) },
        { name: "new-members-over-time.csv", columns: [t("reports.columns.month", "Month"), t("reports.columns.count", "Count")], rows: memberJoinsData.map((row) => [row.name, row.joins]) },
        { name: "peak-circulation-hours.csv", columns: [t("reports.columns.time", "Time"), t("reports.columns.checkouts", "Checkouts"), t("reports.columns.returns", "Returns")], rows: rhythm.map((slot) => [slot.time, slot.checkouts, slot.returns]) },
      ],
      t("reports.csvExportedNamed", "Report exported: {{filename}}", { filename: `ketabyar-library-report-${stamp}.zip` }),
      t("common.openFolder", "Open folder"),
    );
  };

  const exportPdf = async () => {
    if (pdfExporting) return;
    setPdfExporting(true);
    const toastId = toast.loading(t("reports.generatingPdf", "Building the PDF report…"));
    const originalTab = activeTab;
    try {
      const charts: { title: string; dataUrl: string; width: number; height: number }[] = [];
      for (const tab of Object.keys(TAB_CHARTS) as TabId[]) {
        setActiveTab(tab);
        await waitForChartsToSettle();
        for (const key of TAB_CHARTS[tab]) {
          const captured = await captureChart(chartRefs.current[key]);
          if (captured) {
            charts.push({ title: t(`reports.charts.${key}`, key), ...captured });
          }
        }
      }
      setActiveTab(originalTab);

      const sections = (Object.keys(TAB_CHARTS) as TabId[]).map((tab) => ({
        id: tab,
        title: t(`reports.tabs.${tab}`, tab),
        subtitle: t(`reports.sectionSubtitles.${tab === "overview" ? "circulation" : tab}`, ""),
        charts: charts.filter((chart) => TAB_CHARTS[tab].some((key) => chart.title === t(`reports.charts.${key}`, key))),
        tables: [],
      }));

      await generateReportsPdf({
        libraryName: settings.library_name || "KetabYar Library",
        librarySubtitle: settings.library_description || "Library Analytics & Reports",
        generatedAt: new Date(),
        rangeLabel: rangeLabels[range],
        locale,
        kpis: kpis.map((kpi) => ({ label: kpi.label, value: String(kpi.value), sub: kpi.sub })),
        sections,
      });
      toast.success(t("reports.pdfExported", "PDF report is ready"), { id: toastId, duration: 8000 });
    } catch (error) {
      setActiveTab(originalTab);
      toast.error(error instanceof Error ? error.message : String(error), { id: toastId });
    } finally {
      setPdfExporting(false);
    }
  };

  const loading = dashQuery.isLoading || loansQuery.isLoading;

  return (
    <div
      onContextMenu={(event) =>
        showContextMenu(event, [
          { id: "refresh", label: t("reports.refreshReports", "Refresh reports"), icon: RefreshCw, onClick: () => { void dashQuery.refetch(); void loansQuery.refetch(); void breakdownsQuery.refetch(); toast.success(t("reports.refreshed", "Reports refreshed")); } },
          { id: "pdf", label: t("reports.printReport", "Export PDF report"), icon: Printer, onClick: () => void exportPdf() },
          { id: "summary", label: t("reports.copySummary", "Copy stat summary"), icon: Copy, onClick: () => { void navigator.clipboard.writeText(`KetabYar Library Reports Summary:\nTitles: ${dashQuery.data?.titles ?? 0}\nCopies: ${dashQuery.data?.copies ?? 0}\nTotal Loans: ${allLoans.length}\nActive Members: ${dashQuery.data?.members ?? 0}\nOverdue Rate: ${overdueRate}`); toast.success(t("reports.copiedSummary", "Summary copied to clipboard")); } },
        ], { title: t("reports.title", "Reports") })
      }
    >
      <PageTitle
        title={t("reports.title", "Reports")}
        detail={t("reports.subtitle", "How the collection and its circulation behave.")}
        action={
          <>
            <button onClick={exportZip} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/10 dark:bg-white/5 dark:hover:bg-white/10">
              <Download size={15} />
              {t("reports.exportCsvZip", "Export CSVs (ZIP)")}
            </button>
            <button
              onClick={() => void exportPdf()}
              disabled={pdfExporting}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark"
            >
              <Printer size={15} />
              {t("reports.print", "Export PDF")}
            </button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TAB_CHARTS) as TabId[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "rounded-full px-4 py-1.5 text-sm font-semibold transition",
                activeTab === tab ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
              )}
            >
              {t(`reports.tabs.${tab}`, tab)}
            </button>
          ))}
        </div>
        <select className="field-select max-w-40" value={range} onChange={(event) => setRange(event.target.value as typeof range)}>
          <option value="7d">{rangeLabels["7d"]}</option>
          <option value="30d">{rangeLabels["30d"]}</option>
          <option value="1y">{rangeLabels["1y"]}</option>
          <option value="all">{rangeLabels.all}</option>
        </select>
      </div>

      {loading ? (
        <PageLoader label={t("reports.loading", "Crunching the numbers…")} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="rounded-[var(--radius-card)] border border-ink/8 bg-white p-4 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
                <div className="flex items-center gap-2 text-ink/55 dark:text-ivory/55">
                  <kpi.icon size={15} />
                  <p className="text-xs font-semibold">{kpi.label}</p>
                </div>
                <p className="mt-2 font-display text-2xl font-bold tabular-nums">
                  {typeof kpi.value === "number" ? kpi.value.toLocaleString(locale === "fa" ? "fa-IR" : "en-US") : kpi.value}
                </p>
                <p className="text-[11px] text-ink/45 dark:text-ivory/45">{kpi.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {activeTab === "overview" ? (
              <>
                <ChartWidget
                  refKey="circulationTrend" title={t("reports.charts.circulationTrend", "Circulation trend")} refs={chartRefs}
                  badge={trendBadge ? { positive: !trendBadge.startsWith("-"), text: `${trendBadge} ${t("reports.charts.vsLastPeriodSuffix", "vs previous period")}` } : undefined}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="gradCirculation" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="circulation" stroke="var(--color-accent)" strokeWidth={2.5} fill="url(#gradCirculation)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="topCategories" title={t("reports.charts.topCategories", "Most-borrowed categories")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={categoriesData} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.7 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="var(--color-accent)" radius={[0, 6, 6, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="statusDistribution" title={t("reports.charts.statusDistribution", "Loan status distribution")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: t("reports.statusLabels.returned", "Returned"), value: allLoans.length - openLoans.length },
                          { name: t("reports.statusLabels.openActive", "Open & active"), value: openLoans.length - overdueOpen.length },
                          { name: t("reports.statusLabels.overdue", "Overdue"), value: overdueOpen.length },
                        ]}
                        innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="value" nameKey="name"
                      >
                        {PIE_COLORS.slice(0, 3).map((color, index) => <Cell key={index} fill={color} stroke="none" />)}
                      </Pie>
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="hourlyRhythm" title={t("reports.charts.hourlyRhythm", "Today's hourly rhythm")} refs={chartRefs} secondaryBadge={t("reports.charts.checkoutsVsReturns", "Checkouts vs returns")}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={rhythm}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="checkouts" name={t("dashboard.checkouts", "Checkouts")} fill="var(--color-accent)" radius={[6, 6, 0, 0]} barSize={14} />
                      <Bar dataKey="returns" name={t("dashboard.returns", "Returns")} fill="#c06b3e" radius={[6, 6, 0, 0]} barSize={14} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>
              </>
            ) : null}

            {activeTab === "circulation" ? (
              <>
                <ChartWidget refKey="peakHours" title={t("reports.charts.peakHours", "Peak hours")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={rhythm}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                      <XAxis dataKey="time" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="checkouts" fill="var(--color-accent)" radius={[6, 6, 0, 0]} barSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="mediaTypeDist" title={t("reports.charts.mediaTypeDist", "Loans by media type")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={itemTypesData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="#c06b3e" radius={[6, 6, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="fulfillmentStatus" title={t("reports.charts.fulfillmentStatus", "Loan states")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={[
                        { name: t("reports.statusLabels.openActive", "Open & active"), value: openLoans.length - overdueOpen.length },
                        { name: t("reports.statusLabels.overdue", "Overdue"), value: overdueOpen.length },
                        { name: t("reports.statusLabels.returned", "Returned"), value: allLoans.length - openLoans.length },
                      ]}
                    >
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="var(--color-accent)" radius={[6, 6, 0, 0]} barSize={30} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="dailyPace" title={t("reports.charts.dailyPace", "Daily pace")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="gradDaily" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0f6e9c" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#0f6e9c" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="circulation" stroke="#0f6e9c" strokeWidth={2.5} fill="url(#gradDaily)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartWidget>
              </>
            ) : null}

            {activeTab === "inventory" ? (
              <>
                <ChartWidget refKey="copyStatusDist" title={t("reports.charts.copyStatusDist", "Copy status distribution")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={copyStatusData.map((row) => ({ name: statusLabel(row.label), value: row.n }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="var(--color-accent)" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="conditionHealth" title={t("reports.charts.conditionHealth", "Condition health")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={conditionsData.map((row) => ({ name: conditionLabel(row.label), value: row.n }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="#c06b3e" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="categoryShare" title={t("reports.charts.categoryShare", "Inventory by category")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={inventoryCategoriesData} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.7 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="#2f5d8a" radius={[0, 6, 6, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="formatHoldingsCount" title={t("reports.charts.formatHoldingsCount", "Holdings by format")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={itemTypesData}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="#6d3fa8" radius={[6, 6, 0, 0]} barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>
              </>
            ) : null}

            {activeTab === "members" ? (
              <>
                <ChartWidget refKey="membersByRole" title={t("reports.charts.membersByRole", "Members by role")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={(rolesData).map((row) => ({ name: roleLabel(row.name), value: row.value }))}>
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" fill="var(--color-accent)" radius={[6, 6, 0, 0]} barSize={26} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="activeDepts" title={t("reports.charts.activeDepts", "Most active departments")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={(dashQuery.data?.activeDepartments ?? []).slice(0, 6)} layout="vertical">
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "currentColor", opacity: 0.7 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill="#c06b3e" radius={[0, 6, 6, 0]} barSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="memberStatus" title={t("reports.charts.memberStatus", "Member status")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={memberStatusData.map((row) => ({ name: memberStatusLabel(row.name), value: row.value }))} innerRadius={45} outerRadius={80} paddingAngle={2} dataKey="value" nameKey="name">
                        {memberStatusData.map((_entry, index) => <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartWidget>

                <ChartWidget refKey="memberJoins" title={t("reports.charts.memberJoins", "New members over time")} refs={chartRefs}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={memberJoinsData}>
                      <defs>
                        <linearGradient id="gradJoins" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1b9277" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="#1b9277" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "currentColor", opacity: 0.6 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="joins" stroke="#1b9277" strokeWidth={2.5} fill="url(#gradJoins)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartWidget>
              </>
            ) : null}

            <div className="md:col-span-2">
              <p className="flex items-center gap-2 text-xs text-ink/45 dark:text-ivory/45">
                <Info size={13} />
                {t("reports.emptyChartNote", "Charts with no data stay empty — KetabYar never invents numbers.")}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ChartWidget({
  refKey, title, refs, badge, secondaryBadge, children,
}: {
  refKey: string;
  title: string;
  refs: RefObject<Record<string, HTMLDivElement | null>>;
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
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold", badge.positive ? "bg-accent/10 text-accent dark:text-accent-dark" : "bg-red-600/10 text-red-600")}>
              {badge.positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              {badge.text}
            </span>
          ) : null}
          {secondaryBadge ? <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-bold text-ink/60 dark:bg-white/8 dark:text-ivory/60">{secondaryBadge}</span> : null}
        </div>
      </div>
      <div ref={(element) => { refs.current[refKey] = element; }}>{children}</div>
    </div>
  );
}
