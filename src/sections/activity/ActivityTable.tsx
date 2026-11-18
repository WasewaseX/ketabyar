import { Eye } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { Cell, Table } from "../../components/ui/shared";
import { formatDisplayDate } from "../../utils/dates";
import type { AuditRow } from "../Activity";
import { ActionBadge, jsonToText, summaryDetails } from "../Activity";

/** The audit-log table with its row context menus and the pager. */
export function ActivityTable({
  pageRows,
  setSelected,
  showContextMenu,
  refetch,
  currentPage,
  totalPages,
  setPage,
  filteredCount,
  pageSize,
}: {
  pageRows: AuditRow[];
  setSelected: (row: AuditRow) => void;
  showContextMenu: (
    event: ReactMouseEvent,
    items: ContextMenuItem[],
    options?: { title?: string },
  ) => void;
  refetch: () => void;
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  filteredCount: number;
  pageSize: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Table
        headers={[
          t("activity.time", "Timestamp"),
          t("activity.actor", "Operator"),
          t("activity.action", "Action"),
          t("activity.entity", "Target entity"),
          t("activity.detailsContext", "Details / Context"),
          "",
        ]}
        minWidth={880}
      >
        {pageRows.map((row) => (
          <tr
            key={row.id}
            onClick={() => setSelected(row)}
            onContextMenu={(event) =>
              showContextMenu(
                event,
                [
                  {
                    id: "inspect",
                    label: t("activity.inspectLog", "Inspect details"),
                    icon: Eye,
                    onClick: () => setSelected(row),
                  },
                  {
                    id: "copyAction",
                    label: t("activity.copyAction", "Copy action name"),
                    onClick: () => {
                      void navigator.clipboard.writeText(row.action);
                      toast.success(
                        t("activity.copiedAction", "Action copied"),
                      );
                    },
                  },
                  {
                    id: "copyEntity",
                    label: t("activity.copyEntity", "Copy entity ID"),
                    onClick: () => {
                      void navigator.clipboard.writeText(row.entity_id);
                      toast.success(
                        t("activity.copiedEntity", "Entity ID copied"),
                      );
                    },
                  },
                  { id: "d", divider: true },
                  {
                    id: "refresh",
                    label: t("activity.refreshLogs", "Refresh history"),
                    variant: "accent",
                    onClick: refetch,
                  },
                ],
                { title: `${row.action} (${row.entity_type})` },
              )
            }
            className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
          >
            <Cell className="whitespace-nowrap">
              <p className="text-[13px] font-semibold">
                {formatDisplayDate(row.created_at)}
              </p>
              <p className="font-mono text-[10px] text-ink/45 dark:text-ivory/45">
                {row.created_at.slice(11, 19)}
              </p>
            </Cell>
            <Cell>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent dark:text-accent-dark">
                  {row.actor.slice(0, 2).toUpperCase()}
                </span>
                <span className="text-[13px]">{row.actor}</span>
              </div>
            </Cell>
            <Cell>
              <ActionBadge action={row.action} />
            </Cell>
            <Cell>
              <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/8">
                {
                  t(
                    `activity.entities.${row.entity_type}`,
                    row.entity_type,
                  ) as string
                }
              </span>
              <span className="ms-2 font-mono text-[10px] text-ink/45 dark:text-ivory/45">
                {row.entity_id.slice(0, 8)}…
              </span>
            </Cell>
            <Cell className="max-w-56">
              <p
                className="truncate text-xs text-ink/60 dark:text-ivory/60"
                title={summaryDetails(row)}
              >
                {summaryDetails(row) || jsonToText(row.after_json).slice(0, 60)}
              </p>
            </Cell>
            <Cell>
              <button
                type="button"
                aria-label={t("activity.inspect", "Inspect")}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelected(row);
                }}
                className="rounded-lg p-1.5 text-ink/50 hover:bg-ink/8 hover:text-ink dark:text-ivory/50 dark:hover:bg-white/10 dark:hover:text-ivory"
              >
                <Eye size={15} />
              </button>
            </Cell>
          </tr>
        ))}
      </Table>

      <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
        <span>
          {t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", {
            start: (currentPage - 1) * pageSize + 1,
            end: Math.min(currentPage * pageSize, filteredCount),
            total: filteredCount,
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
