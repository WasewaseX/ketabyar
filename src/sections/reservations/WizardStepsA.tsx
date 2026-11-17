import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DefaultCover } from "../../components/ui/primitives";
import type { Book, Member } from "../../types";
import { cn } from "../../utils/cn";
import { getMemberInitials } from "../Members";

export type VisitorDraft = {
  name: string;
  email: string;
  phone: string;
  dept: string;
};

/** Wizard step 1 — pick a registered member or capture a visitor. */
export function WizardStepMember({
  memberMode,
  setMemberMode,
  memberId,
  setMemberId,
  memberTerm,
  setMemberTerm,
  memberDept,
  setMemberDept,
  memberRole,
  setMemberRole,
  departments,
  memberOptions,
  visitor,
  setVisitor,
}: {
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
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-3 flex gap-1.5">
        {(["registered", "visitor"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            onClick={() => {
              setMemberMode(mode);
              setMemberId("");
            }}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-semibold",
              memberMode === mode
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 dark:bg-white/5 dark:text-ivory/60",
            )}
          >
            {mode === "registered"
              ? t("reservations.addModal.tabRegistered", "Registered member")
              : t("reservations.addModal.tabVisitor", "Visitor / guest")}
          </button>
        ))}
      </div>

      {memberMode === "registered" ? (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <input
              aria-label={t(
                "reservations.addModal.searchMemberPlaceholder",
                "Search members…",
              )}
              className="field-input max-w-xs"
              placeholder={t(
                "reservations.addModal.searchMemberPlaceholder",
                "Search members…",
              )}
              value={memberTerm}
              onChange={(event) => setMemberTerm(event.target.value)}
            />
            <select
              aria-label={t(
                "reservations.addModal.memberDeptFilter",
                "Department filter",
              )}
              className="field-select max-w-44"
              value={memberDept}
              onChange={(event) => setMemberDept(event.target.value)}
            >
              <option value="">
                {t("reservations.addModal.filterDept", "All departments")}
              </option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <select
              aria-label={t(
                "reservations.addModal.memberRoleFilter",
                "Role filter",
              )}
              className="field-select max-w-36"
              value={memberRole}
              onChange={(event) => setMemberRole(event.target.value)}
            >
              <option value="">
                {t("reservations.addModal.filterRole", "All roles")}
              </option>
              {["visitor", "student", "staff", "medic", "other"].map((role) => (
                <option key={role} value={role}>
                  {t(`members.roles.${role}`, role)}
                </option>
              ))}
            </select>
          </div>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {memberOptions.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
                {t("reservations.addModal.noMembersFound", "No members match")}
              </p>
            ) : (
              memberOptions.map((member: Member) => (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => setMemberId(member.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition",
                      memberId === member.id
                        ? "border-accent bg-accent/8 dark:border-accent-dark"
                        : "border-ink/8 hover:border-ink/20 dark:border-white/8",
                    )}
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-copper text-xs font-bold text-white">
                      {getMemberInitials(member.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">
                        {member.full_name}
                      </span>
                      <span className="block font-mono text-[10px] text-ink/50 dark:text-ivory/50">
                        {member.member_number} ·{" "}
                        {member.department || t("members.noDepartment", "—")} ·{" "}
                        {t(`members.roles.${member.role ?? "other"}`, "")}
                      </span>
                    </span>
                    {memberId === member.id ? (
                      <Check
                        size={16}
                        className="text-accent dark:text-accent-dark"
                      />
                    ) : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </>
      ) : (
        <div className="rounded-2xl border border-copper/30 bg-copper/5 p-4">
          <p className="mb-3 rounded-xl bg-copper/10 px-3 py-2 text-xs font-semibold text-copper">
            {t(
              "reservations.addModal.visitorNotice",
              "A guest profile will be created and linked to this hold automatically.",
            )}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span>
                {t("reservations.addModal.visitorName", "Full name")}
                <span className="text-copper"> *</span>
              </span>
              <input
                className="field-input"
                value={visitor.name}
                onChange={(event) =>
                  setVisitor({ ...visitor, name: event.target.value })
                }
                placeholder={t(
                  "reservations.addModal.visitorNamePlaceholder",
                  "e.g. Ali Rezaei",
                )}
              />
            </label>
            <label>
              <span>
                {t(
                  "reservations.addModal.visitorDept",
                  "Department / organization",
                )}
              </span>
              <input
                className="field-input"
                value={visitor.dept}
                onChange={(event) =>
                  setVisitor({ ...visitor, dept: event.target.value })
                }
              />
            </label>
            <label>
              <span>{t("reservations.addModal.visitorEmail", "Email")}</span>
              <input
                className="field-input"
                dir="ltr"
                value={visitor.email}
                onChange={(event) =>
                  setVisitor({ ...visitor, email: event.target.value })
                }
              />
            </label>
            <label>
              <span>{t("reservations.addModal.visitorPhone", "Phone")}</span>
              <input
                className="field-input"
                dir="ltr"
                value={visitor.phone}
                onChange={(event) =>
                  setVisitor({ ...visitor, phone: event.target.value })
                }
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** Wizard step 2 — search the catalog and pick the item to hold. */
export function WizardStepItem({
  itemTerm,
  setItemTerm,
  itemCategory,
  setItemCategory,
  itemType,
  setItemType,
  availability,
  setAvailability,
  categories,
  itemOptions,
  bookId,
  setBookId,
  setCopyChoice,
}: {
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
  setCopyChoice: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          aria-label={t(
            "reservations.addModal.searchItemPlaceholder",
            "Search the catalog…",
          )}
          className="field-input max-w-xs"
          placeholder={t(
            "reservations.addModal.searchItemPlaceholder",
            "Search the catalog…",
          )}
          value={itemTerm}
          onChange={(event) => setItemTerm(event.target.value)}
        />
        <select
          aria-label={t(
            "reservations.addModal.itemCategoryFilter",
            "Category filter",
          )}
          className="field-select max-w-44"
          value={itemCategory}
          onChange={(event) => setItemCategory(event.target.value)}
        >
          <option value="">
            {t("reservations.addModal.filterCategory", "All categories")}
          </option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          aria-label={t(
            "reservations.addModal.itemTypeFilter",
            "Item type filter",
          )}
          className="field-select max-w-36"
          value={itemType}
          onChange={(event) => setItemType(event.target.value)}
        >
          <option value="">
            {t("reservations.addModal.filterType", "All types")}
          </option>
          {["book", "fyp", "journal", "other"].map((type) => (
            <option key={type} value={type}>
              {t(`itemTypes.${type}`, type)}
            </option>
          ))}
        </select>
        <select
          aria-label={t(
            "reservations.addModal.availabilityFilter",
            "Availability filter",
          )}
          className="field-select max-w-40"
          value={availability}
          onChange={(event) =>
            setAvailability(event.target.value as typeof availability)
          }
        >
          <option value="all">
            {t("reservations.addModal.filterAvailability", "Any availability")}
          </option>
          <option value="available">
            {t("reservations.addModal.availableOnly", "Available only")}
          </option>
          <option value="out">
            {t("reservations.addModal.outOfStockOnly", "Out of stock only")}
          </option>
        </select>
      </div>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {itemOptions.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
            {t("reservations.addModal.noItemsFound", "Nothing matches")}
          </p>
        ) : (
          itemOptions.map((book: Book) => (
            <li key={book.id}>
              <button
                type="button"
                onClick={() => {
                  setBookId(book.id);
                  setCopyChoice("");
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-2.5 text-start transition",
                  bookId === book.id
                    ? "border-accent bg-accent/8 dark:border-accent-dark"
                    : "border-ink/8 hover:border-ink/20 dark:border-white/8",
                )}
              >
                {book.cover_path ? (
                  <img
                    src={book.cover_path}
                    alt=""
                    className="h-11 w-8 rounded object-cover"
                  />
                ) : (
                  <DefaultCover
                    type={book.item_type}
                    className="h-11 w-8 rounded"
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">
                    {book.title}
                  </span>
                  <span className="block truncate text-[11px] text-ink/50 dark:text-ivory/50">
                    {book.author || "—"}
                    {book.category ? ` · ${book.category}` : ""}
                  </span>
                </span>
                {(book.available_copies ?? 0) > 0 ? (
                  <span className="rounded-full bg-accent/12 px-2.5 py-0.5 text-[10px] font-bold text-accent dark:text-accent-dark">
                    {t(
                      "reservations.addModal.availableCopies",
                      "{{available}} of {{total}} available",
                      {
                        available: book.available_copies,
                        total: book.total_copies ?? 0,
                      },
                    )}
                  </span>
                ) : (
                  <span className="rounded-full bg-copper/15 px-2.5 py-0.5 text-[10px] font-bold text-copper">
                    {t(
                      "reservations.addModal.outOfStock",
                      "{{total}} copies, none available",
                      { total: book.total_copies ?? 0 },
                    )}
                  </span>
                )}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
