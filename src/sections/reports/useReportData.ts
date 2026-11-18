import type { TFunction } from "i18next";
import { BarChart3, BookOpen, CheckCircle2, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { DashboardMetrics, Loan } from "../../types";
import { daysLate } from "../../utils/dates";
import type { TabId } from "./ReportsShared";
import { buildReportZip, countBy, runReportsPdfExport } from "./ReportsShared";

/** Stable empty array — keeps the filter memos from re-running every render. */
const EMPTY_LOANS: Loan[] = [];

/**
 * Every reports derivation: breakdown memos, loan counts, the circulation
 * trend, KPI tiles and the range labels.
 */
export function useReportData(deps: {
  t: TFunction;
  locale: string;
  bd:
    | import("../../data/repositories/librarySqlSystem").ReportBreakdowns
    | undefined;
  dashData: DashboardMetrics | undefined;
  loansData: Loan[] | undefined;
  range: "7d" | "30d" | "1y" | "all";
}) {
  const { t, locale, bd, dashData, loansData, range } = deps;

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

  const allLoans = loansData ?? EMPTY_LOANS;
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
    return (dashData?.activity ?? []).map((point) => ({
      name: new Intl.DateTimeFormat(weekdayTag, { weekday: "short" }).format(
        new Date(point.date),
      ),
      circulation: point.count,
    }));
  }, [dashData, locale]);

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

  const rhythm = dashData?.circulationRhythm ?? [];

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
      value: dashData?.members ?? 0,
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
      value: dashData?.copies ?? 0,
    },
  ];

  const rangeLabels: Record<typeof range, string> = {
    "7d": t("reports.ranges.7d", "Last 7 days"),
    "30d": t("reports.ranges.30d", "Last 30 days"),
    "1y": t("reports.ranges.1y", "Last year"),
    all: t("reports.ranges.all", "All time"),
  };

  return {
    categoriesData,
    conditionsData,
    rolesData,
    copyStatusData,
    itemTypesData,
    inventoryCategoriesData,
    memberStatusData,
    memberJoinsData,
    allLoans,
    overdueRate,
    loanCounts,
    trendData,
    trendBadge,
    rhythm,
    kpis,
    rangeLabels,
  };
}

/** ── Exports: CSV ZIP + paged PDF, with a stable latest-export mirror ── */
export function useReportsExports(deps: {
  t: TFunction;
  locale: string;
  settings: { library_name: string; library_description: string };
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  chartRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  pdfExporting: boolean;
  setPdfExporting: (value: boolean) => void;
  range: "7d" | "30d" | "1y" | "all";
  data: ReturnType<typeof useReportData>;
}) {
  const {
    t,
    locale,
    settings,
    activeTab,
    setActiveTab,
    chartRefs,
    pdfExporting,
    setPdfExporting,
    range,
  } = deps;
  const {
    trendData,
    categoriesData,
    copyStatusData,
    conditionsData,
    itemTypesData,
    rolesData,
    memberStatusData,
    memberJoinsData,
    rhythm,
    kpis,
  } = deps.data;

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
        rangeLabel: deps.data.rangeLabels[range],
        kpis,
        t,
      });
    } finally {
      setActiveTab(originalTab);
      setPdfExporting(false);
    }
  };

  // Latest-export mirror: the window context-menu listener below stays
  // registered with stable deps while always calling the current exporter.
  const exportPdfRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    exportPdfRef.current = exportPdf;
  });

  return { exportZip, exportPdf, exportPdfRef };
}
