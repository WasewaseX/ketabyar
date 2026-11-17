import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Modal } from "../../components/ui/primitives";
import {
  createColumn,
  createRoom,
  deleteRoom,
  renameRoom,
  updateShelf,
} from "../../data/repositories/library";
import { useLibrarySettingsStore } from "../../store/librarySettingsStore";
import type { Room, Shelf } from "../../types";
import { shelfRowCodes } from "../../types";
import { cn } from "../../utils/cn";
import { useNotifyMutation } from "./useNotifyMutation";

/** Create / rename / delete rooms. */
export function RoomsModal({
  rooms,
  onClose,
}: {
  rooms: Room[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const roomCreate = useNotifyMutation({
    mutationFn: () => createRoom(name.trim()),
    successKey: "inventory.roomCreated",
    afterSuccess: () => setName(""),
  });
  const roomRename = useNotifyMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) =>
      renameRoom(id, newName),
    successKey: "inventory.roomRenamed",
  });
  const roomDelete = useNotifyMutation({
    mutationFn: (id: string) => deleteRoom(id),
    successKey: "inventory.roomRemoved",
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("inventory.manageRoomsTitle", "Manage rooms")}
      size="md"
    >
      <ul className="mb-4 space-y-2">
        {rooms.map((room) => (
          <li
            key={room.id}
            className="flex items-center gap-2 rounded-xl border border-ink/8 p-2 dark:border-white/8"
          >
            <input
              className="field-input"
              aria-label={t("inventory.roomName", "Room name")}
              defaultValue={room.name}
              onKeyDown={(event) => {
                if (event.key === "Enter")
                  roomRename.mutate({
                    id: room.id,
                    newName: (event.target as HTMLInputElement).value.trim(),
                  });
                if (event.key === "Escape")
                  (event.target as HTMLInputElement).value = room.name;
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    t(
                      "inventory.deleteRoomConfirm",
                      "Delete room {{name}}? Only works if it holds no shelved copies.",
                      { name: room.name },
                    ),
                  )
                )
                  roomDelete.mutate(room.id);
              }}
              className="rounded-lg bg-red-600/10 p-2 text-red-600 hover:bg-red-600/20"
              aria-label={t("delete", "Delete")}
            >
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          className="field-input"
          aria-label={t("inventory.roomName", "Room name")}
          placeholder={t("inventory.roomName", "Room name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button
          type="button"
          onClick={() => roomCreate.mutate()}
          disabled={!name.trim() || roomCreate.isPending}
          className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-accent-dark"
        >
          {t("inventory.addRoom", "Add room")}
        </button>
      </div>
    </Modal>
  );
}

/** New bookcase: pick the lettered rows, floor shelf comes for free. */
export function ColumnModal({
  roomId,
  onClose,
}: {
  roomId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const settings = useLibrarySettingsStore((state) => state.settings);
  const codes = shelfRowCodes(settings.shelf_row_count);
  const [picked, setPicked] = useState<Set<string>>(new Set(codes.slice(0, 2)));
  const create = useNotifyMutation({
    mutationFn: () => createColumn(roomId, Array.from(picked)),
    successKey: "inventory.columnCreated",
    afterSuccess: onClose,
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("inventory.createColumn", "New bookcase")}
      size="md"
    >
      <p className="mb-3 text-[13px] text-ink/60 dark:text-ivory/60">
        {t(
          "inventory.addColumnHint",
          "Each bookcase gets a floor shelf plus the lettered rows you pick.",
        )}
      </p>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {codes.map((code) => (
          <button
            type="button"
            key={code}
            onClick={() => {
              const next = new Set(picked);
              if (next.has(code)) next.delete(code);
              else next.add(code);
              setPicked(next);
            }}
            className={cn(
              "h-9 w-9 rounded-lg text-sm font-bold transition",
              picked.has(code)
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/6 hover:bg-ink/12 dark:bg-white/8 dark:hover:bg-white/15",
            )}
          >
            {code}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          if (picked.size === 0) {
            toast.warning(
              t(
                "inventory.selectRowsWarning",
                "Pick at least one lettered row",
              ),
            );
            return;
          }
          create.mutate();
        }}
        disabled={create.isPending}
        className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-accent-dark"
      >
        {create.isPending
          ? t("inventory.creatingColumn", "Creating…")
          : t("inventory.createColumn", "Create bookcase")}
      </button>
    </Modal>
  );
}

/** Edit a shelf's capacity and notes. */
export function ShelfEditModal({
  shelf,
  onClose,
}: {
  shelf: Shelf;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [capacity, setCapacity] = useState(String(shelf.capacity));
  const [notes, setNotes] = useState(shelf.notes ?? "");
  const save = useNotifyMutation({
    mutationFn: () =>
      updateShelf(shelf.id, {
        capacity: Math.max(1, parseInt(capacity, 10) || 1),
        notes: notes || null,
      }),
    successKey: "inventory.shelfUpdated",
    afterSuccess: onClose,
  });
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        shelf.shelf_type === "floor"
          ? t("inventory.editFloorShelfTitle", "Edit floor shelf")
          : t("inventory.editShelfTitle", "Edit shelf {{code}}", {
              code: shelf.code,
            })
      }
      size="md"
    >
      <div className="grid gap-4">
        <label>
          <span>{t("inventory.shelfCapacityLabel", "Capacity")} *</span>
          <input
            type="number"
            min={1}
            required
            className="field-input"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        <label>
          <span>{t("inventory.notesOptional", "Notes (optional)")}</span>
          <textarea
            className="field-input"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-50 dark:bg-accent-dark"
        >
          {t("inventory.saveChanges", "Save changes")}
        </button>
      </div>
    </Modal>
  );
}
