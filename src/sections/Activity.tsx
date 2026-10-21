import { useQuery } from "@tanstack/react-query";
import { Activity, BookOpen, Clock, Download, Eye, RefreshCw, Tag, User } from "lucide-react";
import { useMemo, useState } from "react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { auditLog } from "../data/repositories/library";
import { useUiStore } from "../store/uiStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { exportBlobWithToast } from "../utils/exportFile";
import { formatDisplayDate } from "../utils/dates";
import { cn } from "../utils/cn";
import { EmptyState, Modal } from "../components/ui/primitives";
import { PageTitle, Table, Cell } from "../components/ui/shared";
import { StatPill } from "../components/ui/widgets";
import { ArtMedal } from "../components/ui/art";

/**
 * Audit-log viewer: the last 500 recorded actions with filters, a details
 * modal, and CSV export.
 */

interface AuditRow {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json?: unknown;
  after_json?: unknown;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function jsonToText(value: unknown): string {
  const object = asObject(value);
  if (!object) return value ? String(value) : "";
  return Object.entries(object).map(([key, val]) => `${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`).join(" | ");
}

function humanize(action: string): string {
  return action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function summaryDetails(row: AuditRow): string {
  const object = asObject(row.after_json) ?? asObject(row.before_json) ?? {};
  const candidate = object.title ?? object.book_title ?? object.full_name ?? object.member_name ?? object.code ?? object.copyIds ?? object.shelf ?? "";
  return candidate ? String(candidate) : "";
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation();
  const lower = action.toLowerCase();
  const tone = /delete|remove|archive|cancel/.test(lower)
    ? "bg-red-600/10 text-red-600"
    : /return|update|renew|extend/.test(lower)
      ? "bg-accent/12 font-bold text-accent dark:text-accent-dark"
      : "bg-accent/10 text-accent dark:text-accent-dark";
  return (
    <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone)}>
      {t(`activity.actions.${action}`, humanize(action)) as string}
    </span>
  );
}

