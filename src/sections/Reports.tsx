import { Copy, Download, Printer, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useContextMenu } from "../components/ui/ContextMenu";
import { PageTitle } from "../components/ui/shared";
import {
  dashboard,
  loans,
  reportBreakdowns,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useUiStore } from "../store/uiStore";
import { cn } from "../utils/cn";
import { ReportsChartsGrid } from "./reports/ReportsChartsGrid";
import { TAB_CHARTS, type TabId } from "./reports/ReportsShared";
import { ReportsToolbar } from "./reports/ReportsToolbar";
import { useReportData, useReportsExports } from "./reports/useReportData";

/**
 * Reports root: queries and tab state; derivations live in useReportData,
 * the CSV/PDF exports in useReportsExports and the chart grid in
 * reports/ReportsChartsGrid.
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

  const data = useReportData({
    t,
    locale,
    bd: breakdownsQuery.data,
    dashData: dashQuery.data,
    loansData: loansQuery.data,
    range,
  });
  const { allLoans, overdueRate } = data;

  const { exportZip, exportPdf, exportPdfRef } = useReportsExports({
    t,
    locale,
    settings,
    activeTab,
    setActiveTab,
    chartRefs,
    pdfExporting,
    setPdfExporting,
    range,
    data,
  });

  const loading = dashQuery.isLoading || loansQuery.isLoading;

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
    exportPdfRef,
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

      <ReportsToolbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        range={range}
        setRange={setRange}
        rangeLabels={data.rangeLabels}
      />

      <ReportsChartsGrid
        loading={loading}
        kpis={data.kpis}
        locale={locale}
        activeTab={activeTab}
        registerChart={registerChart}
        data={data}
        activeDepartments={dashQuery.data?.activeDepartments ?? []}
      />
    </div>
  );
}
