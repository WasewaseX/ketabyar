import type { TFunction } from "i18next";
import { CalendarClock, Check, Trash2, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { DefaultCover } from "../../components/ui/primitives";
import {
  acceptReservation,
  declineReservation,
  deleteReservation,
  extendReservation,
} from "../../data/repositories/library";
import type { Reservation } from "../../types";
import { cn } from "../../utils/cn";
import { formatDisplayDate } from "../../utils/dates";
import { getMemberInitials, MemberStatusBadge } from "../members/memberHelpers";
import { confirmCancelHold } from "./useReservationsData";

type Translate = TFunction<"translation", undefined>;
type Act = (
  action: () => Promise<unknown>,
  successKey: string,
) => Promise<void>;

/** Colored status chip — shared by the table row and the details modal. */
export function reservationStatusChip(status: string, t: Translate) {
  const tones: Record<string, string> = {
    ready: "bg-accent/12 text-accent dark:text-accent-dark",
    queued: "bg-copper/15 text-copper",
    pending: "bg-amber-500/12 text-amber-600",
    declined: "bg-red-600/10 text-red-600",
    fulfilled: "bg-[#2f5d8a]/12 text-[#2f5d8a]",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
        tones[status] ??
          "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55",
      )}
    >
      {t(`reservations.status.${status}`, status)}
    </span>
  );
}

/** One table row of the holds shelf, with its per-status action buttons. */
export function ReservationRow({
  reservation,
  selected,
  onToggle,
  onOpen,
  act,
  confirmAct,
  onContextMenu,
}: {
  reservation: Reservation;
  selected: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  act: Act;
  confirmAct: (
    confirmKey: string,
    values: Record<string, unknown> | undefined,
    action: () => Promise<unknown>,
    successKey: string,
  ) => void;
  onContextMenu: (event: ReactMouseEvent) => void;
}) {
  const { t } = useTranslation();
  return (
    <tr
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("input, button, a, label"))
          return;
        onOpen();
      }}
      onContextMenu={onContextMenu}
      className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
    >
      <td className="border-b border-ink/6 px-3 py-3 dark:border-white/6">
        <input
          type="checkbox"
          aria-label={t(
            "reservations.selectRow",
            "Select reservation {{title}}",
            {
              title: reservation.title ?? "",
            },
          )}
          checked={selected}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <div className="flex items-center gap-3">
          {reservation.cover_path ? (
            <img
              src={reservation.cover_path}
              alt=""
              className="h-10 w-7 rounded object-cover"
            />
          ) : (
            <DefaultCover
              type={reservation.item_type}
              className="h-10 w-7 rounded"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">
              {reservation.title}
            </p>
            <p className="truncate text-[11px] text-ink/50 dark:text-ivory/50">
              {reservation.author}
            </p>
          </div>
        </div>
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-copper text-[10px] font-bold text-white">
            {getMemberInitials(reservation.member_name ?? "")}
          </span>
          <div>
            <p className="text-[13px] font-medium">{reservation.member_name}</p>
            <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">
              {reservation.member_number}
            </p>
          </div>
          {reservation.member_banned ? (
            <MemberStatusBadge status="suspended" iconOnly />
          ) : null}
        </div>
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        {reservation.copy_barcode ? (
          <>
            <p className="font-mono text-xs">{reservation.copy_barcode}</p>
            {reservation.copy_shelf ? (
              <p className="text-[10px] text-ink/50 dark:text-ivory/50">
                {reservation.copy_shelf}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-xs italic text-ink/45 dark:text-ivory/45">
            {t("reservations.autoAssigned", "Auto-assigned")}
          </p>
        )}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 text-xs text-ink/60 dark:border-white/6 dark:text-ivory/60">
        {formatDisplayDate(reservation.requested_at)}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 text-xs dark:border-white/6">
        {reservation.expires_at ? (
          <span className="font-semibold text-amber-600">
            {formatDisplayDate(reservation.expires_at)}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        {reservationStatusChip(reservation.status, t)}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <div className="flex flex-wrap gap-1">
          {reservation.status === "pending" ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void act(
                    () => acceptReservation(reservation.id),
                    "reservations.alerts.accepted",
                  )
                }
                className="rounded-lg bg-accent/10 p-1.5 text-accent dark:text-accent-dark"
                title={t("reservations.accept", "Accept")}
              >
                <Check size={13} />
              </button>
              <button
                type="button"
                onClick={() =>
                  void act(
                    () => declineReservation(reservation.id),
                    "reservations.alerts.declined",
                  )
                }
                className="rounded-lg bg-red-600/10 p-1.5 text-red-600"
                title={t("reservations.decline", "Decline")}
              >
                <X size={13} />
              </button>
            </>
          ) : null}
          {reservation.status === "ready" || reservation.status === "queued" ? (
            <>
              <button
                type="button"
                onClick={() =>
                  void act(
                    () => extendReservation(reservation.id, 7),
                    "reservations.alerts.extended",
                  )
                }
                className="rounded-lg bg-copper/12 p-1.5 text-copper"
                title={t("reservations.extendHold", "Extend +7d")}
              >
                <CalendarClock size={13} />
              </button>
              <button
                type="button"
                onClick={() => confirmCancelHold(confirmAct, reservation.id)}
                className="rounded-lg bg-ink/6 p-1.5 dark:bg-white/10"
                title={t("reservations.cancelRes", "Cancel")}
              >
                <X size={13} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() =>
              confirmAct(
                "reservations.alerts.confirmHardDelete",
                undefined,
                () => deleteReservation(reservation.id),
                "reservations.alerts.deleted",
              )
            }
            className="rounded-lg bg-red-600/10 p-1.5 text-red-600"
            title={t("reservations.deletePermanently", "Delete permanently")}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}
