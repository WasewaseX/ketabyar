import {
  Activity,
  BookOpen,
  Clock,
  Download,
  RefreshCw,
  Tag,
  User,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArtMedal } from "../components/ui/art";
import { useContextMenu } from "../components/ui/ContextMenu";
import { EmptyState } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { StatPill } from "../components/ui/widgets";
import { auditLog } from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useUiStore } from "../store/uiStore";
import { cn } from "../utils/cn";
import { ActivityDetailModal } from "./activity/ActivityDetailModal";
import { ActivityFilters } from "./activity/ActivityFilters";
import { ActivityTable } from "./activity/ActivityTable";
import { useActivityFeed } from "./activity/useActivityFeed";

/**
 * Audit-log viewer: the last 500 recorded actions with filters, a details
 * modal, and CSV export.
 */

export interface AuditRow {
  id: string;
  created_at: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json?: unknown;
  after_json?: unknown;
}

/** Stable empty array — keeps the filter memos from re-running every render. */
const EMPTY_ROWS: AuditRow[] = [];

export function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function jsonToText(value: unknown): string {
  const object = asObject(value);
  if (!object) return value ? String(value) : "";
  return Object.entries(object)
    .map(
      ([key, val]) =>
        `${key}: ${typeof val === "string" ? val : JSON.stringify(val)}`,
    )
    .join(" | ");
}

export function humanize(action: string): string {
  return action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function summaryDetails(row: AuditRow): string {
  const object = asObject(row.after_json) ?? asObject(row.before_json) ?? {};
  const candidate =
    object.title ??
    object.book_title ??
    object.full_name ??
    object.member_name ??
    object.code ??
    object.copyIds ??
    object.shelf ??
    "";
  return candidate ? String(candidate) : "";
}

export function ActionBadge({ action }: { action: string }) {
  const { t } = useTranslation();
  const lower = action.toLowerCase();
  const tone = /delete|remove|archive|cancel/.test(lower)
    ? "bg-red-600/10 text-red-600"
    : /return|update|renew|extend/.test(lower)
      ? "bg-accent/12 font-bold text-accent dark:text-accent-dark"
      : "bg-accent/10 text-accent dark:text-accent-dark";
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone,
      )}
    >
      {t(`activity.actions.${action}`, humanize(action)) as string}
    </span>
  );
}

/**
 * Activity root: the audit query and filter state; derivation, filters,
 * table and detail modal live in activity/ modules.
 */
export function ActivityPage() {
  const { t } = useTranslation();
  const { showContextMenu } = useContextMenu();
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;

  const query = useQuery({
    queryKey: ["activity"],
    queryFn: () => auditLog(500),
  });
  const [term, setTerm] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditRow | null>(null);

  const feed = useActivityFeed({
    t,
    rows: query.data ?? EMPTY_ROWS,
    term,
    dateFilter,
    entityFilter,
    actorFilter,
    actionFilter,
    page,
    pageSize,
  });
  const { filtered, currentPage, totalPages, pageRows, stats, exportCsv } =
    feed;

  if (query.isLoading) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <RefreshCw size={26} className="animate-spin text-accent" />
        <p className="text-sm text-ink/60 dark:text-ivory/60">
          {t("activity.loading", "Loading audit history…")}
        </p>
      </div>
    );
  }

  return (
    <div>
      <PageTitle
        title={t("activity.title", "Activity")}
        detail={t(
          "activity.subtitle",
          "Everything the desk has done, newest first.",
        )}
        action={
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/10 dark:bg-white/5 dark:hover:bg-white/10"
          >
            <Download size={15} />
            {t("activity.exportCsv", "Export CSV")}
          </button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill
          icon={Activity}
          label={t("activity.stats.totalLogged", "Total logged")}
          value={stats.total}
        />
        <StatPill
          icon={Clock}
          label={t("activity.stats.loansCirculation", "Loans & circulation")}
          value={stats.loans}
        />
        <StatPill
          icon={Tag}
          label={t("activity.stats.reservations", "Reservations")}
          value={stats.reservations}
        />
        <StatPill
          icon={User}
          label={t("activity.stats.members", "Members")}
          value={stats.members}
        />
        <StatPill
          icon={BookOpen}
          label={t("activity.stats.catalogCopies", "Catalog & copies")}
          value={stats.catalog}
        />
      </div>

      <ActivityFilters
        term={term}
        setTerm={(value) => {
          setTerm(value);
          setPage(1);
        }}
        dateFilter={dateFilter}
        setDateFilter={(value) => {
          setDateFilter(value);
          setPage(1);
        }}
        entityFilter={entityFilter}
        setEntityFilter={(value) => {
          setEntityFilter(value);
          setPage(1);
        }}
        actorFilter={actorFilter}
        setActorFilter={(value) => {
          setActorFilter(value);
          setPage(1);
        }}
        actionFilter={actionFilter}
        setActionFilter={(value) => {
          setActionFilter(value);
          setPage(1);
        }}
        actors={feed.actors}
        actions={feed.actions}
        entities={feed.entities}
        setPage={setPage}
      />

      {filtered.length === 0 ? (
        <EmptyState
          artwork={<ArtMedal />}
          title={t("activity.noActivity", "No activity recorded")}
          description={t(
            "activity.noActivityHelp",
            "Once staff start working with the collection, every action will appear here.",
          )}
        />
      ) : (
        <ActivityTable
          pageRows={pageRows}
          setSelected={setSelected}
          showContextMenu={showContextMenu}
          refetch={() => void query.refetch()}
          currentPage={currentPage}
          totalPages={totalPages}
          setPage={setPage}
          filteredCount={filtered.length}
          pageSize={pageSize}
        />
      )}

      <ActivityDetailModal
        selected={selected}
        onClose={() => setSelected(null)}
      />
    </div>
  );
}
