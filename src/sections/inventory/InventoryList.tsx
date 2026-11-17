import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { ItemTypeBadge, StatusBadge } from "../../components/ui/primitives";
import type { Copy } from "../../types";
import { cn } from "../../utils/cn";
import { copyMenuItems } from "./copyMenuItems";

/** The list view: copy table with selection, context menu and pagination. */
export function InventoryList({
  listRows,
  selectedIds,
  setSelectedIds,
  onEditCopy,
  onRowContextMenu,
  currentPage,
  totalPages,
  setPage,
  total,
  pageSize,
  copyDelete,
  invalidate,
}: {
  listRows: Copy[];
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  onEditCopy: (copy: Copy) => void;
  onRowContextMenu: (event: ReactMouseEvent, items: ContextMenuItem[]) => void;
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  total: number;
  pageSize: number;
  copyDelete: (id: string) => void;
  invalidate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <table className="w-full text-sm" style={{ minWidth: 820 }}>
          <thead>
            <tr className="bg-ivory text-[11px] uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label={t("inventory.selectAll", "Select all copies")}
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? new Set(listRows.map((row) => row.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th className="px-4 py-3 text-start">
                {t("inventory.barcodeHeader", "Barcode")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("catalog.headers.type", "Type")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("catalog.headers.title", "Title")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("catalog.details.shelfLabel", "Shelf")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("catalog.details.copyCondition", "Condition")}
              </th>
              <th className="px-4 py-3 text-start">
                {t("inventory.status", "Status")}
              </th>
            </tr>
          </thead>
          <tbody>
            {listRows.map((copy) => (
              <tr
                key={copy.id}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onEditCopy(copy);
                }}
                onClick={(event) => {
                  if (
                    (event.target as HTMLElement).closest(
                      "input, button, a, label",
                    )
                  )
                    return;
                  onEditCopy(copy);
                }}
                onContextMenu={(event) =>
                  onRowContextMenu(
                    event,
                    copyMenuItems(copy, t, invalidate, copyDelete),
                  )
                }
                className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
              >
                <td className="border-b border-ink/6 px-3 py-3 dark:border-white/6">
                  <input
                    type="checkbox"
                    aria-label={t(
                      "inventory.selectRow",
                      "Select copy {{title}}",
                      {
                        title: copy.title,
                      },
                    )}
                    checked={selectedIds.has(copy.id)}
                    onChange={(event) => {
                      const next = new Set(selectedIds);
                      if (event.target.checked) next.add(copy.id);
                      else next.delete(copy.id);
                      setSelectedIds(next);
                    }}
                  />
                </td>
                <td className="border-b border-ink/6 px-4 py-3 font-mono text-xs dark:border-white/6">
                  {copy.barcode}
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <ItemTypeBadge type={copy.item_type} />
                </td>
                <td className="max-w-56 border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <p className="truncate">{copy.title}</p>
                </td>
                <td className="border-b border-ink/6 px-4 py-3 text-xs dark:border-white/6">
                  {copy.shelf
                    ? `${copy.shelf} · ${copy.room ?? ""}`
                    : t("inventory.unassigned", "Unassigned")}
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      copy.condition === "damaged" || copy.condition === "worn"
                        ? "bg-amber-500/15 text-amber-600"
                        : "bg-ink/6 dark:bg-white/8",
                    )}
                  >
                    {t(`catalog.condition.${copy.condition}`, copy.condition)}
                  </span>
                </td>
                <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                  <StatusBadge value={copy.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
        <span>
          {t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", {
            start: (currentPage - 1) * pageSize + 1,
            end: Math.min(currentPage * pageSize, total),
            total,
          })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
          >
            ‹
          </button>
          <span className="tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
          >
            ›
          </button>
        </div>
      </div>
    </>
  );
}
