import JSZip from "jszip";
import { toast } from "sonner";

/**
 * Export plumbing shared by every screen that downloads data:
 * CSV construction (RFC-style quoting + UTF-8 BOM for Excel), ZIP bundling,
 * browser download triggering, and a toast that offers to reveal the
 * Downloads folder on the desktop.
 */

/** Quote-wraps a field when it contains a comma, quote, or newline. */
export function csvField(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One CSV document: header row first, BOM-prefixed so Excel detects UTF-8. */
export function buildCsv(columns: string[], rows: (string | number)[][]): string {
  return "﻿" + [columns, ...rows].map((row) => row.map(csvField).join(",")).join("\n");
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Best effort: reveal the OS Downloads folder (desktop only, silent no-op elsewhere). */
export async function openDownloadsFolder(): Promise<void> {
  try {
    const { downloadDir } = await import("@tauri-apps/api/path");
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(await downloadDir());
  } catch (error) {
    console.warn("Downloads folder could not be opened", error);
  }
}

/** Downloads a blob and confirms with a toast that links to the Downloads folder. */
export function exportBlobWithToast(blob: Blob, filename: string, message: string, openLabel: string) {
  triggerDownload(blob, filename);
  toast.success(message, {
    duration: 8000,
    action: { label: openLabel, onClick: () => void openDownloadsFolder() },
  });
}

/** Bundles several named CSV documents into one .zip and exports it. */
export async function exportCsvZip(
  zipName: string,
  files: { name: string; columns: string[]; rows: (string | number)[][] }[],
  message: string,
  openLabel: string,
) {
  const zip = new JSZip();
  for (const file of files) zip.file(file.name, buildCsv(file.columns, file.rows));
  const blob = await zip.generateAsync({ type: "blob" });
  exportBlobWithToast(blob, zipName, message, openLabel);
}
