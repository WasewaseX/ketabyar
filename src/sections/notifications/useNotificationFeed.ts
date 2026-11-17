import type { UseQueryResult } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "../../data/repositories/library";
import { useNotificationsStore } from "../../store/notificationsStore";
import type { AppNotification, Loan, Reservation } from "../../types";

export type Kind = "overdue" | "duesoon" | "ready" | "system";

export type Row = {
  id: string;
  kind: Kind;
  title: string;
  subtitle: string;
  date: string;
  isRead: boolean;
  markable: boolean;
  onOpen: () => void;
};

/** One live row builder — the three live kinds share this exact shape. */
function makeLiveRow(
  kind: Exclude<Kind, "system">,
  loan: Loan | Reservation,
  dateField: string,
  seen: string[],
  markSeen: (ids: string[]) => void,
  navigate: (path: string) => void,
  memberLine: string,
): Row {
  const id = `${kind}-${loan.id}`;
  const title = "title" in loan ? (loan.title ?? "") : "";
  const memberName = "member_name" in loan ? (loan.member_name ?? "") : "";
  return {
    id,
    kind,
    title,
    subtitle: `${memberLine}: ${memberName}`,
    date: dateField,
    isRead: seen.includes(id),
    markable: false,
    onOpen: () => {
      markSeen([id]);
      navigate(kind === "ready" ? "/reservations" : "/members");
    },
  };
}

/**
 * The notification feed: live rows from dashboard/reservation queries plus
 * persisted history rows, filtered by search, kind and read state.
 */
export function useNotificationFeed(deps: {
  settings: {
    notify_overdue: boolean;
    notify_due_soon: boolean;
    notify_ready: boolean;
  };
  dashQuery: UseQueryResult<
    { overdueLoans?: Loan[]; dueSoonLoans?: Loan[] },
    Error
  >;
  resQuery: UseQueryResult<Reservation[], Error>;
  historyQuery: UseQueryResult<AppNotification[], Error>;
  term: string;
  kindFilter: "all" | Kind;
  unreadOnly: boolean;
  t: TFunction;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { seen, markSeen } = useNotificationsStore();
  const { notify_overdue, notify_due_soon, notify_ready } = deps.settings;
  const { t } = deps;
  const dashData = deps.dashQuery.data;
  const resData = deps.resQuery.data;
  const historyData = deps.historyQuery.data;

  const rows = useMemo<Row[]>(() => {
    const overdue = notify_overdue ? (dashData?.overdueLoans ?? []) : [];
    const dueSoon = notify_due_soon ? (dashData?.dueSoonLoans ?? []) : [];
    const ready = notify_ready
      ? (resData ?? []).filter((item: Reservation) => item.status === "ready")
      : [];
    const history = historyData ?? [];

    const memberLine = t("circulation.selectedMember", "Member");

    const live: Row[] = [
      ...overdue.map((loan: Loan) =>
        makeLiveRow(
          "overdue",
          loan,
          loan.due_at,
          seen,
          markSeen,
          navigate,
          memberLine,
        ),
      ),
      ...dueSoon.map((loan: Loan) =>
        makeLiveRow(
          "duesoon",
          loan,
          loan.due_at,
          seen,
          markSeen,
          navigate,
          memberLine,
        ),
      ),
      ...ready.map((item: Reservation) =>
        makeLiveRow(
          "ready",
          item,
          item.reserved_at || item.requested_at,
          seen,
          markSeen,
          navigate,
          memberLine,
        ),
      ),
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
            .then(() =>
              queryClient.invalidateQueries({ queryKey: ["notifications"] }),
            )
            .catch((error: Error) => toast.error(error.message));
        }
        if (item.link) navigate(item.link);
      },
    }));

    return [...live, ...persisted].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  }, [
    dashData,
    historyData,
    markSeen,
    navigate,
    queryClient,
    resData,
    seen,
    notify_due_soon,
    notify_overdue,
    notify_ready,
    t,
  ]);

  const filtered = useMemo(() => {
    const needle = deps.term.trim().toLowerCase();
    return rows.filter((row) => {
      if (deps.kindFilter !== "all" && row.kind !== deps.kindFilter)
        return false;
      if (deps.unreadOnly && row.isRead) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.subtitle.toLowerCase().includes(needle)
      );
    });
  }, [rows, deps.term, deps.kindFilter, deps.unreadOnly]);

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

  return { rows, filtered, unreadCount, markAll };
}
