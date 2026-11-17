import { useMemo } from "react";
import { toast } from "sonner";
import { cancelReservation } from "../../data/repositories/library";
import type { Reservation } from "../../types";

/** Stable empty array — keeps the filter memos from re-running every render. */
const NO_RESERVATIONS: Reservation[] = [];

/** Search/filter/sort pipeline + status pill counts for the holds shelf. */
export function useReservationFilters(
  all: Reservation[] | undefined,
  term: string,
  statusFilter: "all" | "ready" | "queued" | "cancelled",
) {
  const rows = all ?? NO_RESERVATIONS;
  const visible = useMemo(() => {
    const needle = term.trim().toLowerCase();
    return rows
      .filter((reservation) => {
        if (statusFilter !== "all" && reservation.status !== statusFilter)
          return false;
        if (!needle) return true;
        return [
          reservation.title,
          reservation.member_name,
          reservation.copy_barcode,
          reservation.copy_shelf,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at));
  }, [rows, statusFilter, term]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      ready: rows.filter((item) => item.status === "ready").length,
      queued: rows.filter((item) => item.status === "queued").length,
      cancelled: rows.filter(
        (item) =>
          item.status === "cancelled" ||
          item.status === "declined" ||
          item.status === "expired",
      ).length,
    }),
    [rows],
  );

  return { visible, counts };
}

import type { TFunction } from "i18next";

type Translate = TFunction<"translation", undefined>;

/** Mutation closure that cancels one hold — shared by row, menu and modal. */
export function holdCancelAction(
  reservationId: string,
): () => Promise<unknown> {
  return () => cancelReservation(reservationId);
}

/** The shared "run a hold mutation, toast, refresh" runner + confirm variant. */
export function useHoldActions(t: Translate, invalidate: () => void) {
  const act = async (action: () => Promise<unknown>, successKey: string) => {
    try {
      await action();
      toast.success(t(successKey, "Done"));
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const confirmAct = (
    confirmKey: string,
    values: Record<string, unknown> | undefined,
    action: () => Promise<unknown>,
    successKey: string,
  ) => {
    const confirmed = values
      ? window.confirm(t(confirmKey, "Are you sure?", values))
      : window.confirm(t(confirmKey, "Are you sure?"));
    if (!confirmed) return;
    void act(action, successKey);
  };

  return { act, confirmAct };
}
