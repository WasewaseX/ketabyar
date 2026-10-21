import { invoke } from "@tauri-apps/api/core";
import { currentActor } from "../../store/authStore";
import type {
  Book, Copy, DashboardMetrics, Loan, Member, Reservation, Room, Column, Shelf,
  ReservationScope, AppNotification,
} from "../../types";
import type { LibrarySettings } from "../../types";
import type { FineRow, SaveBookInput } from "./librarySql";

/**
 * KetabYar **Rust edition** repository — the exact same public API as
 * librarySql.ts, but every call is served by the ketabyar-core Rust engine
 * (rusqlite) through Tauri commands. Selected at build time with
 * VITE_KETABYAR_BACKEND=rust; the dispatcher in library.ts keeps the UI
 * completely unaware of which engine is running.
 */

const withActor = () => ({ actor: currentActor() });

export async function dashboard(): Promise<DashboardMetrics> {
  return invoke<DashboardMetrics>("dashboard");
}

// ─────────────────────────────── Books ───────────────────────────────

export async function books(query = "", itemType = ""): Promise<Book[]> {
  return invoke<Book[]>("books_list", { query, itemType });
}

export async function saveBook(input: SaveBookInput): Promise<void> {
  await invoke("book_save", { input });
}

export async function updateBook(bookId: string, input: Partial<Book> & { author?: string | null }): Promise<void> {
  await invoke("book_update", { bookId, input });
}

export async function deleteBook(bookId: string): Promise<void> {
  await invoke("book_delete", { bookId, ...withActor() });
}

export async function getCopiesForBook(bookId: string): Promise<Copy[]> {
  return invoke<Copy[]>("copies_for_book", { bookId });
}

export async function addCopy(bookId: string, barcode: string, accessionNumber: string, condition: string, shelfId?: string | null): Promise<void> {
  await invoke("copy_add", { bookId, barcode, accessionNumber, condition, shelfId: shelfId ?? null, ...withActor() });
}

export async function updateCopy(copyId: string, updates: Partial<Copy> & { shelfId?: string | null }): Promise<void> {
  await invoke("copy_update", { copyId, updates, ...withActor() });
}

export async function deleteCopy(copyId: string): Promise<void> {
  await invoke("copy_delete", { copyId, ...withActor() });
}

export async function copies(query = ""): Promise<(Copy & { title: string; item_type?: string; metadata?: string | null; cover_path?: string | null; author?: string | null })[]> {
  return invoke("copies_list", { query });
}

// ─────────────────────────────── Members ───────────────────────────────

export async function members(query = ""): Promise<Member[]> {
  return invoke<Member[]>("members_list", { query });
}

export async function saveMember(input: Omit<Member, "id" | "member_number" | "joined_at"> & { member_number?: string }): Promise<Member> {
  return invoke<Member>("member_save", { input, ...withActor() });
}

export async function updateMember(memberId: string, updates: Partial<Member>): Promise<void> {
  await invoke("member_update", { memberId, updates, ...withActor() });
}

export async function deleteMember(memberId: string): Promise<void> {
  await invoke("member_delete", { memberId, ...withActor() });
}

export async function hardDeleteMember(memberId: string): Promise<void> {
  await invoke("member_hard_delete", { memberId, ...withActor() });
}

export async function banMember(memberId: string, reason: string): Promise<void> {
  await invoke("member_ban", { memberId, reason, ...withActor() });
}

export async function unbanMember(memberId: string): Promise<void> {
  await invoke("member_unban", { memberId, ...withActor() });
}

// ─────────────────────────────── Circulation ───────────────────────────────

export async function loans(openOnly = false): Promise<Loan[]> {
  return invoke<Loan[]>("loans_list", { openOnly });
}

export async function getLoansForMember(memberId: string): Promise<Loan[]> {
  return invoke<Loan[]>("loans_for_member", { memberId });
}

export async function getReservationsForMember(memberId: string): Promise<Reservation[]> {
  return invoke<Reservation[]>("reservations_for_member", { memberId });
}

export async function checkout(memberId: string, copyIds: string[], limit: number, scope: ReservationScope = "external"): Promise<void> {
  await invoke("checkout", { memberId, copyIds, limit, scope, ...withActor() });
}

export async function returnCopies(copyIds: string[]): Promise<void> {
  await invoke("return_copies", { copyIds, ...withActor() });
}

export async function renewLoan(loanId: string): Promise<void> {
  await invoke("renew_loan", { loanId, ...withActor() });
}

export async function updateLoanDueDate(loanId: string, dueAt: string): Promise<void> {
  await invoke("loan_update_due", { loanId, dueAt, ...withActor() });
}

// ─────────────────────────────── Reservations ───────────────────────────────

export async function sweepReservations(): Promise<void> {
  await invoke("sweep_reservations", { ...withActor() });
}

export async function reservations(): Promise<Reservation[]> {
  return invoke<Reservation[]>("reservations_list", { ...withActor() });
}

