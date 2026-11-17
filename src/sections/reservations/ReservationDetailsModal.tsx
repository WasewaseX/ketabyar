import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DefaultCover, Modal } from "../../components/ui/primitives";
import {
  acceptReservation,
  declineReservation,
  extendReservation,
  fulfilReservation,
  updateReservation,
} from "../../data/repositories/library";
import type { Reservation } from "../../types";
import { formatDisplayDate } from "../../utils/dates";
import { reservationStatusChip } from "./ReservationRow";
import { holdCancelAction } from "./useReservationsData";

type Act = (
  action: () => Promise<unknown>,
  successKey: string,
) => Promise<void>;

/** Read-only hold details with the expiry editor and the lifecycle actions. */
export function ReservationDetailsModal({
  details,
  expiryDraft,
  setExpiryDraft,
  act,
  onClose,
}: {
  details: Reservation | null;
  expiryDraft: string;
  setExpiryDraft: (value: string) => void;
  act: Act;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen={!!details}
      onClose={onClose}
      title={t("reservations.detailsModal.title", "Reservation details")}
      size="xl"
    >
      {details ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-ivory p-3 dark:bg-white/5">
            {reservationStatusChip(details.status, t)}
            <span className="rounded-full bg-ink/6 px-2.5 py-0.5 text-[11px] font-bold dark:bg-white/10">
              {t(`reservations.scope.${details.scope}`, details.scope)}
            </span>
            {details.status === "queued" ? (
              <span className="rounded-full bg-copper/15 px-2.5 py-0.5 text-[11px] font-bold text-copper">
                {t(
                  "reservations.queuePosition",
                  "Queue position #{{position}}",
                  { position: details.position || 1 },
                )}
              </span>
            ) : null}
            <span className="ms-auto font-mono text-[10px] text-ink/40 dark:text-ivory/40">
              {details.id.slice(0, 8)}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex gap-3 rounded-2xl border border-ink/8 p-4 dark:border-white/8">
              {details.cover_path ? (
                <img
                  src={details.cover_path}
                  alt=""
                  className="h-24 w-16 rounded-lg object-cover"
                />
              ) : (
                <DefaultCover
                  type={details.item_type}
                  className="h-24 w-16 rounded-lg"
                  iconSize={24}
                />
              )}
              <div className="min-w-0">
                <p className="font-display text-sm font-bold leading-snug">
                  {details.title}
                </p>
                {details.subtitle ? (
                  <p className="text-xs text-ink/55 dark:text-ivory/55">
                    {details.subtitle}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-ink/60 dark:text-ivory/60">
                  {details.author}
                </p>
                <p className="mt-2 text-[11px] text-ink/50 dark:text-ivory/50">
                  {details.copy_shelf
                    ? `${t("loans.shelfLabel", "Shelf")}: ${details.copy_shelf}`
                    : t("reservations.unassignedShelf", "Unassigned shelf")}
                  {details.copy_barcode ? ` · ${details.copy_barcode}` : ""}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-ink/8 p-4 dark:border-white/8">
              <p className="text-[13px] font-bold">{details.member_name}</p>
              <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">
                {details.member_number}
              </p>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between">
                  <dt className="text-ink/50 dark:text-ivory/50">
                    {t("reservations.detailsModal.requestDate", "Requested")}
                  </dt>
                  <dd>{formatDisplayDate(details.requested_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-ink/50 dark:text-ivory/50">
                    {t("reservations.detailsModal.expiresOn", "Hold expires")}
                  </dt>
                  <dd>
                    {details.expires_at
                      ? formatDisplayDate(details.expires_at)
                      : "—"}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex items-end gap-2 border-t border-ink/8 pt-3 dark:border-white/8">
                <label className="flex-1">
                  <span className="text-[11px] font-bold">
                    {t("reservations.editExpiry", "Edit expiry")}
                  </span>
                  <input
                    type="date"
                    className="field-input"
                    value={expiryDraft}
                    onChange={(event) => setExpiryDraft(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      () =>
                        updateReservation(details.id, {
                          expiresAt: expiryDraft
                            ? new Date(`${expiryDraft}T23:59:59`).toISOString()
                            : null,
                        }),
                      "reservations.alerts.updated",
                    )
                  }
                  className="rounded-xl bg-ink/6 px-3 py-2 text-xs font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
                >
                  <Pencil size={12} /> {t("common.save", "Save")}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            {details.status === "pending" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void act(
                      () => acceptReservation(details.id),
                      "reservations.alerts.accepted",
                    );
                    onClose();
                  }}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white dark:bg-accent-dark"
                >
                  {t("reservations.accept", "Accept")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void act(
                      () => declineReservation(details.id),
                      "reservations.alerts.declined",
                    );
                    onClose();
                  }}
                  className="rounded-xl bg-red-600/10 px-4 py-2 text-sm font-bold text-red-600"
                >
                  {t("reservations.decline", "Decline")}
                </button>
              </>
            ) : null}
            {details.status === "ready" ? (
              <button
                type="button"
                onClick={() => {
                  void act(
                    () => fulfilReservation(details.id),
                    "reservations.alerts.pickedUp",
                  );
                  onClose();
                }}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white dark:bg-accent-dark"
              >
                {t("reservations.markPickedUp", "Mark as picked up")}
              </button>
            ) : null}
            {details.status === "ready" || details.status === "queued" ? (
              <>
                <button
                  type="button"
                  onClick={() =>
                    void act(
                      () => extendReservation(details.id, 7),
                      "reservations.alerts.extended",
                    )
                  }
                  className="rounded-xl bg-copper px-4 py-2 text-sm font-bold text-white"
                >
                  {t("reservations.extendHold", "Extend hold")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void act(
                      holdCancelAction(details.id),
                      "members.alerts.reservationCancelled",
                    );
                    onClose();
                  }}
                  className="rounded-xl bg-ink/6 px-4 py-2 text-sm font-bold dark:bg-white/10"
                >
                  {t("reservations.cancelReservation", "Cancel reservation")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
