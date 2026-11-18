import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImageUpload } from "../../components/ui/ImageUpload";
import { Modal } from "../../components/ui/primitives";
import { saveMember, updateMember } from "../../data/repositories/library";
import type { Member } from "../../types";
import { formatDisplayDate } from "../../utils/dates";
import {
  cleanLastName,
  cleanMemberNumber,
  cleanPhone,
  cleanText,
  formatMemberNumber,
  normalizeDigits,
} from "../../utils/isbn";
import { getMemberInitials, splitFullName } from "./memberHelpers";
import {
  type MemberForm,
  memberSchema,
  ROLES,
  STATUSES,
} from "./membersShared";

/** The copper asterisk is the app-wide "cannot be blank" marker; keeping it
 * here stops the member forms from drifting away from that convention. */
function RequiredInput({
  label,
  className,
  register,
}: {
  label: { key: string; fallback: string };
  className?: string;
  register: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  return (
    <label>
      <span>
        {t(label.key, label.fallback)}
        <span className="text-copper"> *</span>
      </span>
      <input
        className={`field-input ${className ?? ""}`}
        required
        {...register}
      />
    </label>
  );
}

export function MemberModal({
  member,
  onClose,
  existingNumbers,
}: {
  member?: Member;
  onClose: () => void;
  existingNumbers: string[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const form = useForm<MemberForm>({
    resolver: zodResolver(memberSchema),
    defaultValues: member
      ? {
          ...splitFullName(member.full_name),
          member_number: member.member_number,
          email: member.email ?? "",
          phone: member.phone ?? "",
          role: String(member.role ?? "student"),
          department: member.department ?? "",
          status: member.status,
          avatar_path: member.avatar_path ?? null,
        }
      : {
          // New members are registered by their real student ID — the
          // librarian types it; nothing is auto-generated for students.
          first_name: "",
          last_name: "",
          member_number: "",
          email: "",
          phone: "",
          role: "student",
          department: "",
          status: "active",
          avatar_path: null,
        },
  });

  /* Render-safe subscriptions (useWatch) — form.watch() during render is
    incompatible with the React Compiler's purity rules. */
  const firstName = useWatch({ control: form.control, name: "first_name" });
  const lastName = useWatch({ control: form.control, name: "last_name" });
  const avatarPath = useWatch({ control: form.control, name: "avatar_path" });

  const mutation = useMutation({
    mutationFn: async (values: MemberForm) => {
      const number = cleanMemberNumber(values.member_number);
      if (number.length < 3) {
        throw new Error(
          t(
            "members.alerts.badStudentId",
            "کد دانشجویی باید حداقل ۳ نویسه باشد.",
          ),
        );
      }
      if (existingNumbers.includes(number.toLowerCase())) {
        throw new Error(
          t("members.alerts.exists", "This member number is already taken."),
        );
      }
      const payload = {
        full_name:
          `${cleanText(values.first_name)} ${cleanLastName(values.last_name)}`.trim(),
        member_number: number,
        email: values.email || null,
        phone: values.phone ? cleanPhone(values.phone) : null,
        role: values.role,
        department: values.department || null,
        status: values.status as Member["status"],
        avatar_path: values.avatar_path || null,
      };
      if (member) await updateMember(member.id, payload);
      else await saveMember(payload);
    },
    onSuccess: () => {
      toast.success(
        t(
          member ? "members.alerts.updated" : "members.alerts.memberSaved",
          member ? "Member updated" : "Member registered",
        ),
      );
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        member
          ? t("members.addModal.editTitle", "Edit member")
          : t("members.addMember", "Add member")
      }
      size="lg"
    >
      <form
        className="grid gap-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <div className="flex items-center gap-4">
          <ImageUpload
            shape="circle"
            fallbackInitials={getMemberInitials(`${firstName} ${lastName}`)}
            value={avatarPath ?? null}
            onChange={(value) => form.setValue("avatar_path", value)}
          />
          <div className="grid flex-1 grid-cols-2 gap-3">
            <label>
              <span>
                {t("members.firstName", "First name")}
                <span className="text-copper"> *</span>
              </span>
              <input
                className="field-input"
                required
                {...form.register("first_name")}
              />
            </label>
            <RequiredInput
              label={{ key: "members.lastName", fallback: "Last name" }}
              className="uppercase"
              register={form.register("last_name")}
            />
          </div>
        </div>

        <label>
          <span>
            {t("members.membershipNumber", "Student ID")}
            <span className="text-copper"> *</span>
          </span>
          <input
            className="field-input font-mono"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t("members.studentIdPlaceholder", "40212345")}
            required
            {...form.register("member_number", {
              // Persian keyboard digits (۴۰۲…) are normalised to ASCII at the
              // input, so the stored student ID always matches searches/scans.
              setValueAs: (value: string) =>
                normalizeDigits(value ?? "").replace(/[^0-9A-Za-z-]/g, ""),
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                event.target.value = normalizeDigits(
                  event.target.value,
                ).replace(/[^0-9A-Za-z-]/g, "");
              },
            })}
          />
          {form.formState.errors.member_number ? (
            <p className="mt-1 text-[11px] text-red-600">
              {t(
                "members.alerts.badStudentId",
                "کد دانشجویی باید حداقل ۳ نویسه باشد.",
              )}
            </p>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label>
            <span>{t("members.email", "Email")}</span>
            <input
              className="field-input"
              type="email"
              dir="ltr"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="mt-1 text-[11px] text-red-600">
                {t(
                  "members.alerts.badEmail",
                  "Enter a valid email or leave it empty",
                )}
              </p>
            ) : null}
          </label>
          <label>
            <span>{t("members.phone", "Phone")}</span>
            <input
              className="field-input"
              dir="ltr"
              {...form.register("phone")}
            />
          </label>
          <label>
            <span>{t("members.roleLabel", "Role")}</span>
            <select className="field-select" {...form.register("role")}>
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {t(`members.roles.${role}`, role)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("members.departmentLabel", "Department")}</span>
            <input className="field-input" {...form.register("department")} />
          </label>
          <label>
            <span>{t("members.statusLabel", "Status")}</span>
            <select className="field-select" {...form.register("status")}>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`members.${status}`, status)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-ink/8 pt-4 dark:border-white/8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5"
          >
            {t("members.addModal.cancel", "Cancel")}
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark"
          >
            {t("members.addModal.save", "Save member")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── ID card + receipt modals ────────────────────────────────────────── */

export function IdCardModal({
  member,
  onClose,
}: {
  member: Member;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("members.idCardTitle", "Library ID card")}
      size="md"
    >
      <div className="relative mx-auto w-72 overflow-hidden rounded-2xl bg-gradient-to-b from-[#1a4d40] to-[#122222] p-5 text-white shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <img
            src="/brand/ketabyar-symbol.png"
            alt=""
            className="h-8 w-8 rounded-lg"
          />
          <div>
            <p className="font-display text-sm font-bold">کتابیار</p>
            <p className="text-[9px] text-white/60">KETABYAR LIBRARY CARD</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {member.avatar_path ? (
            <img
              src={member.avatar_path}
              alt=""
              className="h-16 w-16 rounded-xl object-cover ring-2 ring-white/30"
            />
          ) : (
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-white/15 text-lg font-bold">
              {getMemberInitials(member.full_name)}
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{member.full_name}</p>
            <p className="text-[10px] text-white/70">
              {t(`members.roles.${member.role ?? "other"}`, member.role ?? "")}
              {member.department ? ` · ${member.department}` : ""}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-white/12 py-2 text-center font-mono text-base font-bold tracking-[0.2em]">
          {formatMemberNumber(member.member_number)}
        </div>
        <p className="mt-3 text-center text-[9px] text-white/50">
          {member.joined_at.slice(0, 10)}
        </p>
      </div>
      <p className="mt-3 text-center text-xs text-ink/50 dark:text-ivory/50">
        {member.full_name} ·{" "}
        {t(`members.roles.${member.role ?? "other"}`, member.role ?? "")}
      </p>
    </Modal>
  );
}

export type MemberReceipt = {
  kind: "renew" | "return";
  title: string;
  date: string;
  printedAt: string;
};

export function ReceiptModal({
  receipt,
  onClose,
}: {
  receipt: {
    kind: "renew" | "return";
    title: string;
    date: string;
    printedAt: string;
  };
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        receipt.kind === "renew"
          ? t("circulation.renewReceiptTitle", "Renewal receipt")
          : t("circulation.returnReceiptTitle", "Return receipt")
      }
      size="md"
    >
      <div className="rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 p-6 text-center dark:border-accent-dark/40 dark:bg-accent-dark/5">
        <p className="text-[11px] font-bold uppercase tracking-widest text-copper">
          {receipt.kind === "renew"
            ? t("circulation.renew", "Renew")
            : t("circulation.return", "Return")}
        </p>
        <p className="mt-2 font-display text-base font-bold">{receipt.title}</p>
        <p className="mt-3 text-sm">
          {receipt.kind === "renew"
            ? t("circulation.newDueDate", "New due date")
            : t("circulation.returnedOn", "Returned on")}
          : <b>{formatDisplayDate(receipt.date)}</b>
        </p>
        <p className="mt-3 text-[10px] text-ink/45 dark:text-ivory/45">
          KetabYar · {formatDisplayDate(receipt.printedAt)}
        </p>
      </div>
    </Modal>
  );
}
