import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Info,
  Printer,
  RefreshCw,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import {
  dashboard,
  loans,
  reportBreakdowns,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import type { Loan } from "../types";
import { cn } from "../utils/cn";
import { daysLate } from "../utils/dates";
import {
  InventoryCharts,
  MembersCharts,
} from "./reports/InventoryMembersCharts";
import {
  CirculationCharts,
  OverviewCharts,
} from "./reports/OverviewCirculationCharts";
import {
  buildReportZip,
  countBy,
  runReportsPdfExport,
  TAB_CHARTS,
  type TabId,
} from "./reports/ReportsShared";

/** Stable empty array — keeps hook deps from changing every render. */
const EMPTY_LOANS: Loan[] = [];

/**
 * Analytics: 4 tabs × 4 charts, a KPI strip, CSV (ZIP) export and a printed
 * PDF report. The chart panels live in ./reports/*; this page owns the
 * queries, the derived data sets and the exporters.
 */
export function ReportsPage() {
  const { t } = useTranslation();
  const { showContextMenu } = useContextMenu();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const locale = useUiStore((state) => state.preferences.locale);

  const dashQuery = useQuery({
    queryKey: ["dashboard-reports"],
    queryFn: dashboard,
  });
  const loansQuery = useQuery({
    queryKey: ["loans-reports"],
    queryFn: () => loans(false),
  });

  // All GROUP BY aggregates arrive in one repository round-trip.
  const breakdownsQuery = useQuery({
    queryKey: ["report-breakdowns"],
    queryFn: reportBreakdowns,
  });
  const bd = breakdownsQuery.data;

  const categoriesData = useMemo(
    () =>
      countBy(
        (bd?.loanCategories ?? []).map((row) => row.label),
        t("catalog.uncategorized", "Uncategorized"),
      ).slice(0, 6),
    [bd, t],
  );
  const conditionsData = bd?.copyConditions ?? [];
  const rolesData = useMemo(
    () =>
      countBy(
        (bd?.memberRoles ?? []).map((row) => row.label),
        t("members.roles.other", "Member"),
      ),
    [bd, t],
  );
  const copyStatusData = bd?.copyStatuses ?? [];
  const itemTypesData = useMemo(
    () =>
      countBy(
        (bd?.itemTypes ?? []).map((row) => row.label),
        "book",
      ),
    [bd],
  );
  const inventoryCategoriesData = useMemo(
    () =>
      countBy(
        (bd?.inventoryCategories ?? []).map((row) => row.label),
        t("catalog.uncategorized", "Uncategorized"),
      ).slice(0, 6),
    [bd, t],
  );
  const memberStatusData = useMemo(
    () =>
      countBy(
        (bd?.memberStatuses ?? []).map((row) => row.label),
        "active",
      ),
    [bd],
  );
  const memberJoinsData = (bd?.memberJoins ?? [])
    .slice(-12)
    .map((row) => ({ name: row.label, joins: row.n }));

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [range, setRange] = useState<"7d" | "30d" | "1y" | "all">("30d");
  const [pdfExporting, setPdfExporting] = useState(false);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // The ref registry is owned here; tab components register via this stable
  // callback so no child mutates a prop-owned ref (react/immutability).
  const registerChart = useCallback(
    (key: string, element: HTMLDivElement | null) => {
      chartRefs.current[key] = element;
    },
    [],
  );

  const allLoans = loansQuery.data ?? EMPTY_LOANS;
  const openLoans = allLoans.filter((loan) => !loan.returned_at);
  const overdueOpen = openLoans.filter((loan) => daysLate(loan.due_at) > 0);
  const overdueRate =
    openLoans.length > 0
      ? `${((overdueOpen.length / openLoans.length) * 100).toFixed(1)}%`
      : "0.0%";
  const loanCounts = {
    total: allLoans.length,
    open: openLoans.length,
    overdue: overdueOpen.length,
  };

  const trendData = useMemo(() => {
    const weekdayTag =
      locale === "fa"
        ? "fa-IR"
        : locale === "ar"
          ? "ar-DZ"
          : locale === "fr"
            ? "fr-FR"
            : "en-US";
    return (dashQuery.data?.activity ?? []).map((point) => ({
      name: new Intl.DateTimeFormat(weekdayTag, { weekday: "short" }).format(
        new Date(point.date),
      ),
      circulation: point.count,
    }));
  }, [dashQuery.data, locale]);

  const trendBadge = useMemo(() => {
    if (trendData.length < 4) return null;
    const half = Math.floor(trendData.length / 2);
    const first = trendData
      .slice(0, half)
      .reduce((sum, point) => sum + point.circulation, 0);
    const second = trendData
      .slice(half)
      .reduce((sum, point) => sum + point.circulation, 0);
    if (first === 0) return second > 0 ? "+100%" : null;
    const delta = Math.round(((second - first) / first) * 100);
    return `${delta >= 0 ? "+" : ""}${delta}%`;
  }, [trendData]);

  const rhythm = dashQuery.data?.circulationRhythm ?? [];

  const kpis = [
    {
      icon: BookOpen,
      label: t("reports.metrics.totalCheckouts", "Total checkouts"),
      sub: t("reports.metrics.totalCheckoutsSub", "all-time loans"),
      value: allLoans.length,
    },
    {
      icon: CheckCircle2,
      label: t("reports.metrics.activeBorrowers", "Active borrowers"),
      sub: t("reports.metrics.activeBorrowersSub", "current members"),
      value: dashQuery.data?.members ?? 0,
    },
    {
      icon: TrendingUp,
      label: t("reports.metrics.overdueRate", "Overdue rate"),
      sub: t("reports.metrics.overdueRateSub", "of open loans"),
      value: overdueRate,
    },
    {
      icon: BarChart3,
      label: t("reports.metrics.physicalHoldings", "Physical holdings"),
      sub: t("reports.metrics.physicalHoldingsSub", "copies on record"),
      value: dashQuery.data?.copies ?? 0,
    },
  ];

  const rangeLabels: Record<typeof range, string> = {
    "7d": t("reports.ranges.7d", "Last 7 days"),
    "30d": t("reports.ranges.30d", "Last 30 days"),
    "1y": t("reports.ranges.1y", "Last year"),
    all: t("reports.ranges.all", "All time"),
  };

  const exportZip = () => {
    buildReportZip({
      t,
      kpis,
      trendData,
      categoriesData,
      copyStatusData,
      conditionsData,
      itemTypesData,
      rolesData,
      memberStatusData,
      memberJoinsData,
      rhythm,
    });
  };

  const exportPdf = async () => {
    if (pdfExporting) return;
    setPdfExporting(true);
    const originalTab = activeTab;
    try {
      await runReportsPdfExport({
        setActiveTab,
        chartRefs,
        libraryName: settings.library_name || "KetabYar Library",
        librarySubtitle:
          settings.library_description || "Library Analytics & Reports",
        locale,
        rangeLabel: rangeLabels[range],
        kpis,
        t,
      });
    } finally {
      setActiveTab(originalTab);
      setPdfExporting(false);
    }
  };

  const loading = dashQuery.isLoading || loansQuery.isLoading;

  // Latest-export mirror: the window context-menu listener below stays
  // registered with stable deps while always calling the current exporter.
  const exportPdfRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    exportPdfRef.current = exportPdf;
  });

  // Region context menu on a window listener: the page container stays free
  // of interaction props (Biome a11y); the keyboard menu key still fires
  // contextmenu events, which this listener receives like any other.
  const reportRegionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onCtx = (event: MouseEvent) => {
      if (!reportRegionRef.current?.contains(event.target as Node)) return;
      showContextMenu(
        event,
        [
          {
            id: "refresh",
            label: t("reports.refreshReports", "Refresh reports"),
            icon: RefreshCw,
            onClick: () => {
              void dashQuery.refetch();
              void loansQuery.refetch();
              void breakdownsQuery.refetch();
              toast.success(t("reports.refreshed", "Reports refreshed"));
            },
          },
          {
            id: "pdf",
            label: t("reports.printReport", "Export PDF report"),
            icon: Printer,
            onClick: () => void exportPdfRef.current(),
          },
          {
            id: "summary",
            label: t("reports.copySummary", "Copy stat summary"),
            icon: Copy,
            onClick: () => {
              void navigator.clipboard.writeText(
                `KetabYar Library Reports Summary:\nTitles: ${dashQuery.data?.titles ?? 0}\nCopies: ${dashQuery.data?.copies ?? 0}\nTotal Loans: ${allLoans.length}\nActive Members: ${dashQuery.data?.members ?? 0}\nOverdue Rate: ${overdueRate}`,
              );
              toast.success(
                t("reports.copiedSummary", "Summary copied to clipboard"),
              );
            },
          },
        ],
        { title: t("reports.title", "Reports") },
      );
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, [
    showContextMenu,
    t,
    dashQuery,
    loansQuery,
    breakdownsQuery,
    allLoans,
    overdueRate,
  ]);

  return (
    <div ref={reportRegionRef}>
      <PageTitle
        title={t("reports.title", "Reports")}
        detail={t(
          "reports.subtitle",
          "How the collection and its circulation behave.",
        )}
        action={
          <>
            <button
              type="button"
              onClick={exportZip}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <Download size={15} />
              {t("reports.exportCsvZip", "Export CSVs (ZIP)")}
            </button>
            <button
              type="button"
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

      {loading ? (
        <PageLoader label={t("reports.loading", "Crunching the numbers…")} />
      ) : (
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
                    ? kpi.value.toLocaleString(
                        locale === "fa" ? "fa-IR" : "en-US",
                      )
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
                activeDepartments={dashQuery.data?.activeDepartments ?? []}
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
      )}
    </div>
  );
}
