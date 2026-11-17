import {
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  CheckCheck,
  Clock,
  Info,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/ui/primitives";
import { Cell, PageTitle, Table } from "../../components/ui/shared";
import { StatPill } from "../../components/ui/widgets";
import { cn } from "../../utils/cn";
import { formatDisplayDate } from "../../utils/dates";
import { KIND_TONES, kindLabel } from "./notificationsShared";
import type { Kind, Row } from "./useNotificationFeed";

/** Stats strip, filter bar and the notifications table. */
export function NotificationsBody({
  rows,
  filtered,
  unreadCount,
  onMarkAll,
  loading,
  absoluteEmpty,
  term,
  setTerm,
  kindFilter,
  setKindFilter,
  unreadOnly,
  setUnreadOnly,
}: {
  rows: Row[];
  filtered: Row[];
  unreadCount: number;
  onMarkAll: () => void;
  loading: boolean;
  absoluteEmpty: boolean;
  term: string;
  setTerm: (value: string) => void;
  kindFilter: "all" | Kind;
  setKindFilter: (kind: "all" | Kind) => void;
  unreadOnly: boolean;
  setUnreadOnly: (value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <PageTitle
        title={t("nav.notifications", "Notifications")}
        detail={t(
          "notificationsPage.subtitle",
          "Overdue loans, due-soon reminders and ready holds in one place.",
        )}
        action={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={onMarkAll}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-ink/5 px-3.5 py-2 text-sm font-semibold transition hover:bg-ink/10 dark:bg-white/5 dark:hover:bg-white/10"
            >
              <CheckCheck size={15} />
              {t("notificationsPage.markAllRead", "Mark all as read")}
            </button>
          ) : null
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill
          icon={Bell}
          label={t("notificationsPage.total", "Total")}
          value={rows.length}
        />
        <StatPill
          icon={BellRing}
          label={t("notificationsPage.unread", "Unread")}
          value={unreadCount}
        />
        <StatPill
          icon={Clock}
          label={t("notificationsPage.kindOverdue", "Overdue")}
          value={rows.filter((r) => r.kind === "overdue").length}
          tone="danger"
        />
        <StatPill
          icon={CalendarClock}
          label={t("notificationsPage.kindDueSoon", "Due soon")}
          value={rows.filter((r) => r.kind === "duesoon").length}
          tone="amber"
        />
        <StatPill
          icon={CalendarClock}
          label={t("notificationsPage.kindReady", "Ready for pickup")}
          value={rows.filter((r) => r.kind === "ready").length}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-ink/8 bg-white p-3 shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <input
          aria-label={t(
            "notificationsPage.searchPlaceholder",
            "Search notifications…",
          )}
          className="field-input max-w-xs"
          placeholder={t(
            "notificationsPage.searchPlaceholder",
            "Search notifications…",
          )}
          value={term}
          onChange={(event) => setTerm(event.target.value)}
        />
        <select
          aria-label={t(
            "notificationsPage.filterKind",
            "Notification type filter",
          )}
          className="field-select max-w-44"
          value={kindFilter}
          onChange={(event) =>
            setKindFilter(event.target.value as "all" | Kind)
          }
        >
          <option value="all">
            {t("notificationsPage.allTypes", "All types")}
          </option>
          <option value="overdue">
            {t("notificationsPage.kindOverdue", "Overdue")}
          </option>
          <option value="duesoon">
            {t("notificationsPage.kindDueSoon", "Due soon")}
          </option>
          <option value="ready">
            {t("notificationsPage.kindReady", "Ready for pickup")}
          </option>
          <option value="system">
            {t("notificationsPage.kindSystem", "System")}
          </option>
        </select>
        <select
          aria-label={t("notificationsPage.filterRead", "Read-state filter")}
          className="field-select max-w-40"
          value={unreadOnly ? "unread" : "all"}
          onChange={(event) => setUnreadOnly(event.target.value === "unread")}
        >
          <option value="all">
            {t("notificationsPage.allStatus", "All status")}
          </option>
          <option value="unread">
            {t("notificationsPage.unread", "Unread")}
          </option>
        </select>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-ink/50 dark:text-ivory/50">
          {t("notificationsPage.loading", "Loading notifications…")}
        </p>
      ) : filtered.length === 0 ? (
        absoluteEmpty ? (
          <EmptyState
            icon={BellOff}
            title={t("notificationsPage.emptyTitle", "You're all caught up")}
            description={t(
              "notificationsPage.emptyDesc",
              "No overdue loans, no pending holds, nothing to chase. Enjoy the quiet.",
            )}
          />
        ) : (
          <EmptyState
            icon={Info}
            title={t(
              "notificationsPage.noMatches",
              "Nothing matches these filters",
            )}
            description={t(
              "notificationsPage.noMatchesDesc",
              "Try clearing the search box or switching the type filter back to all.",
            )}
          />
        )
      ) : (
        <Table
          headers={[
            t("notificationsPage.type", "Type"),
            t("notificationsPage.details", "Details"),
            t("notificationsPage.date", "Date"),
          ]}
        >
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
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      row.isRead ? "bg-transparent" : "bg-copper",
                    )}
                  />
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                      KIND_TONES[row.kind],
                    )}
                  >
                    {kindLabel(row.kind, t)}
                  </span>
                </div>
              </Cell>
              <Cell>
                <p className="font-semibold">{row.title || "—"}</p>
                <p className="text-xs text-ink/55 dark:text-ivory/55">
                  {row.subtitle}
                </p>
              </Cell>
              <Cell className="whitespace-nowrap text-xs text-ink/60 dark:text-ivory/60">
                {formatDisplayDate(row.date)}
              </Cell>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
