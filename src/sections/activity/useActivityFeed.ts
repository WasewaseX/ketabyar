import type { TFunction } from "i18next";
import Papa from "papaparse";
import { useMemo } from "react";
import { toast } from "sonner";
import { exportBlobWithToast } from "../../utils/exportFile";
import type { AuditRow } from "../Activity";
import { jsonToText } from "../Activity";

/**
 * Activity feed derivation: facet options, filtering, pagination, the stats
 * strip and the CSV export.
 */
export function useActivityFeed(deps: {
  t: TFunction;
  rows: AuditRow[];
  term: string;
  dateFilter: string;
  entityFilter: string;
  actorFilter: string;
  actionFilter: string;
  page: number;
  pageSize: number;
}) {
  const { t } = deps;
  const rows = deps.rows;
  const {
    term,
    dateFilter,
    entityFilter,
    actorFilter,
    actionFilter,
    page,
    pageSize,
  } = deps;

  const actors = useMemo(
    () => Array.from(new Set(rows.map((row) => row.actor))).sort(),
    [rows],
  );
  const actions = useMemo(
    () => Array.from(new Set(rows.map((row) => row.action))).sort(),
    [rows],
  );
  const entities = useMemo(
    () => Array.from(new Set(rows.map((row) => row.entity_type))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return rows.filter((row) => {
      if (dateFilter && row.created_at.slice(0, 10) !== dateFilter)
        return false;
      if (actorFilter && row.actor !== actorFilter) return false;
      if (actionFilter && row.action !== actionFilter) return false;
      if (
        entityFilter &&
        row.entity_type.toLowerCase() !== entityFilter.toLowerCase()
      )
        return false;
      if (!needle) return true;
      return [
        row.action,
        row.actor,
        row.entity_type,
        row.entity_id,
        jsonToText(row.after_json),
        jsonToText(row.before_json),
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, term, dateFilter, entityFilter, actorFilter, actionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const stats = useMemo(() => {
    const count = (test: (type: string) => boolean) =>
      filtered.filter((row) => test(row.entity_type.toLowerCase())).length;
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
      toast.warning(
        t("activity.alerts.noActivitiesToExport", "Nothing to export"),
      );
      return;
    }
    try {
      const csv = Papa.unparse({
        fields: [
          "ID",
          "Timestamp",
          "Date",
          "Time",
          "Actor",
          "Action",
          "Entity Type",
          "Entity ID",
          "Details",
        ],
        data: filtered.map((row) => [
          row.id,
          row.created_at,
          row.created_at.slice(0, 10),
          row.created_at.slice(11, 19),
          row.actor,
          row.action,
          row.entity_type,
          row.entity_id,
          jsonToText(row.after_json) || jsonToText(row.before_json),
        ]),
      });
      const stamp = new Date().toISOString().slice(0, 10);
      exportBlobWithToast(
        new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
        `ketabyar_audit_logs_${stamp}.csv`,
        t("activity.alerts.exportSuccess", "Exported {{count}} log rows", {
          count: filtered.length,
        }),
        t("common.openFolder", "Open folder"),
      );
    } catch (error) {
      toast.error(
        t("activity.alerts.exportFailed", "Export failed: {{error}}", {
          error: String(error),
        }),
      );
    }
  };

  return {
    actors,
    actions,
    entities,
    filtered,
    totalPages,
    currentPage,
    pageRows,
    stats,
    exportCsv,
  };
}
