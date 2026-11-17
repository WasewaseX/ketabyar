import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import {
  cancelReservation,
  deleteMember,
  renewLoan,
  returnCopies,
  updateMember,
} from "../../data/repositories/library";
import type { Loan, Member, MemberStatus, Reservation } from "../../types";
import { dueDate, today } from "../../utils/dates";

/** Archive + status-change mutations for the members desk. */
export function useMemberMutations(deps: {
  t: TFunction;
  invalidate: () => void;
  setSelected: (member: Member | null) => void;
  setSelectedIds: (ids: Set<string>) => void;
}) {
  const archive = useMutation({
    mutationFn: deleteMember,
    onSuccess: () => {
      toast.success(
        deps.t("members.alerts.archived", "Member archived — history retained"),
      );
      deps.setSelected(null);
      deps.setSelectedIds(new Set());
      deps.invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const setStatus = useMutation({
    mutationFn: ({
      member,
      status,
    }: {
      member: Member;
      status: MemberStatus;
    }) => updateMember(member.id, { ...member, status }),
    onSuccess: () => {
      toast.success(deps.t("members.statusUpdated", "Status updated"));
      deps.invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return { archive, setStatus };
}

type ReceiptDraft = {
  kind: "renew" | "return";
  title: string;
  date: string;
  printedAt: string;
};

/** Renew / return / cancel-hold flows that print receipts. */
export function useMemberCirculation(deps: {
  t: TFunction;
  invalidate: () => void;
  setReceipt: (receipt: ReceiptDraft | null) => void;
  loanDays: number;
}) {
  const doRenew = async (loan: Loan) => {
    try {
      await renewLoan(loan.id);
      toast.success(deps.t("circulation.alerts.renewSuccess", "Loan renewed"));
      deps.setReceipt({
        kind: "renew",
        title: loan.title ?? "",
        date: dueDate(deps.loanDays),
        printedAt: today(),
      });
      deps.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doReturn = async (loan: Loan) => {
    try {
      await returnCopies([loan.copy_id]);
      toast.success(
        deps.t("circulation.alerts.returnSuccess", "Item returned"),
      );
      deps.setReceipt({
        kind: "return",
        title: loan.title ?? "",
        date: today(),
        printedAt: today(),
      });
      deps.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const doCancelHold = async (reservation: Reservation) => {
    try {
      await cancelReservation(reservation.id);
      toast.success(
        deps.t("members.alerts.reservationCancelled", "Reservation cancelled"),
      );
      deps.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return { doRenew, doReturn, doCancelHold };
}
