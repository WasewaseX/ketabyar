import { useQueryClient } from "@tanstack/react-query";
import { CircleDollarSign, Eye } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal } from "../../components/ui/primitives";
import type { FineRow } from "../../data/repositories/library";
import { fines, payFine, waiveFine } from "../../data/repositories/library";
import { useQuery } from "../../hooks/useLibraryQuery";
import { formatDisplayCurrency } from "../../utils/currency";

/** Open fines strip: pay / waive / jump to the loan behind the fine. */
export function FinesPanel({
  onManage,
}: {
  onManage: (fine: FineRow) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [waiving, setWaiving] = useState<FineRow | null>(null);
  const [waiveReason, setWaiveReason] = useState("");

  const finesQuery = useQuery({ queryKey: ["fines"], queryFn: fines });
  const openFines = (finesQuery.data ?? []).filter(
    (fine) => fine.status === "open",
  );
  if (openFines.length === 0) return null;

  const total = openFines.reduce((sum, fine) => sum + fine.amount, 0);
  const visible = showAll ? openFines : openFines.slice(0, 3);

  // Blanket invalidation (v1.2.5 audit): the app's other mutations invalidate
  // everything; the previous targeted keys missed ["loans-reports"] and the
  // shell queries, leaving stale counts on Reports and the sidebar.
  const invalidate = () => {
    void queryClient.invalidateQueries();
  };

  const pay = async (fine: FineRow) => {
    try {
      await payFine(fine.id);
      toast.success(t("loans.fines.paid", "Fine marked as paid"));
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const waive = async () => {
    if (!waiving) return;
    try {
      await waiveFine(waiving.id, waiveReason.trim() || "-");
      toast.success(t("loans.fines.waived", "Fine waived"));
      setWaiving(null);
      setWaiveReason("");
      invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="mb-5 rounded-[var(--radius-card)] border border-amber-500/30 bg-amber-500/[0.06] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleDollarSign size={17} className="text-amber-600" />
          <p className="text-sm font-bold">
            {t("loans.fines.title", "Open fines")}
          </p>
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600">
            {t("loans.fines.openCount", "{{count}} open", {
              count: openFines.length,
            })}
          </span>
        </div>
        <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
          {t("loans.fines.totalOpen", "Total open: {{amount}}", {
            amount: formatDisplayCurrency(total),
          })}
        </p>
      </div>
      <ul className="space-y-1.5">
        {visible.map((fine) => (
          <li
            key={fine.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 text-[13px] dark:bg-white/5"
          >
            <div className="min-w-0">
              <p className="font-semibold">{fine.member_name}</p>
              <p className="truncate text-[11px] text-ink/55 dark:text-ivory/55">
                {fine.title ?? ""} — {fine.reason}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-amber-700 dark:text-amber-400">
                {formatDisplayCurrency(fine.amount)}
              </span>
              <button
                type="button"
                onClick={() => void pay(fine)}
                className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-bold text-white dark:bg-accent-dark"
              >
                {t("loans.fines.pay", "Mark paid")}
              </button>
              <button
                type="button"
                onClick={() => setWaiving(fine)}
                className="rounded-lg bg-ink/6 px-2.5 py-1 text-[11px] font-bold hover:bg-ink/12 dark:bg-white/10 dark:hover:bg-white/20"
              >
                {t("loans.fines.waive", "Waive")}
              </button>
              <button
                type="button"
                onClick={() => onManage(fine)}
                className="rounded-lg p-1 text-ink/45 hover:text-ink dark:text-ivory/45 dark:hover:text-ivory"
                aria-label={t("loans.viewDetails", "View")}
              >
                <Eye size={14} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {openFines.length > 3 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400"
        >
          {showAll
            ? t("loans.fines.showLess", "Show less")
            : t("loans.fines.showAll", "Show all {{count}}", {
                count: openFines.length,
              })}
        </button>
      ) : null}

      {waiving ? (
        <Modal
          isOpen
          onClose={() => setWaiving(null)}
          title={t("loans.fines.waive", "Waive fine")}
          size="md"
        >
          <p className="text-sm">
            {waiving.member_name} ·{" "}
            <b>{formatDisplayCurrency(waiving.amount)}</b>
          </p>
          <textarea
            className="field-input mt-3"
            rows={2}
            aria-label={t(
              "loans.fines.waiveReasonPlaceholder",
              "Reason (optional)",
            )}
            placeholder={t(
              "loans.fines.waiveReasonPlaceholder",
              "Reason (optional)",
            )}
            value={waiveReason}
            onChange={(event) => setWaiveReason(event.target.value)}
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setWaiving(null)}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60"
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              type="button"
              onClick={() => void waive()}
              className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white"
            >
              {t("loans.fines.waive", "Waive")}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
