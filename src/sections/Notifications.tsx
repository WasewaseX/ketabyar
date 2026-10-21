import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, CalendarClock, CheckCheck, Clock, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { dashboard, markAllNotificationsRead, markNotificationRead, notifications as fetchNotifications, reservations } from "../data/repositories/library";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { useNotificationsStore } from "../store/notificationsStore";
import { formatDisplayDate } from "../utils/dates";
import { cn } from "../utils/cn";
import { PageTitle, Table, Cell } from "../components/ui/shared";
import { StatPill } from "../components/ui/widgets";
import { EmptyState } from "../components/ui/primitives";
import type { AppNotification, Loan, Reservation } from "../types";

/**
 * Notification centre: three live alert streams (overdue, due soon, ready
 * holds) merged with the persisted notification history.
 */

type Kind = "overdue" | "duesoon" | "ready" | "system";

interface Row {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  date: string;
  isRead: boolean;
  markable: boolean;
  onOpen: () => void;
}

const KIND_TONES: Record<Kind, string> = {
  overdue: "bg-red-600/10 text-red-600",
  duesoon: "bg-amber-500/12 text-amber-600",
  ready: "bg-accent/10 text-accent dark:text-accent-dark",
  system: "bg-ink/8 text-ink/60 dark:bg-white/10 dark:text-ivory/60",
};

function kindLabel(kind: Kind, t: (key: string, fallback: string) => string): string {
  if (kind === "overdue") return t("notificationsPage.kindOverdue", "Overdue");
  if (kind === "duesoon") return t("notificationsPage.kindDueSoon", "Due soon");
  if (kind === "ready") return t("notificationsPage.kindReady", "Ready for pickup");
  return t("notificationsPage.kindSystem", "System");
}

