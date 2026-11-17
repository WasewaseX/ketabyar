import type { TFunction } from "i18next";
import { Eye, RefreshCcw, RotateCcw } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { DefaultCover } from "../../components/ui/primitives";
import type { Loan } from "../../types";
import { cn } from "../../utils/cn";
import { formatDisplayDate } from "../../utils/dates";
import {
  daysOverdue,
  daysUntilDue,
  loanStateLabel,
  stateTone,
} from "./loanUtils";

type Entry = { loan: Loan; state: string };

/** Context menu for one loan: return, renew, details, clipboard helpers. */
export function loanMenuItems(
  loan: Loan,
  state: string,
  t: TFunction,
  doReturn: (loans: Loan[]) => Promise<void>,
  renewOne: (loan: Loan) => Promise<void>,
  onOpen: () => void,
): ContextMenuItem[] {
  return [
    ...(state !== "returned"
      ? [
          {
            id: "return",
            label: t("loans.returnItem", "Return item"),
            onClick: () => void doReturn([loan]),
          },
        ]
      : []),
    ...(state !== "returned"
      ? [
          {
            id: "renew",
            label: t("loans.renewLoan", "Renew loan"),
            onClick: () => void renewOne(loan),
          },
        ]
      : []),
    {
      id: "view",
      label: t("loans.viewDetails", "View loan details"),
      icon: Eye,
      onClick: onOpen,
    },
    { id: "d", divider: true },
    {
      id: "copyMember",
      label: t("loans.copyMember", "Copy member name"),
      onClick: () => {
        void navigator.clipboard.writeText(loan.member_name ?? "");
        toast.success(t("loans.copiedMember", "Member name copied"));
      },
    },
    {
      id: "copyBarcode",
      label: t("loans.copyBarcode", "Copy barcode"),
      onClick: () => {
        void navigator.clipboard.writeText(loan.barcode ?? "");
        toast.success(t("loans.copiedBarcode", "Barcode copied"));
      },
    },
  ];
}

/** One row of the loans table with its status pill and quick actions. */
export function LoanRow({
  entry,
  selected,
  renewLimit,
  onToggle,
  onOpen,
  doReturn,
  renewOne,
  showContextMenu,
}: {
  entry: Entry;
  selected: boolean;
  renewLimit: number;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  doReturn: (loans: Loan[]) => Promise<void>;
  renewOne: (loan: Loan) => Promise<void>;
  showContextMenu: (
    event: ReactMouseEvent,
    items: ContextMenuItem[],
    options?: { title?: string },
  ) => void;
}) {
  const { t } = useTranslation();
  const { loan, state } = entry;
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
      onContextMenu={(event) =>
        showContextMenu(
          event,
          loanMenuItems(loan, state, t, doReturn, renewOne, onOpen),
          { title: loan.title ?? "" },
        )
      }
      className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
    >
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            aria-label={t("loans.selectRow", "Select loan {{title}}", {
              title: loan.title,
            })}
            checked={selected}
            onChange={(event) => onToggle(event.target.checked)}
          />
          {loan.cover_path ? (
            <img
              src={loan.cover_path}
              alt=""
              className="h-10 w-7 rounded object-cover"
            />
          ) : (
            <DefaultCover type={loan.item_type} className="h-10 w-7 rounded" />
          )}
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{loan.title}</p>
            <p className="truncate text-[11px] text-ink/50 dark:text-ivory/50">
              {loan.author}
            </p>
          </div>
        </div>
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <p className="text-[13px] font-medium">{loan.member_name}</p>
        <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">
          {loan.member_number}
        </p>
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <p className="font-mono text-xs">{loan.barcode}</p>
        {loan.copy_shelf ? (
          <p className="text-[10px] text-ink/50 dark:text-ivory/50">
            {loan.copy_shelf}
          </p>
        ) : null}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 text-xs text-ink/60 dark:border-white/6 dark:text-ivory/60">
        {formatDisplayDate(loan.borrowed_at)}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <p
          className={cn(
            "text-[13px] font-semibold",
            state === "overdue" && "text-red-600",
            state === "dueSoon" && "text-amber-600",
          )}
        >
          {formatDisplayDate(loan.due_at)}
        </p>
        {state === "overdue" ? (
          <p className="text-[10px] font-bold text-red-600">
            {t("circulation.daysOverdue", "{{count}} days overdue", {
              count: daysOverdue(loan),
            })}
          </p>
        ) : null}
        {state === "dueSoon" ? (
          <p className="text-[10px] font-bold text-amber-600">
            {t("loans.dueInDays", "due in {{count}} day(s)", {
              count: daysUntilDue(loan),
            })}
          </p>
        ) : null}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
            stateTone[state as keyof typeof stateTone],
          )}
        >
          {loanStateLabel(state as "active", t)}
        </span>
        {loan.renewed_count > 0 ? (
          <p className="mt-0.5 text-[10px] text-ink/50 dark:text-ivory/50">
            {t("loans.renewedTimes", "renewed {{count}}×", {
              count: loan.renewed_count,
            })}
          </p>
        ) : null}
      </td>
      <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
        {state !== "returned" ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void doReturn([loan])}
              className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
              title={t("loans.returnItem", "Return item")}
            >
              <RotateCcw size={13} />
            </button>
            <button
              type="button"
              onClick={() => void renewOne(loan)}
              disabled={loan.renewed_count >= renewLimit}
              title={
                loan.renewed_count >= renewLimit
                  ? t("loans.renewLimitReached", "Renewal limit reached")
                  : undefined
              }
              className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 disabled:opacity-40 dark:bg-white/8 dark:hover:bg-white/15"
            >
              <RefreshCcw size={13} />
            </button>
          </div>
        ) : null}
      </td>
    </tr>
  );
}
