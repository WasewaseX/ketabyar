import type { TFunction } from "i18next";
import { Archive, Check, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import {
  acceptReservation,
  banMember,
  cancelReservation,
  declineReservation,
  deleteReservation,
  extendReservation,
} from "../../data/repositories/library";
import type { Reservation } from "../../types";

type Translate = TFunction<"translation", undefined>;
type Act = (
  action: () => Promise<unknown>,
  successKey: string,
) => Promise<void>;

type ConfirmAct = (
  confirmKey: string,
  values: Record<string, unknown> | undefined,
  action: () => Promise<unknown>,
  successKey: string,
) => void;

/**
 * The row context menu for one hold. Built from the reservation's status:
 * pending gets accept/decline, ready gets extend, ready|queued get cancel,
 * and the destructive/clipboard actions are always available.
 */
export function reservationMenuItems(
  reservation: Reservation,
  t: Translate,
  act: Act,
  confirmAct: ConfirmAct,
): ContextMenuItem[] {
  const copyValue = (value: string, toastKey: string) => {
    void navigator.clipboard.writeText(value);
    toast.success(t(toastKey, "Copied"));
  };

  return [
    ...(reservation.status === "pending"
      ? [
          {
            id: "accept",
            label: t("reservations.accept", "Accept"),
            icon: Check,
            variant: "success" as const,
            onClick: () =>
              void act(
                () => acceptReservation(reservation.id),
                "reservations.alerts.accepted",
              ),
          },
          {
            id: "decline",
            label: t("reservations.decline", "Decline"),
            icon: X,
            variant: "danger" as const,
            onClick: () => {
              const reason = window.prompt(
                t("reservations.declineReasonPrompt", "Reason (optional)"),
              );
              if (reason !== null)
                void act(
                  () => declineReservation(reservation.id, reason),
                  "reservations.alerts.declined",
                );
            },
          },
        ]
      : []),
    ...(reservation.status === "ready"
      ? [
          {
            id: "extend",
            label: t("reservations.extendHold", "Extend hold +7 days"),
            onClick: () =>
              void act(
                () => extendReservation(reservation.id, 7),
                "reservations.alerts.extended",
              ),
          },
        ]
      : []),
    ...(reservation.status === "ready" || reservation.status === "queued"
      ? [
          {
            id: "cancel",
            label: t("reservations.cancelRes", "Cancel reservation"),
            onClick: () =>
              confirmAct(
                "reservations.alerts.confirmCancel",
                undefined,
                () => cancelReservation(reservation.id),
                "members.alerts.reservationCancelled",
              ),
          },
        ]
      : []),
    { id: "d", divider: true },
    {
      id: "ban",
      label: t("reservations.banMember", "Ban member from reservations"),
      icon: Archive,
      variant: "danger" as const,
      onClick: () => {
        const reason = window.prompt(
          t("reservations.banReasonPrompt", "Ban reason (required)"),
        );
        if (reason?.trim())
          void act(
            () => banMember(reservation.member_id, reason.trim()),
            "reservations.alerts.banned",
          );
      },
    },
    {
      id: "copyMember",
      label: t("reservations.copyMember", "Copy member name"),
      onClick: () =>
        copyValue(reservation.member_name ?? "", "reservations.copiedMember"),
    },
    ...(reservation.copy_barcode
      ? [
          {
            id: "copyBarcode",
            label: t("reservations.copyBarcodeAction", "Copy barcode"),
            onClick: () =>
              copyValue(
                reservation.copy_barcode ?? "",
                "reservations.copiedBarcode",
              ),
          },
        ]
      : []),
    { id: "d2", divider: true },
    {
      id: "delete",
      label: t("reservations.deleteRes", "Delete permanently"),
      icon: Trash2,
      variant: "danger" as const,
      onClick: () =>
        confirmAct(
          "reservations.alerts.confirmHardDelete",
          undefined,
          () => deleteReservation(reservation.id),
          "reservations.alerts.deleted",
        ),
    },
  ];
}