export function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const { seen, markSeen } = useNotificationsStore();

  const [term, setTerm] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const dashQuery = useQuery({ queryKey: ["dashboard-shell"], queryFn: dashboard });
  const resQuery = useQuery({ queryKey: ["reservations-shell"], queryFn: reservations, enabled: settings.notify_ready });
  const historyQuery = useQuery({ queryKey: ["notifications"], queryFn: () => fetchNotifications(200) });

  const rows = useMemo<Row[]>(() => {
    const overdue = settings.notify_overdue ? (dashQuery.data?.overdueLoans ?? []) : [];
    const dueSoon = settings.notify_due_soon ? (dashQuery.data?.dueSoonLoans ?? []) : [];
    const ready = settings.notify_ready ? (resQuery.data ?? []).filter((item: Reservation) => item.status === "ready") : [];
    const history = historyQuery.data ?? [];

    const memberLine = t("circulation.selectedMember", "Member");

    const live: Row[] = [
      ...overdue.map((loan: Loan) => ({
        id: `overdue-${loan.id}`,
        kind: "overdue" as Kind,
        title: loan.title ?? "",
        subtitle: `${memberLine}: ${loan.member_name ?? ""}`,
        date: loan.due_at,
        isRead: seen.includes(`overdue-${loan.id}`),
        markable: false,
        onOpen: () => { markSeen([`overdue-${loan.id}`]); navigate("/members"); },
      })),
      ...dueSoon.map((loan: Loan) => ({
        id: `duesoon-${loan.id}`,
        kind: "duesoon" as Kind,
        title: loan.title ?? "",
        subtitle: `${memberLine}: ${loan.member_name ?? ""}`,
        date: loan.due_at,
        isRead: seen.includes(`duesoon-${loan.id}`),
        markable: false,
        onOpen: () => { markSeen([`duesoon-${loan.id}`]); navigate("/members"); },
      })),
      ...ready.map((item: Reservation) => ({
        id: `ready-${item.id}`,
        kind: "ready" as Kind,
        title: item.title ?? "",
        subtitle: `${memberLine}: ${item.member_name ?? ""}`,
        date: item.reserved_at || item.requested_at,
        isRead: seen.includes(`ready-${item.id}`),
        markable: false,
        onOpen: () => { markSeen([`ready-${item.id}`]); navigate("/reservations"); },
      })),
    ];

    const persisted: Row[] = history.map((item: AppNotification) => ({
      id: item.id,
      kind: item.type === "reservation_ready" ? "ready" : "system",
      title: item.title,
      subtitle: item.body ?? "",
      date: item.created_at,
      isRead: item.is_read,
      markable: true,
      onOpen: () => {
        if (!item.is_read) {
          markNotificationRead(item.id)
            .then(() => queryClient.invalidateQueries({ queryKey: ["notifications"] }))
            .catch((error: Error) => toast.error(error.message));
        }
        if (item.link) navigate(item.link);
      },
    }));

    return [...live, ...persisted].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dashQuery.data, historyQuery.data, markSeen, navigate, queryClient, resQuery.data, seen, settings.notify_due_soon, settings.notify_overdue, settings.notify_ready, t]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return rows.filter((row) => {
      if (kindFilter !== "all" && row.kind !== kindFilter) return false;
      if (unreadOnly && row.isRead) return false;
      if (!needle) return true;
      return row.title.toLowerCase().includes(needle) || row.subtitle.toLowerCase().includes(needle);
    });
  }, [rows, term, kindFilter, unreadOnly]);

  const unreadCount = rows.filter((row) => !row.isRead).length;

  const markAll = async () => {
    try {
      const liveIds = rows.filter((row) => !row.markable).map((row) => row.id);
      if (liveIds.length > 0) markSeen(liveIds);
      await markAllNotificationsRead();
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const loading = dashQuery.isLoading || (settings.notify_ready && resQuery.isLoading) || historyQuery.isLoading;
  const absoluteEmpty = rows.length === 0;

  return (
    <div>
      <PageTitle
        title={t("nav.notifications", "Notifications")}
        detail={t("notificationsPage.subtitle", "Overdue loans, due-soon reminders and ready holds in one place.")}
        action={
          unreadCount > 0 ? (
            <button
              onClick={() => void markAll()}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <CheckCheck size={15} />
              {t("notificationsPage.markAllRead", "Mark all as read")}
            </button>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill icon={Bell} label={t("notificationsPage.total", "Total")} value={rows.length} />
        <StatPill icon={BellRing} label={t("notificationsPage.unread", "Unread")} value={unreadCount} />
        <StatPill icon={Clock} label={t("notificationsPage.kindOverdue", "Overdue")} value={rows.filter((r) => r.kind === "overdue").length} tone="danger" />
        <StatPill icon={CalendarClock} label={t("notificationsPage.kindDueSoon", "Due soon")} value={rows.filter((r) => r.kind === "duesoon").length} tone="amber" />
        <StatPill icon={CalendarClock} label={t("notificationsPage.kindReady", "Ready for pickup")} value={rows.filter((r) => r.kind === "ready").length} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-ink/8 bg-white p-3 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <input
          className="field-input max-w-xs"
          placeholder={t("notificationsPage.searchPlaceholder", "Search notifications…")}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <select className="field-select max-w-44" value={kindFilter} onChange={(event) => setKindFilter(event.target.value as "all" | Kind)}>
          <option value="all">{t("notificationsPage.allTypes", "All types")}</option>
          <option value="overdue">{t("notificationsPage.kindOverdue", "Overdue")}</option>
          <option value="duesoon">{t("notificationsPage.kindDueSoon", "Due soon")}</option>
          <option value="ready">{t("notificationsPage.kindReady", "Ready for pickup")}</option>
          <option value="system">{t("notificationsPage.kindSystem", "System")}</option>
        </select>
        <select className="field-select max-w-40" value={unreadOnly ? "unread" : "all"} onChange={(event) => setUnreadOnly(event.target.value === "unread")}>
          <option value="all">{t("notificationsPage.allStatus", "All status")}</option>
          <option value="unread">{t("notificationsPage.unread", "Unread")}</option>
        </select>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-ink/50 dark:text-ivory/50">{t("notificationsPage.loading", "Loading notifications…")}</p>
      ) : filtered.length === 0 ? (
        absoluteEmpty ? (
          <EmptyState
            icon={BellOff}
            title={t("notificationsPage.emptyTitle", "You're all caught up")}
            description={t("notificationsPage.emptyDesc", "No overdue loans, no pending holds, nothing to chase. Enjoy the quiet.")}
          />
        ) : (
          <EmptyState
            icon={Info}
            title={t("notificationsPage.noMatches", "Nothing matches these filters")}
            description={t("notificationsPage.noMatchesDesc", "Try clearing the search box or switching the type filter back to all.")}
          />
        )
      ) : (
        <Table headers={[t("notificationsPage.type", "Type"), t("notificationsPage.details", "Details"), t("notificationsPage.date", "Date")]}>
          {filtered.map((row) => (
            <tr
              key={row.id}
              onClick={row.onOpen}
              className={cn(
                "cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]",
                !row.isRead && "bg-copper/[0.04]",
              )}
            >
              <Cell>
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", row.isRead ? "bg-transparent" : "bg-copper")} />
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", KIND_TONES[row.kind])}>
                    {kindLabel(row.kind, t)}
                  </span>
                </div>
              </Cell>
              <Cell>
                <p className="font-semibold">{row.title || "—"}</p>
                <p className="text-xs text-ink/55 dark:text-ivory/55">{row.subtitle}</p>
              </Cell>
              <Cell className="whitespace-nowrap text-xs text-ink/60 dark:text-ivory/60">{formatDisplayDate(row.date)}</Cell>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
