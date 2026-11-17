import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DefaultCover, Modal } from "../../components/ui/primitives";
import { updateCopy } from "../../data/repositories/library";
import type { Copy, Shelf } from "../../types";
import { useInvalidateAll } from "./useNotifyMutation";

/** Browse the whole collection and assign copies to the picked shelf. */
export function BrowseAssignModal({
  target,
  allShelves,
  allCopies,
  onClose,
}: {
  target: Shelf;
  allShelves: Shelf[];
  allCopies: Copy[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const invalidate = useInvalidateAll();
  const targetCopies = allCopies.filter((copy) => copy.shelf_id === target.id);
  const [termLocal, setTermLocal] = useState("");
  const [shelfFilter, setShelfFilter] = useState("");
  const move = useMutation({
    mutationFn: ({
      copyId,
      shelfId,
    }: {
      copyId: string;
      shelfId: string | null;
    }) => updateCopy(copyId, { shelfId }),
    onSuccess: (_result, variables) => {
      toast.success(
        variables.shelfId
          ? t("inventory.assignedToast", "Placed on the shelf")
          : t("inventory.removedToast", "Removed from the shelf"),
      );
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const needle = termLocal.trim().toLowerCase();
  const candidates = allCopies.filter((copy) => {
    if (shelfFilter === "unassigned" && copy.shelf_id) return false;
    if (
      shelfFilter &&
      shelfFilter !== "unassigned" &&
      shelfFilter !== "all" &&
      copy.shelf_id !== shelfFilter
    )
      return false;
    if (!needle) return true;
    return [copy.title, copy.author, copy.barcode, copy.accession_number]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("inventory.addAssignTitle", "Shelve items")}
      size="xl"
    >
      <p className="mb-3 text-[13px] text-ink/60 dark:text-ivory/60">
        {t("inventory.browseHint", "Moving items onto")}{" "}
        <b>
          {target.shelf_type === "floor"
            ? t("inventory.floorShelf", "Floor shelf")
            : t("inventory.shelfLetter", "Shelf {{code}}", {
                code: target.code,
              })}
        </b>
        {" · "}
        {t("inventory.occupancyLabel", "{{count}} of {{capacity}}", {
          count: targetCopies.length,
          capacity: target.capacity,
        })}
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          aria-label={t(
            "inventory.browseSearchPlaceholder",
            "Title, author, barcode…",
          )}
          className="field-input max-w-xs"
          placeholder={t(
            "inventory.browseSearchPlaceholder",
            "Title, author, barcode…",
          )}
          value={termLocal}
          onChange={(event) => setTermLocal(event.target.value)}
        />
        <select
          aria-label={t("inventory.filterShelf", "Shelf filter")}
          className="field-select max-w-48"
          value={shelfFilter}
          onChange={(event) => setShelfFilter(event.target.value)}
        >
          <option value="unassigned">
            {t("inventory.unassignedOption", "Unassigned only")}
          </option>
          <option value="all">
            {t("inventory.allShelvesOption", "All shelves")}
          </option>
          {allShelves
            .filter((shelf) => shelf.id !== target.id)
            .map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.code} ({shelf.room})
              </option>
            ))}
        </select>
      </div>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto">
        {candidates.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
            {t("inventory.noMatchingItems", "No items match")}
          </p>
        ) : (
          candidates.slice(0, 60).map((copy) => {
            const onTarget = copy.shelf_id === target.id;
            return (
              <li
                key={copy.id}
                className="flex items-center gap-3 rounded-xl border border-ink/8 p-2.5 dark:border-white/8"
              >
                {copy.cover_path ? (
                  <img
                    src={copy.cover_path}
                    alt=""
                    className="h-10 w-7 rounded object-cover"
                  />
                ) : (
                  <DefaultCover
                    type={copy.item_type}
                    className="h-10 w-7 rounded"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold">
                    {copy.title}
                  </p>
                  <p className="font-mono text-[10px] text-ink/50 dark:text-ivory/50">
                    {copy.barcode} · {copy.accession_number}
                  </p>
                </div>
                {onTarget ? (
                  <button
                    type="button"
                    onClick={() =>
                      move.mutate({ copyId: copy.id, shelfId: null })
                    }
                    className="rounded-lg bg-red-600/10 px-3 py-1.5 text-[11px] font-bold text-red-600"
                  >
                    {t("inventory.remove", "Remove")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      move.mutate({ copyId: copy.id, shelfId: target.id })
                    }
                    className="rounded-lg bg-accent/10 px-3 py-1.5 text-[11px] font-bold text-accent dark:text-accent-dark"
                  >
                    {t("inventory.addToShelfBtn", "Add to shelf")}
                  </button>
                )}
              </li>
            );
          })
        )}
      </ul>
    </Modal>
  );
}
