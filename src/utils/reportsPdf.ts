import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import vazirmatnRegular from "../assets/fonts/Vazirmatn-Regular.ttf?inline";
import vazirmatnBold from "../assets/fonts/Vazirmatn-Bold.ttf?inline";

/**
 * The printed analytics report. A4 portrait, one page per section, with a
 * library masthead, KPI strip, captured chart images and data tables.
 * Persian output embeds the OFL-licensed Vazirmatn face (inlined at build
 * time from the vendored TTFs) and switches direction per string.
 */

const INK = "#122222";
const BRAND = "#1a4d40";
const COPPER = "#b96f3e";
const PARCHMENT = "#f9f8f4";
const MUTED = "#6b7a76";
const PAGE_MARGIN = 16;

const BASE64_PREFIX = /^data:[^;]+;base64,/;

function ttfBase64(dataUrl: string): string {
  return dataUrl.replace(BASE64_PREFIX, "");
}

const HAS_PERSIAN = /[\u0600-\u06FF\u0750-\u077F]/;

export interface ReportsPdfChart {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
}

export interface ReportsPdfTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ReportsPdfSection {
  id: string;
  title: string;
  subtitle: string;
  charts?: ReportsPdfChart[];
  tables: ReportsPdfTable[];
}

export interface ReportsPdfInput {
  libraryName: string;
  librarySubtitle?: string;
  generatedAt: Date;
  rangeLabel: string;
  locale: string;
  kpis: { label: string; value: string; sub?: string }[];
  sections: ReportsPdfSection[];
}

function localeTag(locale: string): string {
  if (locale === "fa") return "fa-IR";
  if (locale === "ar") return "ar-DZ";
  if (locale === "fr") return "fr-FR";
  return "en-US";
}

/** Registers the Persian faces when the report contains any Persian text. */
function prepareFonts(doc: jsPDF, input: ReportsPdfInput): { persian: boolean } {
  const needsPersian = input.locale === "fa" || input.locale === "ar"
    || JSON.stringify(input).match(HAS_PERSIAN) !== null;
  if (needsPersian) {
    doc.addFileToVFS("Vazirmatn-Regular.ttf", ttfBase64(vazirmatnRegular));
    doc.addFileToVFS("Vazirmatn-Bold.ttf", ttfBase64(vazirmatnBold));
    doc.addFont("Vazirmatn-Regular.ttf", "Vazirmatn", "normal");
    doc.addFont("Vazirmatn-Bold.ttf", "Vazirmatn", "bold");
  }
  return { persian: needsPersian };
}

function fontFor(doc: jsPDF, persian: boolean, text: string, bold = false): string {
  if (persian && HAS_PERSIAN.test(text)) {
    doc.setFont("Vazirmatn", bold ? "bold" : "normal");
    return "Vazirmatn";
  }
  doc.setFont("helvetica", bold ? "bold" : "normal");
  return "helvetica";
}

function drawText(doc: jsPDF, text: string, x: number, y: number, opts: { size: number; bold?: boolean; color?: string; rtl?: boolean; align?: "left" | "right" | "center" }): void {
  const { size, bold, color, rtl, align } = opts;
  const family = fontFor(doc, true, text, bold);
  doc.setFontSize(size);
  doc.setTextColor(color ?? INK);
  doc.text(text, x, y, { align: align ?? (rtl ? "right" : "left") });
  void family;
}

function drawKpis(doc: jsPDF, kpis: ReportsPdfInput["kpis"]): number {
  const contentWidth = 210 - PAGE_MARGIN * 2;
  const cardWidth = (contentWidth - 3 * 4) / 4;
  let y = PAGE_MARGIN + 6;
  kpis.forEach((kpi, index) => {
    const x = PAGE_MARGIN + index * (cardWidth + 4);
    doc.setFillColor(PARCHMENT);
    doc.roundedRect(x, y, cardWidth, 20, 2, 2, "F");
    drawText(doc, kpi.value, x + cardWidth / 2, y + 9, { size: 13, bold: true, align: "center" });
    drawText(doc, kpi.label.toUpperCase(), x + cardWidth / 2, y + 14, { size: 6.5, color: COPPER, align: "center" });
    if (kpi.sub) drawText(doc, kpi.sub, x + cardWidth / 2, y + 17.8, { size: 6.5, color: MUTED, align: "center" });
  });
  return y + 24;
}