export async function addReservation(bookId: string, memberId: string, scope: ReservationScope, expiresAt?: string | null): Promise<string> {
  return invoke<string>("reservation_add", { bookId, memberId, scope, expiresAt: expiresAt ?? null, ...withActor() });
}

export async function acceptReservation(reservationId: string, reason?: string | null): Promise<Reservation> {
  return invoke<Reservation>("reservation_accept", { reservationId, reason: reason ?? null, ...withActor() });
}

export async function declineReservation(reservationId: string, reason?: string | null): Promise<Reservation> {
  return invoke<Reservation>("reservation_decline", { reservationId, reason: reason ?? null, ...withActor() });
}

export async function fulfilReservation(reservationId: string): Promise<Loan> {
  return invoke<Loan>("reservation_fulfil", { reservationId, ...withActor() });
}

export async function extendReservation(reservationId: string, days = 7): Promise<void> {
  await invoke("reservation_extend", { reservationId, days, ...withActor() });
}

export async function updateReservation(reservationId: string, patch: { expiresAt?: string | null; scope?: ReservationScope }): Promise<void> {
  await invoke("reservation_update", { reservationId, patch, ...withActor() });
}

export async function cancelReservation(reservationId: string): Promise<void> {
  await invoke("reservation_cancel", { reservationId, ...withActor() });
}

export async function deleteReservation(reservationId: string): Promise<void> {
  await invoke("reservation_delete", { reservationId, ...withActor() });
}

// ─────────────────────────────── Fines ───────────────────────────────

export async function fines(): Promise<FineRow[]> {
  return invoke<FineRow[]>("fines_list");
}

export async function payFine(fineId: string): Promise<void> {
  await invoke("fine_pay", { fineId, ...withActor() });
}

export async function waiveFine(fineId: string, reason: string): Promise<void> {
  await invoke("fine_waive", { fineId, reason, ...withActor() });
}

// ─────────────────────────────── Rooms / Columns / Shelves ───────────────────────────────

export async function getRooms(): Promise<Room[]> {
  return invoke<Room[]>("rooms_list");
}

export async function createRoom(name: string, notes?: string | null): Promise<Room> {
  return invoke<Room>("room_create", { name, notes: notes ?? null, ...withActor() });
}

export async function renameRoom(roomId: string, newName: string): Promise<void> {
  await invoke("room_rename", { roomId, newName, ...withActor() });
}

export async function deleteRoom(roomId: string): Promise<void> {
  await invoke("room_delete", { roomId, ...withActor() });
}

export async function getColumns(): Promise<Column[]> {
  return invoke<Column[]>("columns_list");
}

export async function createColumn(roomId: string, rows: string[]): Promise<string> {
  return invoke<string>("column_create", { roomId, rows, ...withActor() });
}

export async function deleteColumn(columnId: string): Promise<void> {
  await invoke("column_delete", { columnId, ...withActor() });
}

export async function getShelves(): Promise<Shelf[]> {
  return invoke<Shelf[]>("shelves_list");
}

export async function createShelf(columnId: string, code: string, shelfType: "top" | "floor" = "top", capacity = shelfType === "floor" ? 120 : 40): Promise<string> {
  return invoke<string>("shelf_create", { columnId, code, shelfType, capacity, ...withActor() });
}

export async function updateShelf(shelfId: string, updates: { capacity?: number; notes?: string | null }): Promise<void> {
  await invoke("shelf_update", { shelfId, updates, ...withActor() });
}

// ─────────────────────────────── Notifications / Audit ───────────────────────────────

export async function notifications(limit = 100): Promise<AppNotification[]> {
  return invoke<AppNotification[]>("notifications_list", { limit });
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await invoke("notification_mark_read", { notificationId });
}

export async function markAllNotificationsRead(): Promise<void> {
  await invoke("notifications_mark_all");
}

export async function auditLog(limit = 500) {
  return invoke<unknown[]>("audit_log", { limit });
}

// ─────────────────────────────── Backup / Restore ───────────────────────────────

export interface LibraryBackup {
  _version: number;
  _exported_at: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function exportLibraryBackup(): Promise<LibraryBackup> {
  return invoke<LibraryBackup>("backup_export");
}

export async function importLibraryBackup(backup: LibraryBackup): Promise<Record<string, number>> {
  const counts = await invoke<Record<string, number>>("backup_import", { backup, ...withActor() });
  return counts;
}

export async function deleteAllLibraryData(): Promise<Record<string, number>> {
  return invoke<Record<string, number>>("library_wipe", { ...withActor() });
}

// ─────────────────────────────── Library Settings ───────────────────────────────

export async function getLibrarySettings(): Promise<LibrarySettings> {
  return invoke<LibrarySettings>("settings_get");
}

export async function saveLibrarySettings(values: Partial<LibrarySettings>): Promise<void> {
  await invoke("settings_save", { values, ...withActor() });
}
