/**
 * KetabYar repository dispatcher — the single import point for every section.
 *
 * Two interchangeable engines implement the identical public API:
 *   • `librarySql.ts`  — TypeScript edition: SQL runs in the webview through
 *     tauri-plugin-sql (SQLite).
 *   • `libraryRust.ts` — Rust edition: SQL runs natively in ketabyar-core
 *     (rusqlite) behind Tauri commands, with ts-rs-generated bindings.
 *
 * The backend is chosen at build time:
 *   npm run build        → TS edition  (VITE_KETABYAR_BACKEND=ts, default)
 *   npm run build:rust   → Rust edition (VITE_KETABYAR_BACKEND=rust)
 *
 * `impl` is typed as `typeof SQL` so the Rust module must stay structurally
 * identical to the SQL module — the compiler is the compatibility contract.
 */
import * as SQL from "./librarySql";
import * as RUST from "./libraryRust";

const backend = (import.meta.env.VITE_KETABYAR_BACKEND as string | undefined) ?? "ts";
export const activeBackend: "ts" | "rust" = backend === "rust" ? "rust" : "ts";

const impl: typeof SQL = activeBackend === "rust" ? RUST : SQL;

// ── Dashboard ──
export const dashboard = impl.dashboard;

// ── Books & copies ──
export const books = impl.books;
export const saveBook = impl.saveBook;
export const updateBook = impl.updateBook;
export const deleteBook = impl.deleteBook;
export const getCopiesForBook = impl.getCopiesForBook;
export const addCopy = impl.addCopy;
export const updateCopy = impl.updateCopy;
export const deleteCopy = impl.deleteCopy;
export const copies = impl.copies;

// ── Members ──
export const members = impl.members;
export const saveMember = impl.saveMember;
export const updateMember = impl.updateMember;
export const deleteMember = impl.deleteMember;
export const hardDeleteMember = impl.hardDeleteMember;
export const banMember = impl.banMember;
export const unbanMember = impl.unbanMember;

// ── Circulation ──
export const loans = impl.loans;
export const getLoansForMember = impl.getLoansForMember;
export const getReservationsForMember = impl.getReservationsForMember;
export const checkout = impl.checkout;
export const returnCopies = impl.returnCopies;
export const renewLoan = impl.renewLoan;
export const updateLoanDueDate = impl.updateLoanDueDate;

// ── Reservations ──
export const sweepReservations = impl.sweepReservations;
export const reservations = impl.reservations;
export const addReservation = impl.addReservation;
export const acceptReservation = impl.acceptReservation;
export const declineReservation = impl.declineReservation;
export const fulfilReservation = impl.fulfilReservation;
export const extendReservation = impl.extendReservation;
export const updateReservation = impl.updateReservation;
export const cancelReservation = impl.cancelReservation;
export const deleteReservation = impl.deleteReservation;

// ── Fines ──
export const fines = impl.fines;
export const payFine = impl.payFine;
export const waiveFine = impl.waiveFine;

// ── Inventory ──
export const getRooms = impl.getRooms;
export const createRoom = impl.createRoom;
export const renameRoom = impl.renameRoom;
export const deleteRoom = impl.deleteRoom;
export const getColumns = impl.getColumns;
export const createColumn = impl.createColumn;
export const deleteColumn = impl.deleteColumn;
export const getShelves = impl.getShelves;
export const createShelf = impl.createShelf;
export const updateShelf = impl.updateShelf;

// ── Notifications / Audit ──
export const notifications = impl.notifications;
export const markNotificationRead = impl.markNotificationRead;
export const markAllNotificationsRead = impl.markAllNotificationsRead;
export const auditLog = impl.auditLog;

// ── Backup / Restore ──
export const exportLibraryBackup = impl.exportLibraryBackup;
export const importLibraryBackup = impl.importLibraryBackup;
export const deleteAllLibraryData = impl.deleteAllLibraryData;

// ── Settings ──
export const getLibrarySettings = impl.getLibrarySettings;
export const saveLibrarySettings = impl.saveLibrarySettings;

// Shared shapes (single source of truth lives in the SQL module).
export type { FineRow, LibraryBackup } from "./librarySql";
