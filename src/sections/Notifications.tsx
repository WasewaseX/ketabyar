import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  dashboard,
  notifications as fetchNotifications,
  reservations,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../store/librarySettingsStore";
import { NotificationsBody } from "./notifications/NotificationsBody";
import type { Kind } from "./notifications/useNotificationFeed";
import { useNotificationFeed } from "./notifications/useNotificationFeed";

/**
 * Notifications root: the three source queries feed useNotificationFeed;
 * the stats/filters/table render through NotificationsBody.
 */
export function NotificationsPage() {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);

  const [term, setTerm] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | Kind>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const dashQuery = useQuery({
    queryKey: ["dashboard-shell"],
    queryFn: dashboard,
  });
  const resQuery = useQuery({
    queryKey: ["reservations-shell"],
    queryFn: reservations,
    enabled: settings.notify_ready,
  });
  const historyQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => fetchNotifications(200),
  });

  const { rows, filtered, unreadCount, markAll } = useNotificationFeed({
    settings,
    dashQuery,
    resQuery,
    historyQuery,
    term,
    kindFilter,
    unreadOnly,
    t,
  });

  const loading =
    dashQuery.isLoading ||
    (settings.notify_ready && resQuery.isLoading) ||
    historyQuery.isLoading;
  const absoluteEmpty = rows.length === 0;

  return (
    <NotificationsBody
      rows={rows}
      filtered={filtered}
      unreadCount={unreadCount}
      onMarkAll={() => void markAll()}
      loading={loading}
      absoluteEmpty={absoluteEmpty}
      term={term}
      setTerm={setTerm}
      kindFilter={kindFilter}
      setKindFilter={setKindFilter}
      unreadOnly={unreadOnly}
      setUnreadOnly={setUnreadOnly}
    />
  );
}
