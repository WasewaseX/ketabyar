import { useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
  dashboard,
  notifications as fetchNotifications,
  markNotificationRead,
  reservations,
} from "../../data/repositories/library";
import { useQuery } from "../../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import { useNotificationsStore } from "../../store/notificationsStore";
import { formatDisplayDate } from "../../utils/dates";

/**
 * The header notification bell: owns its own data (dashboard + shell
 * reservations + notification history), derives the badge count from the
 * database unread rows plus the synthetic circulation alerts, and renders
 * the preview dropdown (BellDropdown).
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);

  const dashQuery = useQuery({
    queryKey: ["dashboard-shell"],
    queryFn: dashboard,
  });
  const resQuery = useQuery({
    queryKey: ["reservations-shell"],
    queryFn: reservations,
    enabled: !!settings.notify_ready,
  });
  const historyQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(50),
  });

  const { seen, sync } = useNotificationsStore();
  const [bellOpen, setBellOpen] = useState(false);

  const syntheticAlerts = useMemo(() => {
    const alerts: {
      id: string;
      title: string;
      date: string;
      route: string;
      kind: "overdue" | "duesoon" | "ready";
    }[] = [];
    if (settings.notify_overdue) {
      for (const loan of dashQuery.data?.overdueLoans ?? []) {
        alerts.push({
          id: `overdue-${loan.id}`,
          title: loan.title ?? "",
          date: loan.due_at,
          route: "/members",
          kind: "overdue",
        });
      }
    }
    if (settings.notify_due_soon) {
      for (const loan of dashQuery.data?.dueSoonLoans ?? []) {
        alerts.push({
          id: `duesoon-${loan.id}`,
          title: loan.title ?? "",
          date: loan.due_at,
          route: "/members",
          kind: "duesoon",
        });
      }
    }
    if (settings.notify_ready) {
      for (const reservation of (resQuery.data ?? []).filter(
        (item) => item.status === "ready",
      )) {
        alerts.push({
          id: `ready-${reservation.id}`,
          title: reservation.title ?? "",
          date: reservation.reserved_at || reservation.requested_at,
          route: "/reservations",
          kind: "ready",
        });
      }
    }
    return alerts;
  }, [
    dashQuery.data,
    resQuery.data,
    settings.notify_due_soon,
    settings.notify_overdue,
    settings.notify_ready,
  ]);

  useEffect(() => {
    sync(syntheticAlerts.map((alert) => alert.id));
  }, [syntheticAlerts, sync]);

  const unreadDb = (historyQuery.data ?? []).filter(
    (item) => !item.is_read,
  ).length;
  const unseenSynthetic = syntheticAlerts.filter(
    (alert) => !seen.includes(alert.id),
  ).length;
  const badgeCount = unreadDb + unseenSynthetic;

  const previewRows = useMemo(() => {
    const rows = [
      ...syntheticAlerts.map((alert) => ({ ...alert, isDb: false as const })),
      ...(historyQuery.data ?? []).map((item) => ({
        id: item.id,
        kind: "db" as const,
        title: item.title,
        date: item.created_at,
        route: item.link || "/notifications",
        isDb: true as const,
      })),
    ];
    return rows
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 3);
  }, [syntheticAlerts, historyQuery.data]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setBellOpen((v) => !v)}
        aria-label={t("nav.notifications", "Notifications")}
        className="relative rounded-full p-2.5 text-ink/60 transition hover:bg-ink/5 hover:text-ink dark:text-ivory/60 dark:hover:bg-white/10 dark:hover:text-ivory"
      >
        <Bell size={17} />
        {badgeCount > 0 ? (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-copper px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-[#15211d]">
            {badgeCount}
          </span>
        ) : null}
      </button>

      {bellOpen ? (
        <BellDropdown
          onClose={() => setBellOpen(false)}
          previewRows={previewRows}
          badgeCount={badgeCount}
        />
      ) : null}
    </div>
  );
}

type PreviewRow =
  | {
      id: string;
      title: string;
      date: string;
      route: string;
      isDb: false;
      kind: "overdue" | "duesoon" | "ready";
    }
  | {
      id: string;
      title: string;
      date: string;
      route: string;
      isDb: true;
      kind: "db";
    };

/** The bell's preview dropdown: read the latest rows, mark and navigate. */
function BellDropdown({
  onClose,
  previewRows,
  badgeCount,
}: {
  onClose: () => void;
  previewRows: PreviewRow[];
  badgeCount: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { markSeen } = useNotificationsStore();

  return (
    <>
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("common.close", "Close")}
        className="fixed inset-0 z-30 cursor-default"
        onMouseDown={onClose}
      />
      <div className="absolute end-0 top-full z-40 mt-2 w-80 rounded-2xl border border-ink/10 bg-white p-3 shadow-2xl dark:border-white/10 dark:bg-[#1b2723]">
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-sm font-bold">
            {t("nav.notifications", "Notifications")}
          </p>
          {badgeCount > 0 ? (
            <span className="rounded-full bg-red-600/10 px-2 py-0.5 text-[10px] font-bold text-red-600">
              {t("nav.overdueCount", "{{count}} new", { count: badgeCount })}
            </span>
          ) : null}
        </div>
        {previewRows.length === 0 ? (
          <p className="px-1 py-4 text-center text-sm text-ink/50 dark:text-ivory/50">
            {t("nav.allClear", "You're all caught up")}
          </p>
        ) : (
          <ul className="space-y-1">
            {previewRows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full rounded-xl px-2.5 py-2 text-start transition hover:bg-ink/5 dark:hover:bg-white/5"
                  onClick={() => {
                    onClose();
                    if (row.isDb) {
                      markNotificationRead(row.id).catch(console.error);
                      void queryClient.invalidateQueries({
                        queryKey: ["notifications"],
                      });
                    } else {
                      markSeen([row.id]);
                    }
                    navigate(row.route);
                  }}
                >
                  <p className="truncate text-[13px] font-semibold">
                    {row.title || t("circulation.selectedMember", "Member")}
                  </p>
                  <p className="text-[11px] text-ink/50 dark:text-ivory/50">
                    {row.isDb
                      ? row.title
                      : `${t("circulation.due", "Due")}: ${formatDisplayDate(row.date)}`}
                    {" · "}
                    {formatDisplayDate(row.date)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className="mt-2 w-full rounded-xl border border-ink/10 py-2 text-xs font-semibold text-ink/70 transition hover:bg-ink/5 dark:border-white/10 dark:text-ivory/70 dark:hover:bg-white/5"
          onClick={() => {
            onClose();
            navigate("/notifications");
          }}
        >
          {t("notificationsPage.viewAll", "View all notifications")}
        </button>
      </div>
    </>
  );
}