function drawChartGrid(doc: jsPDF, charts: ReportsPdfChart[], yStart: number): number {
  const contentWidth = 210 - PAGE_MARGIN * 2;
  const gap = 4;
  const cardWidth = (contentWidth - gap) / 2;
  let y = yStart;
  let column = 0;
  let rowHeight = 0;

  for (const chart of charts) {
    const aspect = chart.height > 0 ? chart.width / chart.height : 2;
    const imageHeight = Math.min(62, cardWidth / aspect);
    const cellHeight = imageHeight + 8;
    if (column === 0) {
      if (y + cellHeight > 297 - PAGE_MARGIN - 12 && y > yStart) {
        doc.addPage();
        y = PAGE_MARGIN + 4;
      }
      rowHeight = cellHeight;
    }
    const x = PAGE_MARGIN + column * (cardWidth + gap);
    drawText(doc, chart.title, x + 1, y + 4, { size: 8.5, bold: true });
    try {
      doc.addImage(chart.dataUrl, "PNG", x, y + 6, cardWidth, imageHeight);
    } catch {
      /* a failed capture should never abort the whole report */
    }
    if (column === 1) {
      y += rowHeight + 4;
      column = 0;
    } else {
      column = 1;
    }
  }
  return column === 1 ? y + rowHeight + 4 : y;
}

function drawTables(doc: jsPDF, tables: ReportsPdfTable[], yStart: number): void {
  let y = yStart;
  for (const table of tables) {
    if (table.rows.length === 0) continue;
    const estimate = Math.min(14 + table.rows.length * 7, 40);
    if (y + estimate > 297 - PAGE_MARGIN - 12 && y > PAGE_MARGIN) {
      doc.addPage();
      y = PAGE_MARGIN + 4;
    }
    drawText(doc, table.title, PAGE_MARGIN, y + 4, { size: 9, bold: true });
    autoTable(doc, {
      startY: y + 6,
      head: [table.columns],
      body: table.rows.length > 0 ? table.rows.map((r) => r.map(String)) : [[{ content: "—", colSpan: table.columns.length, styles: { halign: "center", fontStyle: "italic" } }]],
      theme: "plain",
      styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK },
      headStyles: { fillColor: INK, textColor: "#ffffff", fontSize: 8, fontStyle: "bold" },
      alternateRowStyles: { fillColor: "#fcfbf8" },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    const cursor = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable;
    y = (cursor?.finalY ?? y) + 8;
  }
}

function drawPageChrome(doc: jsPDF, input: ReportsPdfInput, persian: boolean): void {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFillColor(INK);
    doc.rect(0, 0, 210, 22, "F");
    const rtl = persian && HAS_PERSIAN.test(input.libraryName);
    drawText(doc, input.libraryName || "KetabYar Library", rtl ? 210 - PAGE_MARGIN : PAGE_MARGIN, 9, { size: 14, bold: true, color: "#ffffff", rtl });
    drawText(doc, input.librarySubtitle || "Library Analytics & Reports", rtl ? 210 - PAGE_MARGIN : PAGE_MARGIN, 15, { size: 8.5, color: "#c9d6d2", rtl });
    drawText(doc, input.rangeLabel, 210 - PAGE_MARGIN, 9, { size: 9, bold: true, color: COPPER, align: "right" });
    drawText(doc, input.generatedAt.toLocaleString(localeTag(input.locale), { dateStyle: "medium", timeStyle: "short" }), 210 - PAGE_MARGIN, 15, { size: 8, color: "#c9d6d2", align: "right" });

    doc.setDrawColor(MUTED);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN, 285, 210 - PAGE_MARGIN, 285);
    drawText(doc, "Generated by KetabYar: University Library Management", PAGE_MARGIN, 290, { size: 7.5, color: MUTED });
    drawText(doc, `Page ${page} of ${pageCount}`, 210 - PAGE_MARGIN, 290, { size: 7.5, color: MUTED, align: "right" });
  }
}

export async function generateReportsPdf(input: ReportsPdfInput): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { persian } = prepareFonts(doc, input);

  input.sections.forEach((section, index) => {
    if (index > 0) doc.addPage();
    doc.setFillColor(BRAND);
    doc.roundedRect(PAGE_MARGIN, PAGE_MARGIN, 210 - PAGE_MARGIN * 2, 14, 2, 2, "F");
    drawText(doc, section.title, PAGE_MARGIN + 4, PAGE_MARGIN + 7, { size: 13, bold: true, color: "#ffffff" });
    drawText(doc, section.subtitle, PAGE_MARGIN + 4, PAGE_MARGIN + 12, { size: 8.5, color: "#cfe0db" });

    let y = PAGE_MARGIN + 18;
    if (index === 0 && input.kpis.length > 0) y = drawKpis(doc, input.kpis);
    if (section.charts && section.charts.length > 0) y = drawChartGrid(doc, section.charts, y);
    drawTables(doc, section.tables, y);
  });

  drawPageChrome(doc, input, persian);

  const stamp = input.generatedAt.toISOString().slice(0, 10);
  doc.save(`ketabyar-library-report-${stamp}.pdf`);
}
