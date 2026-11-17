/**
 * KetabYar's data services — every screen talks to the database exclusively
 * through this module family. Business rules live here so the UI stays thin
 * and the rules stay testable:
 *
 *  • Circulation scopes: "internal" (reading-room, uncapped, short) and
 *    "external" (take-home, capped by loan_limit, full loan period).
 *  • Holds: pending → accept → ready (copy bound) | queued (position held);
 *    promotion happens automatically whenever a copy frees up.
 *  • Fines: charged once per loan, on return, per overdue day after the
 *    configured grace period, capped by max_fine_amount.
 *  • Deletes are soft by default (archive) and refused while copies are out.
 *
 * The implementation is split by domain (pure move — see librarySqlShared
 * for the helpers shared across domains); this file re-exports the whole
 * public API so callers keep importing from "./librarySql".
 */

export * from "./librarySqlCatalog";
export {
  checkout,
  fines,
  getLoansForMember,
  getReservationsForMember,
  loans,
  payFine,
  renewLoan,
  returnCopies,
  updateLoanDueDate,
  waiveFine,
} from "./librarySqlLoans";
export * from "./librarySqlMembers";
export * from "./librarySqlPlaces";
export * from "./librarySqlReservations";
export * from "./librarySqlSystem";
