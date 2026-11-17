/**
 * Physical layout: rooms, bookcase columns and shelf rows.
 */
import type { Column, Room, Shelf } from "../../types";
import { maybeOne, one, select, sqlExec, uid } from "../localDb";
import { audit, timestamp } from "./librarySqlShared";

export async function getRooms(): Promise<Room[]> {
  return select<Room>(`SELECT * FROM rooms ORDER BY name COLLATE NOCASE`);
}

export async function createRoom(
  name: string,
  notes: string | null = null,
): Promise<Room> {
  const id = uid();
  await sqlExec(
    `INSERT INTO rooms (id, name, notes, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [id, name.trim(), notes, timestamp(), timestamp()],
  );
  await audit("create_room", "room", id, { name });
  return one<Room>(`SELECT * FROM rooms WHERE id = ?`, [id]);
}

export async function renameRoom(
  roomId: string,
  newName: string,
): Promise<void> {
  await sqlExec(`UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?`, [
    newName.trim(),
    timestamp(),
    roomId,
  ]);
  await audit("rename_room", "room", roomId, { name: newName });
}

export async function deleteRoom(roomId: string): Promise<void> {
  const occupied = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM copies c
     JOIN shelves s ON s.id = c.shelf_id
     JOIN columns co ON co.id = s.column_id
     WHERE co.room_id = ? AND c.status != 'archived'`,
    [roomId],
  );
  if ((occupied?.n ?? 0) > 0)
    throw new Error("این اتاق نسخهٔ روی قفسه دارد؛ ابتدا جابه‌جا کنید.");
  await sqlExec(`DELETE FROM rooms WHERE id = ?`, [roomId]);
  await audit("delete_room", "room", roomId, null);
}

export async function getColumns(): Promise<Column[]> {
  return select<Column>(`SELECT * FROM columns ORDER BY room_id, number`);
}

export async function createColumn(
  roomId: string,
  rows: string[],
): Promise<string> {
  const valid = rows.filter((code) => /^[A-R]$/.test(code) || code === "S");
  if (valid.length === 0) throw new Error("حداقل یک ردیف انتخاب کنید.");
  const top = valid.filter((code) => code !== "S");
  const tail = await maybeOne<{ max: number }>(
    `SELECT COALESCE(MAX(number), 0) AS max FROM columns WHERE room_id = ?`,
    [roomId],
  );
  const id = uid();
  await sqlExec(
    `INSERT INTO columns (id, room_id, number, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [id, roomId, (tail?.max ?? 0) + 1, timestamp(), timestamp()],
  );
  await sqlExec(
    `INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [uid(), id, "floor", "S", 120, timestamp(), timestamp()],
  );
  for (const code of top) {
    await sqlExec(
      `INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [uid(), id, "top", code, 40, timestamp(), timestamp()],
    );
  }
  await audit("create_column", "column", id, { room: roomId, rows: top });
  return id;
}

export async function deleteColumn(columnId: string): Promise<void> {
  const occupied = await maybeOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM copies c JOIN shelves s ON s.id = c.shelf_id WHERE s.column_id = ? AND c.status != 'archived'`,
    [columnId],
  );
  if ((occupied?.n ?? 0) > 0)
    throw new Error("این قفسه نسخه دارد؛ ابتدا جابه‌جا کنید.");
  await sqlExec(`DELETE FROM columns WHERE id = ?`, [columnId]);
  await audit("delete_column", "column", columnId, null);
}

export async function getShelves(): Promise<Shelf[]> {
  return select<Shelf>(
    `SELECT * FROM shelf_overview ORDER BY room, column_number, code`,
  );
}

export async function createShelf(
  columnId: string,
  code: string,
  shelfType: "top" | "floor" = "top",
  capacity = shelfType === "floor" ? 120 : 40,
): Promise<string> {
  const clash = await maybeOne(
    `SELECT id FROM shelves WHERE column_id = ? AND code = ?`,
    [columnId, code],
  );
  if (clash) throw new Error("این ردیف در این قفسه قبلاً ساخته شده است.");
  const id = uid();
  await sqlExec(
    `INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
    [id, columnId, shelfType, code, capacity, timestamp(), timestamp()],
  );
  await audit("create_shelf", "shelf", id, { code, shelfType });
  return id;
}

export async function updateShelf(
  shelfId: string,
  updates: { capacity?: number; notes?: string | null },
): Promise<void> {
  if (updates.capacity !== undefined) {
    await sqlExec(
      `UPDATE shelves SET capacity = ?, updated_at = ? WHERE id = ?`,
      [Math.max(1, updates.capacity), timestamp(), shelfId],
    );
  }
  if (updates.notes !== undefined) {
    await sqlExec(`UPDATE shelves SET notes = ?, updated_at = ? WHERE id = ?`, [
      updates.notes,
      timestamp(),
      shelfId,
    ]);
  }
  await audit("update_shelf", "shelf", shelfId, updates);
}

/* ═════════════════════════ Notifications ═════════════════════════════ */
