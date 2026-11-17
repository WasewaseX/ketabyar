import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "../../components/ui/primitives";
import type { Book, Copy, Member, ReservationScope } from "../../types";
import { cn } from "../../utils/cn";
import {
  type VisitorDraft,
  WizardStepItem,
  WizardStepMember,
} from "./WizardStepsA";

/** Wizard step 3 — optionally pin a specific copy (advisory). */
export function WizardStepCopy({
  selectedBook,
  copyChoice,
  setCopyChoice,
  copies,
}: {
  selectedBook: Book | null;
  copyChoice: string;
  setCopyChoice: (id: string) => void;
  copies: Copy[];
}) {
  const { t } = useTranslation();
  return (
    <div>
      {selectedBook ? (
        <p className="mb-3 rounded-xl bg-ivory px-3 py-2 text-xs text-ink/60 dark:bg-white/5 dark:text-ivory/60">
          {t(
            "reservations.addModal.copyTotals",
            "{{total}} physical copies · {{available}} available right now",
            {
              total: selectedBook.total_copies ?? 0,
              available: selectedBook.available_copies ?? 0,
            },
          )}
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => setCopyChoice("")}
        className={cn(
          "mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-start transition",
          copyChoice === ""
            ? "border-accent bg-accent/8 dark:border-accent-dark"
            : "border-ink/8 dark:border-white/8",
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/12 text-accent dark:text-accent-dark">
          <Check size={16} />
        </span>
        <span>
          <span className="block text-[13px] font-bold">
            {t("reservations.addModal.anyAvailableCopy", "Any available copy")}
          </span>
          <span className="block text-[11px] text-ink/50 dark:text-ivory/50">
            {t(
              "reservations.addModal.anyAvailableDesc",
              "Recommended — the system binds a free copy when the hold becomes ready.",
            )}
          </span>
        </span>
      </button>
      <ul className="max-h-56 space-y-1.5 overflow-y-auto">
        {copies.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink/50 dark:text-ivory/50">
            {t(
              "reservations.addModal.noCopiesFound",
              "This title has no physical copies yet.",
            )}
          </p>
        ) : (
          copies.map((copy: Copy) => (
            <li key={copy.id}>
              <button
                type="button"
                onClick={() => setCopyChoice(copy.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition",
                  copyChoice === copy.id
                    ? "border-accent bg-accent/8 dark:border-accent-dark"
                    : "border-ink/8 hover:border-ink/20 dark:border-white/8",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[12px] font-bold">
                    {copy.barcode}
                  </span>
                  <span className="block text-[11px] text-ink/50 dark:text-ivory/50">
                    {copy.shelf
                      ? `${t("loans.shelfLabel", "Shelf")}: ${copy.shelf}`
                      : t("reservations.unassignedShelf", "Unassigned shelf")}
                    {" · "}
                    {t("reservations.addModal.copyIndex", "Index")}:{" "}
                    {copy.accession_number}
                    {" · "}
                    {t("reservations.addModal.copyCondition", "Condition")}:{" "}
                    {t(`catalog.condition.${copy.condition}`, copy.condition)}
                  </span>
                </span>
                <StatusBadge value={copy.status} />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Wizard step 4 — scope, expiry and the summary review. */
export function WizardStepDuration({
  activeScope,
  setScope,
  externalBlocked,
  memberMode,
  visitor,
  memberId,
  allMembers,
  selectedBook,
  copyChoice,
  copies,
  expires,
  setExpires,
  settings,
}: {
  activeScope: ReservationScope;
  setScope: (scope: ReservationScope) => void;
  externalBlocked: boolean;
  memberMode: "registered" | "visitor";
  visitor: VisitorDraft;
  memberId: string;
  allMembers: Member[];
  selectedBook: Book | null;
  copyChoice: string;
  copies: Copy[];
  expires: string;
  setExpires: (value: string) => void;
  settings: {
    reservation_hold_days: number;
    reservation_internal_days: number;
    loan_days: number;
  };
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={() => setScope("internal")}
          disabled={externalBlocked && false}
          className={cn(
            "rounded-2xl border p-4 text-start transition",
            activeScope === "internal"
              ? "border-accent bg-accent/8 dark:border-accent-dark"
              : "border-ink/10 dark:border-white/10",
          )}
        >
          <p className="text-sm font-bold">
            {t(
              "reservations.scope.internal",
              "Internal — stays in the library",
            )}
          </p>
          <p className="mt-1 text-[11px] text-ink/55 dark:text-ivory/55">
            {t(
              "reservations.scopeInternalDesc",
              "Reading-room loan for {{days}} day(s).",
              { days: settings.reservation_internal_days },
            )}
          </p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (!externalBlocked) setScope("external");
          }}
          disabled={externalBlocked}
          className={cn(
            "rounded-2xl border p-4 text-start transition",
            externalBlocked && "cursor-not-allowed opacity-45",
            activeScope === "external"
              ? "border-accent bg-accent/8 dark:border-accent-dark"
              : "border-ink/10 dark:border-white/10",
          )}
        >
          <p className="text-sm font-bold">
            {t("reservations.scope.external", "External — taken home")}
          </p>
          <p className="mt-1 text-[11px] text-ink/55 dark:text-ivory/55">
            {externalBlocked
              ? memberMode === "visitor"
                ? t(
                    "reservations.addModal.visitorsInternalOnly",
                    "Visitors can only borrow internal.",
                  )
                : t(
                    "reservations.addModal.singleCopyInternalOnly",
                    "Single-copy titles are internal-only.",
                  )
              : t(
                  "reservations.scopeExternalDesc",
                  "Take-home loan for {{days}} day(s).",
                  { days: settings.loan_days },
                )}
          </p>
        </button>
      </div>

      <label className="mb-4 block max-w-xs">
        <span>{t("reservations.addModal.expiryLabel", "Hold expires on")}</span>
        <input
          type="date"
          className="field-input"
          value={expires}
          onChange={(event) => setExpires(event.target.value)}
        />
        <span className="mt-1 block text-[11px] text-ink/45 dark:text-ivory/45">
          {t(
            "reservations.addModal.expiryHint",
            "After this date an uncollected hold expires automatically.",
          )}
        </span>
      </label>

      <div className="rounded-2xl bg-ivory p-4 text-[13px] dark:bg-white/5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-copper">
          {t("reservations.addModal.summaryTitle", "Summary")}
        </p>
        <div className="grid gap-1.5 md:grid-cols-2">
          <p>
            <b>{t("reservations.addModal.summaryMember", "Member")}:</b>{" "}
            {memberMode === "visitor"
              ? `${visitor.name} (${t("reservations.guest", "Guest")})`
              : allMembers.find((member) => member.id === memberId)?.full_name}
          </p>
          <p>
            <b>{t("reservations.addModal.summaryItem", "Item")}:</b>{" "}
            {selectedBook?.title}
          </p>
          <p>
            <b>{t("reservations.copyBarcode", "Copy")}:</b>{" "}
            {copyChoice
              ? copies.find((copy) => copy.id === copyChoice)?.barcode
              : t("reservations.autoAssigned", "Auto-assigned")}
          </p>
          <p>
            <b>{t("reservations.addModal.scopeLabel", "Scope")}:</b>{" "}
            {t(`reservations.scope.${activeScope}`, activeScope)}
          </p>
        </div>
        <p className="mt-2 text-[11px] text-ink/45 dark:text-ivory/45">
          {t(
            "reservations.addModal.approvalHint",
            "Staff-created holds are accepted immediately; the loan duration follows the scope.",
          )}
        </p>
      </div>
    </div>
  );
}

/**
 * Renders the step matching the current wizard position. One dispatcher so
 * the shell stays a coordinator instead of a prop-thicket.
 */
export function WizardStepBody(props: WizardStepProps) {
  const { step } = props;
  return step === 0 ? (
    <WizardStepMember {...props} />
  ) : step === 1 ? (
    <WizardStepItem {...props} />
  ) : step === 2 ? (
    <WizardStepCopy {...props} />
  ) : (
    <WizardStepDuration {...props} />
  );
}

export type WizardStepProps = {
  step: number;
  setStep: (step: number) => void;
  memberMode: "registered" | "visitor";
  setMemberMode: (mode: "registered" | "visitor") => void;
  memberId: string;
  setMemberId: (id: string) => void;
  memberTerm: string;
  setMemberTerm: (term: string) => void;
  memberDept: string;
  setMemberDept: (dept: string) => void;
  memberRole: string;
  setMemberRole: (role: string) => void;
  departments: string[];
  memberOptions: Member[];
  visitor: VisitorDraft;
  setVisitor: (visitor: VisitorDraft) => void;
  itemTerm: string;
  setItemTerm: (term: string) => void;
  itemCategory: string;
  setItemCategory: (category: string) => void;
  itemType: string;
  setItemType: (type: string) => void;
  availability: "all" | "available" | "out";
  setAvailability: (value: "all" | "available" | "out") => void;
  categories: string[];
  itemOptions: Book[];
  bookId: string;
  setBookId: (id: string) => void;
  copyChoice: string;
  setCopyChoice: (id: string) => void;
  selectedBook: Book | null;
  copies: Copy[];
  activeScope: ReservationScope;
  setScope: (scope: ReservationScope) => void;
  externalBlocked: boolean;
  allMembers: Member[];
  expires: string;
  setExpires: (value: string) => void;
  settings: {
    reservation_hold_days: number;
    reservation_internal_days: number;
    loan_days: number;
  };
};
