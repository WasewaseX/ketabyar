import { useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal } from "../../components/ui/primitives";
import {
  acceptReservation,
  addReservation,
  books as fetchBooks,
  members as fetchMembers,
  getCopiesForBook,
  saveMember,
  updateReservation,
} from "../../data/repositories/library";
import { useQuery } from "../../hooks/useLibraryQuery";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import type { Book, Member, ReservationScope } from "../../types";
import { cn } from "../../utils/cn";
import { dueDate } from "../../utils/dates";
import {
  cleanPhone,
  cleanText,
  generateRandomMemberNumber,
} from "../../utils/isbn";
import type { VisitorDraft } from "./WizardStepsA";
import { WizardStepBody, type WizardStepProps } from "./WizardStepsB";

/** Stable empties for the wizard memos — never recreated per render. */
const EMPTY_MEMBERS: Member[] = [];
const EMPTY_BOOKS: Book[] = [];

/** Numbered progress indicator across the four wizard steps. */
function WizardStepper({ steps, step }: { steps: string[]; step: number }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {steps.map((label, index) => (
        <div key={label} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              index === step
                ? "bg-accent text-white dark:bg-accent-dark"
                : index < step
                  ? "bg-accent/15 text-accent dark:text-accent-dark"
                  : "bg-ink/8 text-ink/45 dark:bg-white/10 dark:text-ivory/45",
            )}
          >
            {index < step ? <Check size={13} /> : index + 1}
          </span>
          <span
            className={cn(
              "hidden text-xs font-semibold sm:block",
              index === step ? "" : "text-ink/45 dark:text-ivory/45",
            )}
          >
            {label}
          </span>
          {index < steps.length - 1 ? (
            <span className="h-px flex-1 bg-ink/10 dark:bg-white/10" />
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Back / Next / Create controls along the bottom of the wizard. */
function WizardFooter({
  step,
  canNext,
  submitting,
  onClose,
  onBack,
  onNext,
  onSubmit,
}: {
  step: number;
  canNext: boolean;
  submitting: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mt-5 flex justify-between border-t border-ink/8 pt-4 dark:border-white/8">
      <button
        type="button"
        onClick={() => (step === 0 ? onClose() : onBack())}
        className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5"
      >
        {step === 0
          ? t("common.cancel", "Cancel")
          : t("reservations.addModal.back", "Back")}
      </button>
      {step < 3 ? (
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark"
        >
          {t("reservations.addModal.next", "Next")}
        </button>
      ) : (
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark"
        >
          {submitting
            ? t("reservations.addModal.submitting", "Creating…")
            : t("reservations.addModal.submit", "Create reservation")}
        </button>
      )}
    </div>
  );
}

/** Create the reservation: visitors get a guest profile, expiry is applied. */
async function createReservationFromWizard(deps: {
  t: ReturnType<typeof useTranslation>["t"];
  memberMode: "registered" | "visitor";
  memberId: string;
  visitor: VisitorDraft;
  expires: string;
  activeScope: ReservationScope;
  bookId: string;
  allMembers: Member[];
  queryClient: ReturnType<typeof useQueryClient>;
  onClose: () => void;
}): Promise<void> {
  const {
    t,
    memberMode,
    memberId,
    visitor,
    expires,
    activeScope,
    bookId,
    allMembers,
    queryClient,
    onClose,
  } = deps;
  let finalMemberId = memberId;
  if (memberMode === "visitor") {
    const name = cleanText(visitor.name);
    if (!name)
      throw new Error(
        t("reservations.alerts.fillVisitorName", "The visitor needs a name."),
      );
    const created = await saveMember({
      full_name: name,
      member_number: `VIS-${generateRandomMemberNumber(6)}`,
      email: visitor.email || null,
      phone: visitor.phone ? cleanPhone(visitor.phone) : null,
      role: "visitor",
      department: visitor.dept || t("reservations.visitor", "Visitor"),
      status: "active",
    } as Parameters<typeof saveMember>[0]);
    finalMemberId = created.id;
  }
  const reservationId = await addReservation(
    bookId,
    finalMemberId,
    activeScope,
  );
  await acceptReservation(reservationId);
  await updateReservation(reservationId, {
    expiresAt: new Date(`${expires}T23:59:59`).toISOString(),
  });
  const name =
    memberMode === "visitor"
      ? visitor.name
      : (allMembers.find((member) => member.id === memberId)?.full_name ?? "");
  toast.success(
    t(
      "reservations.alerts.reservationCreated",
      "Reservation created for {{name}}",
      { name },
    ),
  );
  void queryClient.invalidateQueries();
  onClose();
}

/**
 * All wizard flow state: step position, the member/item/copy/duration
 * answers, the filtered option lists and the submit action.
 */
function useWizardState() {
  const settings = useLibrarySettingsStore((state) => state.settings);

  const [step, setStep] = useState(0);
  const [memberMode, setMemberMode] = useState<"registered" | "visitor">(
    "registered",
  );
  const [memberTerm, setMemberTerm] = useState("");
  const [memberDept, setMemberDept] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberId, setMemberId] = useState("");
  const [visitor, setVisitor] = useState<VisitorDraft>({
    name: "",
    email: "",
    phone: "",
    dept: "",
  });

  const [itemTerm, setItemTerm] = useState("");
  const [itemCategory, setItemCategory] = useState("");
  const [itemType, setItemType] = useState("");
  const [availability, setAvailability] = useState<"all" | "available" | "out">(
    "all",
  );
  const [bookId, setBookId] = useState("");
  const [copyChoice, setCopyChoice] = useState<string>("");

  const [scope, setScope] = useState<ReservationScope>("internal");
  const [expires, setExpires] = useState(
    dueDate(settings.reservation_hold_days),
  );
  const [submitting, setSubmitting] = useState(false);

  const membersQuery = useQuery({
    queryKey: ["members", memberTerm],
    queryFn: () => fetchMembers(memberTerm),
  });
  const booksQuery = useQuery({
    queryKey: ["books", itemTerm, itemType],
    queryFn: () => fetchBooks(itemTerm, itemType),
  });
  const copiesQuery = useQuery({
    queryKey: ["wizard-copies", bookId],
    queryFn: () => getCopiesForBook(bookId),
    enabled: !!bookId,
  });

  return {
    settings,
    step,
    setStep,
    memberMode,
    setMemberMode,
    memberTerm,
    setMemberTerm,
    memberDept,
    setMemberDept,
    memberRole,
    setMemberRole,
    memberId,
    setMemberId,
    visitor,
    setVisitor,
    itemTerm,
    setItemTerm,
    itemCategory,
    setItemCategory,
    itemType,
    setItemType,
    availability,
    setAvailability,
    bookId,
    setBookId,
    copyChoice,
    setCopyChoice,
    scope,
    setScope,
    expires,
    setExpires,
    submitting,
    setSubmitting,
    membersQuery,
    booksQuery,
    copiesQuery,
  };
}

function useWizardFlow(onClose: () => void): WizardStepProps & {
  canNext: boolean;
  submitting: boolean;
  submit: () => Promise<void>;
} {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const wiz = useWizardState();

  const allMembers = wiz.membersQuery.data ?? EMPTY_MEMBERS;
  const allBooks = wiz.booksQuery.data ?? EMPTY_BOOKS;
  const copies = wiz.copiesQuery.data ?? [];
  const { memberOptions, departments, itemOptions, categories, selectedBook } =
    useWizardCatalogOptions({
      allMembers,
      allBooks,
      memberDept: wiz.memberDept,
      memberRole: wiz.memberRole,
      itemCategory: wiz.itemCategory,
      availability: wiz.availability,
      bookId: wiz.bookId,
    });

  const canNext = [
    wiz.memberMode === "registered"
      ? !!wiz.memberId
      : !!wiz.visitor.name.trim(),
    !!wiz.bookId,
    true,
    true,
  ][wiz.step];

  const externalBlocked =
    wiz.memberMode === "visitor" ||
    (selectedBook ? (selectedBook.total_copies ?? 0) <= 1 : false);
  // Derive, don't clamp: the raw scope state can still hold "external" while
  // the wizard is blocked, so every consumer reads the guarded value instead
  // of an effect writing state back (Biome react/set-state-in-effect).
  const activeScope: ReservationScope =
    externalBlocked && wiz.scope === "external" ? "internal" : wiz.scope;

  const submit = async () => {
    wiz.setSubmitting(true);
    try {
      await createReservationFromWizard({
        t,
        memberMode: wiz.memberMode,
        memberId: wiz.memberId,
        visitor: wiz.visitor,
        expires: wiz.expires,
        activeScope,
        bookId: wiz.bookId,
        allMembers,
        queryClient,
        onClose,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      wiz.setSubmitting(false);
    }
  };

  return {
    ...wiz,
    departments,
    memberOptions,
    categories,
    itemOptions,
    selectedBook,
    copies,
    allMembers,
    externalBlocked,
    activeScope,
    canNext,
    submit,
  };
}
/** The wizard's filtered option lists, derived once per dependency change. */
function useWizardCatalogOptions(deps: {
  allMembers: Member[];
  allBooks: Book[];
  memberDept: string;
  memberRole: string;
  itemCategory: string;
  availability: "all" | "available" | "out";
  bookId: string;
}) {
  const {
    allMembers,
    allBooks,
    memberDept,
    memberRole,
    itemCategory,
    availability,
    bookId,
  } = deps;
  const memberOptions = useMemo(
    () =>
      allMembers
        .filter((member) => member.status !== "archived")
        .filter((member) => !memberDept || member.department === memberDept)
        .filter((member) => !memberRole || member.role === memberRole)
        .slice(0, 30),
    [allMembers, memberDept, memberRole],
  );
  const departments = useMemo(
    () =>
      Array.from(
        new Set(
          allMembers
            .map((member) => member.department)
            .filter(Boolean) as string[],
        ),
      ),
    [allMembers],
  );
  const itemOptions = useMemo(
    () =>
      allBooks
        .filter((book: Book) => !itemCategory || book.category === itemCategory)
        .filter(
          (book: Book) =>
            availability === "all" ||
            (availability === "available"
              ? (book.available_copies ?? 0) > 0
              : (book.available_copies ?? 0) === 0),
        )
        .slice(0, 30),
    [allBooks, itemCategory, availability],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          allBooks
            .map((book: Book) => book.category)
            .filter(Boolean) as string[],
        ),
      ),
    [allBooks],
  );
  const selectedBook =
    allBooks.find((book: Book) => book.id === bookId) ?? null;
  return { memberOptions, departments, itemOptions, categories, selectedBook };
}

/**
 * The 4-step staff wizard (member/visitor → item → copy → duration). The
 * component is a thin Modal wrapper around useWizardFlow and the step
 * components in WizardStepsA/B.
 */
export function ReservationWizard({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const wiz = useWizardFlow(onClose);
  const steps = [
    t("reservations.addModal.stepMember", "Member"),
    t("reservations.addModal.stepItem", "Item"),
    t("reservations.addModal.stepCopy", "Copy"),
    t("reservations.addModal.stepDuration", "Duration"),
  ];

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("reservations.addModal.title", "New reservation")}
      size="2xl"
    >
      <WizardStepper steps={steps} step={wiz.step} />

      <WizardStepBody {...wiz} />

      <WizardFooter
        step={wiz.step}
        canNext={wiz.canNext}
        submitting={wiz.submitting}
        onClose={onClose}
        onBack={() => wiz.setStep(wiz.step - 1)}
        onNext={() => wiz.setStep(wiz.step + 1)}
        onSubmit={() => void wiz.submit()}
      />
    </Modal>
  );
}