export function ActivityPage() {
  const { t } = useTranslation();
  const { showContextMenu } = useContextMenu();
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;

  const query = useQuery({ queryKey: ["activity"], queryFn: () => auditLog(500) });
  const [term, setTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const rows = query.data ?? [];

  const actors = useMemo(() => Array.from(new Set(rows.map((row) => row.actor))).sort(), [rows]);
  const actions = useMemo(() => Array.from(new Set(rows.map((row) => row.action))).sort(), [rows]);
  const entities = useMemo(() => Array.from(new Set(rows.map((row) => row.entity_type))).sort(), [rows]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return rows.filter((row) => {
      if (dateFilter && row.created_at.slice(0, 10) !== dateFilter) return false;
      if (actorFilter && row.actor !== actorFilter) return false;
      if (actionFilter && row.action !== actionFilter) return false;
      if (entityFilter && row.entity_type.toLowerCase() !== entityFilter.toLowerCase()) return false;
      if (!needle) return true;
      return [row.action, row.actor, row.entity_type, row.entity_id, jsonToText(row.after_json), jsonToText(row.before_json)]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, term, dateFilter, entityFilter, actorFilter, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const stats = useMemo(() => {
    const count = (test: (type: string) => boolean) => filtered.filter((row) => test(row.entity_type.toLowerCase())).length;
    return {
      total: filtered.length,
      loans: count((type) => type.includes("loan")),
      reservations: count((type) => type.includes("reservation")),
      members: count((type) => type.includes("member")),
      catalog: count((type) => type.includes("book") || type.includes("copy")),
    };
  }, [filtered]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.warning(t("activity.alerts.noActivitiesToExport", "Nothing to export"));
      return;
    }
    try {
      const csv = Papa.unparse({
        fields: ["ID", "Timestamp", "Date", "Time", "Actor", "Action", "Entity Type", "Entity ID", "Details"],
        data: filtered.map((row) => [
          row.id, row.created_at, row.created_at.slice(0, 10), row.created_at.slice(11, 19),
          row.actor, row.action, row.entity_type, row.entity_id, jsonToText(row.after_json) || jsonToText(row.before_json),
        ]),
      });
      const stamp = new Date().toISOString().slice(0, 10);
      exportBlobWithToast(
        new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
        `ketabyar_audit_logs_${stamp}.csv`,
        t("activity.alerts.exportSuccess", "Exported {{count}} log rows", { count: filtered.length }),
        t("common.openFolder", "Open folder"),
      );
    } catch (error) {
      toast.error(t("activity.alerts.exportFailed", "Export failed: {{error}}", { error: String(error) }));
    }
  };

  if (query.isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <RefreshCw size={26} className="animate-spin text-accent" />
        <p className="text-sm text-ink/60 dark:text-ivory/60">{t("activity.loading", "Loading audit history…")}</p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title={t("activity.title", "Activity")}
        detail={t("activity.subtitle", "Everything the desk has done, newest first.")}
        action={
          <button onClick={exportCsv} className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/10 dark:bg-white/5 dark:hover:bg-white/10">
            <Download size={15} />
            {t("activity.exportCsv", "Export CSV")}
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill icon={Activity} label={t("activity.stats.totalLogged", "Total logged")} value={stats.total} />
        <StatPill icon={Clock} label={t("activity.stats.loansCirculation", "Loans & circulation")} value={stats.loans} />
        <StatPill icon={Tag} label={t("activity.stats.reservations", "Reservations")} value={stats.reservations} />
        <StatPill icon={User} label={t("activity.stats.members", "Members")} value={stats.members} />
        <StatPill icon={BookOpen} label={t("activity.stats.catalogCopies", "Catalog & copies")} value={stats.catalog} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-ink/8 bg-white p-3 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <input className="field-input max-w-xs" placeholder={t("activity.searchPlaceholder", "Search actions, operators, ids…")} value={term} onChange={(event) => { setTerm(event.target.value); setPage(1); }} />
        <input type="date" className="field-input max-w-40" value={dateFilter} onChange={(event) => { setDateFilter(event.target.value); setPage(1); }} />
        {dateFilter ? (
          <button onClick={() => setDateFilter("")} className="rounded-lg bg-red-600/10 px-2.5 py-1.5 text-xs font-bold text-red-600">{t("activity.clear", "Clear")}</button>
        ) : null}
        <select className="field-select max-w-40" value={entityFilter} onChange={(event) => { setEntityFilter(event.target.value); setPage(1); }}>
          <option value="">{t("activity.allEntities", "All entities")}</option>
          {entities.map((entity) => <option key={entity} value={entity}>{t(`activity.entities.${entity}`, entity) as string}</option>)}
        </select>
        <select className="field-select max-w-40" value={actorFilter} onChange={(event) => { setActorFilter(event.target.value); setPage(1); }}>
          <option value="">{t("activity.allUsers", "All users")}</option>
          {actors.map((actor) => <option key={actor} value={actor}>{actor}</option>)}
        </select>
        <select className="field-select max-w-44" value={actionFilter} onChange={(event) => { setActionFilter(event.target.value); setPage(1); }}>
          <option value="">{t("activity.allActions", "All actions")}</option>
          {actions.map((action) => <option key={action} value={action}>{t(`activity.actions.${action}`, humanize(action))}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState artwork={<ArtMedal />} title={t("activity.noActivity", "No activity recorded")} description={t("activity.noActivityHelp", "Once staff start working with the collection, every action will appear here.")} />
      ) : (
        <>
          <Table headers={[t("activity.time", "Timestamp"), t("activity.actor", "Operator"), t("activity.action", "Action"), t("activity.entity", "Target entity"), t("activity.detailsContext", "Details / Context"), ""]} minWidth={880}>
            {pageRows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelected(row)}
                onContextMenu={(event) =>
                  showContextMenu(event, [
                    { id: "inspect", label: t("activity.inspectLog", "Inspect details"), icon: Eye, onClick: () => setSelected(row) },
                    { id: "copyAction", label: t("activity.copyAction", "Copy action name"), onClick: () => { void navigator.clipboard.writeText(row.action); toast.success(t("activity.copiedAction", "Action copied")); } },
                    { id: "copyEntity", label: t("activity.copyEntity", "Copy entity ID"), onClick: () => { void navigator.clipboard.writeText(row.entity_id); toast.success(t("activity.copiedEntity", "Entity ID copied")); } },
                    { id: "d", divider: true },
                    { id: "refresh", label: t("activity.refreshLogs", "Refresh history"), variant: "accent", onClick: () => void query.refetch() },
                  ], { title: `${row.action} (${row.entity_type})` })
                }
                className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
              >
                <Cell className="whitespace-nowrap">
                  <p className="text-[13px] font-semibold">{formatDisplayDate(row.created_at)}</p>
                  <p className="font-mono text-[10px] text-ink/45 dark:text-ivory/45">{row.created_at.slice(11, 19)}</p>
                </Cell>
                <Cell>
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent dark:text-accent-dark">
                      {row.actor.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-[13px]">{row.actor}</span>
                  </div>
                </Cell>
                <Cell><ActionBadge action={row.action} /></Cell>
                <Cell>
                  <span className="rounded-full bg-ink/6 px-2 py-0.5 text-[11px] font-semibold dark:bg-white/8">{t(`activity.entities.${row.entity_type}`, row.entity_type) as string}</span>
                  <span className="ms-2 font-mono text-[10px] text-ink/45 dark:text-ivory/45">{row.entity_id.slice(0, 8)}…</span>
                </Cell>
                <Cell className="max-w-56">
                  <p className="truncate text-xs text-ink/60 dark:text-ivory/60" title={summaryDetails(row)}>{summaryDetails(row) || jsonToText(row.after_json).slice(0, 60)}</p>
                </Cell>
                <Cell>
                  <button
                    aria-label={t("activity.inspect", "Inspect")}
                    onClick={(event) => { event.stopPropagation(); setSelected(row); }}
                    className="rounded-lg p-1.5 text-ink/50 hover:bg-ink/8 hover:text-ink dark:text-ivory/50 dark:hover:bg-white/10 dark:hover:text-ivory"
                  >
                    <Eye size={15} />
                  </button>
                </Cell>
              </tr>
            ))}
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
            <span>{t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, filtered.length), total: filtered.length })}</span>
            <div className="flex items-center gap-2">
              <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">‹</button>
              <span className="tabular-nums">{currentPage} / {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">›</button>
            </div>
          </div>
        </>
      )}

      <Modal isOpen={!!selected} onClose={() => setSelected(null)} title={t("activity.modal.title", "Log details")} size="md">
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <ActionBadge action={selected.action} />
              <span className="text-xs text-ink/55 dark:text-ivory/55">{formatDisplayDate(selected.created_at)}</span>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="font-semibold">{t("activity.modal.operator", "Operator")}</dt>
              <dd>{selected.actor}</dd>
              <dt className="font-semibold">{t("activity.modal.entityType", "Entity type")}</dt>
              <dd>{t(`activity.entities.${selected.entity_type}`, selected.entity_type) as string}</dd>
              <dt className="font-semibold">{t("activity.modal.entityId", "Entity ID")}</dt>
              <dd><code className="break-all rounded bg-ink/5 px-1.5 py-0.5 font-mono text-xs dark:bg-white/10">{selected.entity_id}</code></dd>
            </dl>
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">{t("activity.modal.payload", "Payload")}</p>
              {(() => {
                const object = asObject(selected.after_json) ?? asObject(selected.before_json);
                if (!object) return <p className="text-xs text-ink/50 dark:text-ivory/50">{t("activity.modal.noPayload", "No payload recorded.")}</p>;
                return (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl bg-ink/5 p-3 dark:bg-white/5">
                    {Object.entries(object).map(([key, value]) => (
                      <p key={key} className="font-mono text-[11px]">
                        <span className="font-bold">{key}</span>: {typeof value === "string" ? value : JSON.stringify(value)}
                      </p>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
