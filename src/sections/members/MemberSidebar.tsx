import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Loan, Member, Reservation } from "../../types";
import { cn } from "../../utils/cn";
import { daysLate, formatDisplayDate } from "../../utils/dates";
import { formatMemberNumber } from "../../utils/isbn";
import { getMemberInitials, MemberStatusBadge } from "../Members";

/** Profile / loans / holds panel for the selected member. */
export function MemberSidebar({
  selected,
  sidebarTab,
  setSidebarTab,
  loans,
  holds,
  doRenew,
  doReturn,
  doCancelHold,
  renewLimit,
  onEdit,
  onIdCard,
}: {
  selected: Member;
  sidebarTab: "profile" | "loans" | "holds";
  setSidebarTab: (tab: "profile" | "loans" | "holds") => void;
  loans: Loan[];
  holds: Reservation[];
  doRenew: (loan: Loan) => Promise<void>;
  doReturn: (loan: Loan) => Promise<void>;
  doCancelHold: (reservation: Reservation) => Promise<void>;
  renewLimit: number;
  onEdit: () => void;
  onIdCard: () => void;
}) {
  const { t } = useTranslation();
  return (
    <aside
      key={selected.id}
      className="sticky top-0 w-[340px] shrink-0 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]"
    >
      <div className="flex items-center gap-3 border-b border-ink/8 p-4 dark:border-white/8">
        {selected.avatar_path ? (
          <img
            src={selected.avatar_path}
            alt=""
            className="h-12 w-12 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper text-sm font-bold text-white">
            {getMemberInitials(selected.full_name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{selected.full_name}</p>
          <p className="font-mono text-[11px] text-ink/50 dark:text-ivory/50">
            {formatMemberNumber(selected.member_number)}
          </p>
        </div>
        <MemberStatusBadge status={selected.status} />
      </div>

      <div className="flex border-b border-ink/8 text-[13px] font-semibold dark:border-white/8">
        {(["profile", "loans", "holds"] as const).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => setSidebarTab(key)}
            className={cn(
              "flex-1 py-2.5 transition",
              sidebarTab === key
                ? "border-b-2 border-accent text-accent dark:border-accent-dark dark:text-accent-dark"
                : "text-ink/50 dark:text-ivory/50",
            )}
          >
            {t(`members.tabs.${key}`, key)}
            {key === "loans" && loans
              ? ` (${loans.filter((loan) => !loan.returned_at).length})`
              : ""}
            {key === "holds" && holds ? ` (${holds.length})` : ""}
          </button>
        ))}
      </div>

      <div className="max-h-[62vh] overflow-y-auto p-4">
        {sidebarTab === "profile" ? (
          <>
            <dl className="space-y-2 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-ink/50 dark:text-ivory/50">
                  {t("members.roleLabel", "Role")}
                </dt>
                <dd className="font-medium">
                  {t(
                    `members.roles.${selected.role ?? "other"}`,
                    selected.role ?? "—",
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink/50 dark:text-ivory/50">
                  {t("members.departmentLabel", "Department")}
                </dt>
                <dd className="font-medium">
                  {selected.department || t("members.noDepartment", "—")}
                </dd>
              </div>
              {selected.phone ? (
                <div className="flex justify-between">
                  <dt className="text-ink/50 dark:text-ivory/50">
                    {t("members.phone", "Phone")}
                  </dt>
                  <dd className="font-medium" dir="ltr">
                    {selected.phone}
                  </dd>
                </div>
              ) : null}
              {selected.email ? (
                <div className="flex justify-between gap-3">
                  <dt className="shrink-0 text-ink/50 dark:text-ivory/50">
                    {t("members.email", "Email")}
                  </dt>
                  <dd className="truncate font-medium" dir="ltr">
                    <a
                      href={`mailto:${selected.email}`}
                      className="hover:underline"
                    >
                      {selected.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-ink/50 dark:text-ivory/50">
                  {t("members.registeredOn", "Registered")}
                </dt>
                <dd className="font-medium">
                  {formatDisplayDate(selected.joined_at)}
                </dd>
              </div>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onIdCard}
                className="rounded-xl bg-ink/5 py-2 text-xs font-bold hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
              >
                {t("members.viewIdCard", "View ID card")}
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="flex items-center justify-center gap-1.5 rounded-xl bg-accent py-2 text-xs font-bold text-white dark:bg-accent-dark"
              >
                <Pencil size={12} /> {t("catalog.details.edit", "Edit")}
              </button>
            </div>
          </>
        ) : sidebarTab === "loans" ? (
          (loans ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
              {t("members.noActiveLoans", "No loans on record.")}
            </p>
          ) : (
            <ul className="space-y-2">
              {(loans ?? []).map((loan) => {
                const open = !loan.returned_at;
                const late = open && daysLate(loan.due_at) > 0;
                return (
                  <li
                    key={loan.id}
                    className="rounded-xl border border-ink/8 p-3 dark:border-white/8"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">
                          {loan.title}
                        </p>
                        <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">
                          {loan.barcode}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold",
                          !open
                            ? "bg-ink/8 text-ink/55 dark:bg-white/10 dark:text-ivory/55"
                            : late
                              ? "bg-red-600/10 text-red-600"
                              : "bg-copper/12 text-copper",
                        )}
                      >
                        {open
                          ? late
                            ? t("reports.statusLabels.overdue", "Overdue")
                            : t("reports.statusLabels.onloan", "On loan")
                          : t("reports.statusLabels.returned", "Returned")}
                      </span>
                    </div>
                    {open ? (
                      <>
                        <p
                          className={cn(
                            "mt-1 text-[11px]",
                            late
                              ? "font-bold text-red-600"
                              : "text-ink/60 dark:text-ivory/60",
                          )}
                        >
                          {t("circulation.due", "Due")}:{" "}
                          {formatDisplayDate(loan.due_at)}
                          {late
                            ? ` · ${t("circulation.daysOverdue", "{{count}} days late", { count: daysLate(loan.due_at) })}`
                            : ""}
                        </p>
                        <div className="mt-2 flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => void doRenew(loan)}
                            disabled={loan.renewed_count >= renewLimit}
                            title={
                              loan.renewed_count >= renewLimit
                                ? t(
                                    "circulation.alerts.renewLimitReached",
                                    "Renewal limit reached",
                                  )
                                : undefined
                            }
                            className="flex-1 rounded-lg bg-ink/5 py-1.5 text-[11px] font-bold hover:bg-ink/10 disabled:opacity-40 dark:bg-white/8 dark:hover:bg-white/15"
                          >
                            {t("circulation.renew", "Renew")} (
                            {loan.renewed_count}/{renewLimit})
                          </button>
                          <button
                            type="button"
                            onClick={() => void doReturn(loan)}
                            className="flex-1 rounded-lg bg-accent py-1.5 text-[11px] font-bold text-white dark:bg-accent-dark"
                          >
                            {t("circulation.return", "Return")}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="mt-1 text-[11px] text-ink/50 dark:text-ivory/50">
                        {t("circulation.returnedOn", "Returned")}:{" "}
                        {formatDisplayDate(loan.returned_at ?? "")}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )
        ) : (holds ?? []).length === 0 ? (
          <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
            {t("members.noReservations", "No holds on record.")}
          </p>
        ) : (
          <ul className="space-y-2">
            {(holds ?? []).map((reservation) => (
              <li
                key={reservation.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-ink/8 p-3 dark:border-white/8"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">
                    {reservation.title}
                  </p>
                  <p
                    className={cn(
                      "text-[10px] font-bold",
                      reservation.status === "ready"
                        ? "text-accent dark:text-accent-dark"
                        : "text-copper",
                    )}
                  >
                    {reservation.status}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void doCancelHold(reservation)}
                  className="rounded-lg bg-ink/5 px-2.5 py-1.5 text-[11px] font-bold hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
                >
                  {t("common.cancel", "Cancel")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
