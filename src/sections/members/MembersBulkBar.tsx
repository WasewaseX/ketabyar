import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { deleteMember } from "../../data/repositories/library";
import { IdCardModal, MemberModal, ReceiptModal } from "./MemberModals";

/** Bulk archive bar over the selected members. */
export function MembersBulkBar({
  selectedIds,
  setSelectedIds,
  invalidate,
}: {
  selectedIds: Set<string>;
  setSelectedIds: (ids: Set<string>) => void;
  invalidate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
      <span className="font-bold">
        {t("members.bulk.selectedCount", "{{count}} selected", {
          count: selectedIds.size,
        })}
      </span>
      <button
        type="button"
        className="rounded-lg px-2 py-1 hover:bg-white/10"
        onClick={() => setSelectedIds(new Set())}
      >
        {t("catalog.bulk.deselectAll", "Deselect all")}
      </button>
      <button
        type="button"
        className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
        onClick={() => {
          if (
            !window.confirm(
              t(
                "members.alerts.confirmBulkArchive",
                "Archive {{count}} members?",
                { count: selectedIds.size },
              ),
            )
          )
            return;
          Promise.allSettled(
            Array.from(selectedIds).map((id) => deleteMember(id)),
          ).then(() => {
            toast.success(t("members.alerts.bulkArchived", "Members archived"));
            setSelectedIds(new Set());
            invalidate();
          });
        }}
      >
        {t("catalog.bulk.archiveSelected", "Archive selected")}
      </button>
    </div>
  );
}

/** The page's modal cluster: add/edit, ID card and receipt dialogs. */
export function MembersDialogs({
  addOpen,
  closeAdd,
  editOpen,
  selected,
  setEditOpen,
  idCardOpen,
  setIdCardOpen,
  receipt,
  setReceipt,
  existingNumbers,
}: {
  addOpen: boolean;
  closeAdd: () => void;
  editOpen: boolean;
  selected: import("../../types").Member | null;
  setEditOpen: (open: boolean) => void;
  idCardOpen: boolean;
  setIdCardOpen: (open: boolean) => void;
  receipt: import("./MemberModals").MemberReceipt | null;
  setReceipt: (receipt: import("./MemberModals").MemberReceipt | null) => void;
  existingNumbers: string[];
}) {
  return (
    <>
      {addOpen ? (
        <MemberModal
          onClose={() => closeAdd()}
          existingNumbers={existingNumbers}
        />
      ) : null}
      {editOpen && selected ? (
        <MemberModal
          member={selected}
          onClose={() => setEditOpen(false)}
          existingNumbers={existingNumbers}
        />
      ) : null}
      {idCardOpen && selected ? (
        <IdCardModal member={selected} onClose={() => setIdCardOpen(false)} />
      ) : null}
      {receipt ? (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      ) : null}
    </>
  );
}
