import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cleanAccession, cleanBarcode } from "../utils/isbn";
import { updateCopy } from "../data/repositories/library";
import type { Copy, Shelf } from "../types";
import { cn } from "../utils/cn";
import { Button, Input, Modal, StatusBadge } from "./ui/primitives";

/**
 * Edits one physical copy: identifiers, condition, status, and its position
 * on the shelf map (bookcase → row, both cascading selects).
 */

const CONDITIONS = ["mint", "good", "fair", "worn", "damaged"] as const;
const STATUSES = ["available", "on-loan", "reserved", "repair", "lost"] as const;

interface Bookcase {
  columnId: string;
  room: string;
  columnNumber: number;
}

export function CopyEditModal({ copy, onClose, shelves }: { copy: Copy; onClose: () => void; shelves: Shelf[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const bookcases = useMemo<Bookcase[]>(() => {
    const seen = new Map<string, Bookcase>();
    for (const shelf of shelves) {
      if (!seen.has(shelf.column_id)) {
        seen.set(shelf.column_id, {
          columnId: shelf.column_id,
          room: shelf.room ?? "",
          columnNumber: shelf.column_number ?? 0,
        });
      }
    }
    return Array.from(seen.values()).sort(
      (a, b) => a.room.localeCompare(b.room, "fa") || a.columnNumber - b.columnNumber,
    );
  }, [shelves]);

  const [columnId, setColumnId] = useState(copy.shelf_id ? shelves.find((s) => s.id === copy.shelf_id)?.column_id ?? "" : "");
  const [shelfId, setShelfId] = useState(copy.shelf_id ?? "");
  const [condition, setCondition] = useState(copy.condition);
  const [status, setStatus] = useState<string>(copy.status);

  useEffect(() => {
    setShelfId("");
  }, [columnId]);

  const rows = useMemo(() => shelves.filter((shelf) => shelf.column_id === columnId), [shelves, columnId]);

  const mutation = useMutation({
    mutationFn: () =>
      updateCopy(copy.id, {
        barcode: cleanBarcode(barcode),
        accession_number: cleanAccession(accession),
        condition,
        status: status as Copy["status"],
        shelfId: shelfId || null,
      }),
    onSuccess: () => {
      toast.success(t("inventory.copyUpdated", "Copy updated"));
      void queryClient.invalidateQueries();
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const [barcode, setBarcode] = useState(copy.barcode);
  const [accession, setAccession] = useState(copy.accession_number);

  const floorShelf = (shelf: Shelf) => shelf.shelf_type === "floor";

  return (
    <Modal isOpen onClose={onClose} title={`${t("inventory.editCopy", "Edit copy")}: ${copy.barcode}`}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        {copy.title ? <p className="text-sm text-ink/60 dark:text-ivory/60">{copy.title}</p> : null}

        <label>
          <span>{t("catalog.details.copyBarcode", "Barcode")}</span>
          <Input value={barcode} onChange={(event) => setBarcode(event.target.value)} className="font-mono" required />
        </label>

        <label>
          <span>{t("catalog.details.copyAccession", "Accession number")}</span>
          <Input value={accession} onChange={(event) => setAccession(event.target.value)} className="font-mono" required />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label>
            <span>{t("catalog.details.copyCondition", "Condition")}</span>
            <select className="field-select" value={condition} onChange={(event) => setCondition(event.target.value)}>
              {CONDITIONS.map((value) => (
                <option key={value} value={value}>{t(`catalog.condition.${value}`, value)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("inventory.status", "Status")}</span>
            <select className="field-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>{t(`reports.statusLabels.${value.replace("-", "")}`, value)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label>
            <span>{t("inventory.bookcase", "Bookcase")}</span>
            <select className="field-select" value={columnId} onChange={(event) => setColumnId(event.target.value)}>
              <option value="">{t("catalog.details.shelfUnassigned", "Unassigned")}</option>
              {bookcases.map((bookcase) => (
                <option key={bookcase.columnId} value={bookcase.columnId}>
                  {t("inventory.columnLabel", `Room ${bookcase.room} · Column ${bookcase.columnNumber}`, { number: bookcase.columnNumber })} — {bookcase.room}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{t("inventory.row", "Row")}</span>
            <select className="field-select" value={shelfId} onChange={(event) => setShelfId(event.target.value)} disabled={!columnId}>
              <option value="">{t("catalog.details.shelfUnassigned", "Unassigned")}</option>
              {rows.map((shelf) => (
                <option key={shelf.id} value={shelf.id}>
                  {floorShelf(shelf) ? t("inventory.floorShelf", "Floor shelf") : t("inventory.shelfLetter", "Shelf {{code}}", { code: shelf.code })}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/8 pt-4 dark:border-white/8">
          <StatusBadge value={status} className={cn("text-xs")} />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("cancel", "Cancel")}</Button>
            <Button type="submit" disabled={mutation.isPending}>{t("inventory.saveChanges", "Save changes")}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
