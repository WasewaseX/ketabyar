import { Ban } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  DefaultCover,
  ItemTypeBadge,
  Modal,
} from "../../components/ui/primitives";
import { updateLoanDueDate } from "../../data/repositories/library";
import type { Loan } from "../../types";
import { formatDisplayDate } from "../../utils/dates";

/** Read-only loan facts, the due-date editor and the renew/return actions. */
export function LoanDetailsModal({
  details,
  dueDraft,
  setDueDraft,
  renewOne,
  doReturn,
  renewLimit,
  invalidate,
  onClose,
}: {
  details: Loan | null;
  dueDraft: string;
  setDueDraft: (value: string) => void;
  renewOne: (loan: Loan) => Promise<void>;
  doReturn: (loans: Loan[]) => Promise<void>;
  renewLimit: number;
  invalidate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen={!!details}
      onClose={onClose}
      title={t("loans.detailsModal.title", "Loan details")}
      size="xl"
    >
      {details ? (
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
              <div className="mt-2 flex flex-wrap gap-1.5">
                <ItemTypeBadge type={details.item_type} />
                <span className="rounded-full bg-ink/6 px-2 py-0.5 font-mono text-[10px] dark:bg-white/8">
                  {details.barcode}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] text-ink/50 dark:text-ivory/50">
                {details.copy_shelf
                  ? t("loans.shelfLabel", "Shelf: {{shelf}}", {
                      shelf: details.copy_shelf,
                    })
                  : t("loans.unassignedShelf", "No shelf assigned")}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-ink/8 p-4 dark:border-white/8">
            <p className="text-[13px] font-bold">{details.member_name}</p>
            <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">
              {details.member_number}
              {details.member_dept ? ` · ${details.member_dept}` : ""}
            </p>
            <dl className="mt-3 space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink/50 dark:text-ivory/50">
                  {t("loans.borrowedOn", "Borrowed on")}
                </dt>
                <dd>{formatDisplayDate(details.borrowed_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50 dark:text-ivory/50">
                  {t("loans.dueOn", "Due on")}
                </dt>
                <dd>{formatDisplayDate(details.due_at)}</dd>
              </div>
              {details.returned_at ? (
                <div className="flex justify-between">
                  <dt className="text-ink/50 dark:text-ivory/50">
                    {t("circulation.returnedOn", "Returned on")}
                  </dt>
                  <dd>{formatDisplayDate(details.returned_at)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink/50 dark:text-ivory/50">
                  {t("loans.renewals", "Renewals")}
                </dt>
                <dd>
                  {details.renewed_count} / {renewLimit}
                </dd>
              </div>
              {details.scope ? (
                <div className="flex justify-between">
                  <dt className="text-ink/50 dark:text-ivory/50">
                    {t("reservations.addModal.scopeLabel", "Scope")}
                  </dt>
                  <dd>
                    {t(`reservations.scope.${details.scope}`, details.scope)}
                  </dd>
                </div>
              ) : null}
            </dl>

            {!details.returned_at ? (
              <div className="mt-3 flex items-end gap-2 border-t border-ink/8 pt-3 dark:border-white/8">
                <label className="flex-1">
                  <span className="text-[11px] font-bold">
                    {t("loans.editDueDate", "Edit due date")}
                  </span>
                  <input
                    type="date"
                    className="field-input"
                    value={dueDraft}
                    onChange={(event) => setDueDraft(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await updateLoanDueDate(
                        details.id,
                        new Date(`${dueDraft}T23:59:59`).toISOString(),
                      );
                      toast.success(
                        t("loans.alerts.dueUpdated", "Due date updated"),
                      );
                      onClose();
                      invalidate();
                    } catch (error) {
                      toast.error(
                        t(
                          "loans.alerts.dueUpdateFailed",
                          "Update failed: {{message}}",
                          {
                            message:
                              error instanceof Error
                                ? error.message
                                : String(error),
                          },
                        ),
                      );
                    }
                  }}
                  className="rounded-xl bg-ink/6 px-3 py-2 text-xs font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
                >
                  {t("common.save", "Save")}
                </button>
              </div>
            ) : null}
          </div>

          {details.notes ? (
            <div className="md:col-span-2 rounded-2xl bg-ink/4 p-3 text-[13px] dark:bg-white/5">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-copper">
                {t("loans.notes", "Notes")}
              </p>
              <p>{details.notes}</p>
            </div>
          ) : null}

          {!details.returned_at ? (
            <div className="flex justify-end gap-2 md:col-span-2">
              <button
                type="button"
                onClick={() => void renewOne(details)}
                disabled={details.renewed_count >= renewLimit}
                className="rounded-xl bg-copper px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                {t("loans.renewLoan", "Renew loan")}
              </button>
              <button
                type="button"
                onClick={() => void doReturn([details])}
                className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-white dark:bg-accent-dark"
              >
                {t("loans.returnItem", "Return item")}
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 md:col-span-2">
              <span className="flex items-center gap-1.5 rounded-full bg-ink/8 px-3 py-1 text-xs font-bold text-ink/55 dark:bg-white/10 dark:text-ivory/55">
                <Ban size={12} /> {t("loans.state.returned", "Returned")}
              </span>
            </div>
          )}
        </div>
      ) : null}
    </Modal>
  );
}
