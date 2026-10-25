// @vitest-environment node
/**
 * Behavioural integration tests for the TypeScript edition's repository layer.
 *
 * `@tauri-apps/plugin-sql` is replaced with an adapter backed by Node's
 * built-in SQLite (node:sqlite), so the REAL schema and the REAL repository
 * code run against a genuine SQLite engine in memory — the exact SQL the
 * KetabYar_* installers execute in the webview.
 *
 * The business rules exercised here mirror the Rust core's own test-suite
 * (src-tauri/core/tests/integration.rs) so both editions are held to the same
 * contract: circulation rules, the visitor gate, all-or-nothing loan limits,
 * fine caps, reservation queues, the student-ID (کد دانشجویی) rules, and the
 * backup roundtrip.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseSync } from "node:sqlite";

const holder = vi.hoisted(() => ({ conn: null as unknown }));

vi.mock("@tauri-apps/plugin-sql", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  if (!holder.conn) holder.conn = new DatabaseSync(":memory:") as unknown;
  const normalize = (params: unknown[]) =>
    // Tauri serializes `undefined` to JSON null and SQLite has no boolean type
    // (sqlx stores true/false as 1/0) — mirror both here.
    params.map((v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v));
  class MockDatabase {
    async select(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
      const rows = (holder.conn as DatabaseSync).prepare(sql).all(...(normalize(params) as never[]));
      return rows.map((row) => ({ ...row }));
    }
    async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId: number }> {
      const info = (holder.conn as DatabaseSync).prepare(sql).run(...(normalize(params) as never[]));
      return { rowsAffected: Number(info.changes), lastInsertId: Number(info.lastInsertRowid) };
    }
  }
  return { default: { load: async () => new MockDatabase() } };
});

import { ensureSchema } from "../schema";
import {
  acceptReservation,
  addCopy,
  addReservation,
  banMember,
  books,
  checkout,
  clearCirculation,
  copies,
  dashboard,
  deleteAllLibraryData,
  deleteBook,
  deleteMember,
  exportLibraryBackup,
  fulfilReservation,
  getLoansForMember,
  fines,
  getLibrarySettings,
  hardDeleteMember,
  importLibraryBackup,
  loans,
  markAllNotificationsRead,
  markNotificationRead,
  members,
  notifications,
  payFine,
  renewLoan,
  reportBreakdowns,
  reservations,
  returnCopies,
  saveBook,
  saveLibrarySettings,
  saveMember,
  sweepReservations,
  unbanMember,
  updateBook,
  updateLoanDueDate,
  updateMember,
  updateReservation,
} from "./librarySql";
import * as SQL from "./librarySql";
import * as RUST from "./libraryRust";
import * as LIB from "./library";

const DAY_MS = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString();

async function resetAll() {
  await deleteAllLibraryData();
  // Settings are NOT part of the business tables — wipe and re-seed the row
  // so every test starts from schema defaults.
  (holder.conn as DatabaseSync).exec("DELETE FROM library_settings");
  await ensureSchema();
}

async function member(number: string, role: string = "student") {
  return saveMember({ full_name: `عضو ${number}`, status: "active", role, member_number: number });
}

async function bookWithCopy(title: string, barcode: string) {
  await saveBook({ title, barcode, accession: `ACC-${barcode}`, author: "نویسنده آزمون", language: "فارسی" });
  const book = (await books(title)).find((b) => b.title === title)!;
  const copy = (await copies("")).find((c) => c.barcode === barcode)!;
  return { book, copy };
}

describe("librarySql repository (TS engine, real SQLite)", () => {
  beforeEach(async () => {
    await ensureSchema();
    await resetAll();
  });

  it("fresh boot is empty and healthy — zero seed data", async () => {
    expect(await books()).toEqual([]);
    expect(await members()).toEqual([]);
    const d = await dashboard();
    expect(d.titles).toBe(0);
    expect(d.copies).toBe(0);
    expect(d.members).toBe(0);
    expect(d.onLoan).toBe(0);
    expect(d.overdue).toBe(0);
    const s = await getLibrarySettings();
    expect(s.loan_days).toBe(14);
    expect(s.loan_limit).toBe(3);
    expect(s.fines_enabled).toBe(1);
    expect(s.library_name).toBe("کتابخانه مرکزی دانشگاه");
  });

  it("saveBook registers title, author, publisher, tags and the first copy; searchable by title and ISBN", async () => {
    await saveBook({
      title: "ریاضیات پایه", isbn13: "9786000000001", author: "الف. مردان",
      publisher: "نشر ریاضی", category: "علوم", tags: "ریاضی, مدرسه",
      barcode: "BAR-M1", accession: "ACC-M1", language: "فارسی",
    });
    const list = await books("ریاضیات");
    expect(list).toHaveLength(1);
    const b = list[0];
    expect(b.author).toBe("الف. مردان");
    expect(b.publisher).toBe("نشر ریاضی");
    expect(b.category).toBe("علوم");
    expect(b.total_copies).toBe(1);
    expect(b.available_copies).toBe(1);
    expect(await books("9786000000001")).toHaveLength(1);
  });

  it("duplicate barcode is rejected; duplicate accession auto-regenerates", async () => {
    await saveBook({ title: "الف", barcode: "BAR-D1" });
    await saveBook({ title: "ب", barcode: "BAR-D2", accession: "ACC-DUP" });
    const bookA = (await books("الف"))[0];
    await expect(addCopy(bookA.id, "BAR-D1", "ACC-X", "good")).rejects.toThrow("بارکد");
    await addCopy(bookA.id, "BAR-D3", "ACC-DUP", "good");
    const accessions = (await copies("")).map((c) => c.accession_number);
    expect(new Set(accessions).size).toBe(accessions.length);
  });

  it("updateBook patches only provided fields and swaps the author", async () => {
    await saveBook({ title: "کتاب ویرایش", isbn13: "9786000000002", author: "نویسنده اول", barcode: "BAR-U1" });
    const b = (await books("کتاب ویرایش"))[0];
    await updateBook(b.id, { subtitle: "ویرایش دوم", author: "نویسنده تازه" });
    const after = (await books("کتاب ویرایش"))[0];
    expect(after.subtitle).toBe("ویرایش دوم");
    expect(after.author).toBe("نویسنده تازه");
    expect(after.isbn13).toBe("9786000000002");
  });

  it("deleteBook is blocked while a copy is on loan, allowed after return", async () => {
    const { book, copy } = await bookWithCopy("کتاب بایگانی عنوان", "BAR-ARC1");
    const m = await member("610100");
    await checkout(m.id, [copy.id], 3, "external");
    await expect(deleteBook(book.id)).rejects.toThrow("امانت");
    await returnCopies([copy.id]);
    await deleteBook(book.id);
    expect(await books("کتاب بایگانی عنوان")).toEqual([]);
  });

  it("member is saved by the typed student ID (کد دانشجویی), Persian digits normalized, duplicates refused", async () => {
    const created = await saveMember({
      full_name: "سارا محمدی", status: "active", role: "student", member_number: "۴۰۲۱۳۴۵",
    });
    expect(created.member_number).toBe("4021345");
    const found = await members("۴۰۲");
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(created.id);
    await expect(
      saveMember({ full_name: "دیگری", status: "active", role: "student", member_number: "4021345" }),
    ).rejects.toThrow("این کد دانشجویی قبلاً ثبت شده است.");
    const other = await member("999999");
    await expect(updateMember(other.id, { member_number: "4021345" })).rejects.toThrow("قبلاً ثبت شده");
  });

  it("member archive and hard-delete follow loan-history rules", async () => {
    const m = await member("610200");
    const { copy } = await bookWithCopy("کتاب بایگانی عضو", "BAR-ARC2");
    await checkout(m.id, [copy.id], 3, "external");
    await expect(deleteMember(m.id)).rejects.toThrow("امانت باز");
    await expect(hardDeleteMember(m.id)).rejects.toThrow("تاریخچه");
    await returnCopies([copy.id]);
    await deleteMember(m.id);
    expect(await members("610200")).toHaveLength(0);
    await expect(hardDeleteMember(m.id)).rejects.toThrow();
  });

  it("visitor cannot checkout external but internal is allowed", async () => {
    const v = await member("444444", "visitor");
    const { copy } = await bookWithCopy("کتاب مهمان", "BAR-V");
    await expect(checkout(v.id, [copy.id], 3, "external")).rejects.toThrow("مهمانان اجازهٔ امانت بیرون‌بر ندارند.");
    await checkout(v.id, [copy.id], 3, "internal");
    expect((await loans(true))[0].scope).toBe("internal");
  });

  it("batch checkout is all-or-nothing: a bad copy must leave NO partial loans (v1.2.5 atomicity audit)", async () => {
    const m = await member("610200");
    const good = await bookWithCopy("کتاب آزاد اتمی", "BAR-AT1");
    const taken = await bookWithCopy("کتاب اشغال اتمی", "BAR-AT2");
    const other = await member("610201");
    await checkout(other.id, [taken.copy.id], 3, "external");

    // The batch hits the on-loan copy second: without pre-validation the
    // first copy was already issued and left dangling after the error.
    await expect(checkout(m.id, [good.copy.id, taken.copy.id], 3, "external")).rejects.toThrow("قابل امانت نیست");

    const loansForMember = await getLoansForMember(m.id);
    expect(loansForMember).toEqual([]);
    const goodCopyAfter = (await copies("")).find((c) => c.id === good.copy.id)!;
    expect(goodCopyAfter.status).toBe("available");
  });

  it("banned member cannot checkout external until unbanned", async () => {
    const m = await member("555555");
    const first = await bookWithCopy("کتاب محروم یک", "BAR-BAN1");
    const second = await bookWithCopy("کتاب محروم دو", "BAR-BAN2");
    await banMember(m.id, "تاخیر مزمن");
    await expect(checkout(m.id, [first.copy.id], 3, "external")).rejects.toThrow("محروم");
    await checkout(m.id, [first.copy.id], 3, "internal");
    await unbanMember(m.id);
    await checkout(m.id, [second.copy.id], 3, "external");
  });

  it("external loan limit is all-or-nothing per batch and enforced one-by-one", async () => {
    await saveLibrarySettings({ loan_limit: 1 });
    const m = await member("333333");
    const a = await bookWithCopy("کتاب سقف یک", "BAR-L1");
    const b = await bookWithCopy("کتاب سقف دو", "BAR-L2");
    await expect(checkout(m.id, [a.copy.id, b.copy.id], 1, "external")).rejects.toThrow("سقف امانت 1 مورد رعایت نشده است.");
    expect(await loans(true)).toHaveLength(0);
    await checkout(m.id, [a.copy.id], 1, "external");
    await expect(checkout(m.id, [b.copy.id], 1, "external")).rejects.toThrow("سقف امانت");
  });

  it("return charges one overdue fine with grace period and cap; payment closes it", async () => {
    await saveLibrarySettings({ grace_period_enabled: true, grace_period_days: 2, fine_per_day: 500, max_fine_amount: 1200 });
    const { copy } = await bookWithCopy("کتاب جریمه", "BAR-F");
    const m = await member("700100");
    await checkout(m.id, [copy.id], 3, "external");
    const open = (await loans(true))[0];
    await updateLoanDueDate(open.id, daysAgo(5));
    await returnCopies([copy.id]);
    const rows = await fines();
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(1200); // (5 - 2) × 500 = 1500 → capped at 1200
    expect(rows[0].status).toBe("open");
    await payFine(rows[0].id);
    expect((await fines())[0].status).toBe("paid");
  });

  it("renew respects the renew limit and extends from max(due, now)", async () => {
    await saveLibrarySettings({ renew_limit: 2 });
    const { copy } = await bookWithCopy("کتاب تمدید", "BAR-RN");
    const m = await member("710100");
    await checkout(m.id, [copy.id], 3, "external");
    const loan = (await loans(true))[0];
    const due0 = new Date(loan.due_at).getTime();
    await renewLoan(loan.id);
    const l1 = (await loans(true))[0];
    expect(l1.renewed_count).toBe(1);
    expect(new Date(l1.due_at).getTime()).toBe(due0 + 14 * DAY_MS);
    await renewLoan(loan.id);
    await expect(renewLoan(loan.id)).rejects.toThrow("سقف تمدید");
  });

  it("reservation lifecycle: queued while no copy is free, promoted on return, fulfilled as a loan", async () => {
    const a = await member("800001");
    const b = await member("800002");
    const { book, copy } = await bookWithCopy("کتاب رزرو", "BAR-RES");
    await checkout(b.id, [copy.id], 3, "external");
    const rid = await addReservation(book.id, a.id, "external");
    const accepted = await acceptReservation(rid);
    expect(accepted.status).toBe("queued");
    await returnCopies([copy.id]);
    const holds = await reservations();
    expect(holds.find((h) => h.id === rid)!.status).toBe("ready");
    const loan = await fulfilReservation(rid);
    expect(loan.member_id).toBe(a.id);
    expect(loan.returned_at ?? null).toBeNull();
    expect((await copies("")).find((c) => c.id === copy.id)!.status).toBe("on-loan");
  });

  it("sweepReservations expires uncollected ready holds and frees the copy", async () => {
    const { book, copy } = await bookWithCopy("کتاب انقضا", "BAR-EXP");
    const a = await member("800101");
    const rid = await addReservation(book.id, a.id, "external");
    await acceptReservation(rid);
    expect((await copies("")).find((c) => c.id === copy.id)!.status).toBe("reserved");
    await updateReservation(rid, { expiresAt: daysAgo(1) });
    await sweepReservations();
    expect((await reservations()).find((h) => h.id === rid)!.status).toBe("expired");
    expect((await copies("")).find((c) => c.id === copy.id)!.status).toBe("available");
  });

  it("backup export → factory reset → import restores the library", async () => {
    await bookWithCopy("کتاب پشتیبان", "BAR-BAK");
    await member("900100");
    const backup = await exportLibraryBackup();
    expect(backup._version).toBe(1);
    expect(backup.tables.books).toHaveLength(1);
    await deleteAllLibraryData();
    expect(await books()).toEqual([]);
    await importLibraryBackup(backup);
    expect(await books()).toHaveLength(1);
    expect(await members()).toHaveLength(1);
    expect(await copies("")).toHaveLength(1);
  });

  it("library settings roundtrip with boolean coercion", async () => {
    await saveLibrarySettings({ grace_period_enabled: true, fine_per_day: 750 });
    const s = await getLibrarySettings();
    expect(s.grace_period_enabled).toBe(1);
    expect(s.fine_per_day).toBe(750);
  });

  it("reportBreakdowns aggregates and clearCirculation resets circulation", async () => {
    const { copy } = await bookWithCopy("کتاب گزارش", "BAR-REP");
    const m = await member("910100");
    await checkout(m.id, [copy.id], 3, "external");
    const r = await reportBreakdowns();
    expect(r.copyStatuses.find((x) => x.label === "on-loan")!.n).toBe(1);
    expect(r.memberRoles.find((x) => x.label === "student")!.n).toBe(1);
    expect(r.loanCategories.find((x) => x.label === "")!.n).toBe(1);
    await clearCirculation();
    expect(await loans(true)).toHaveLength(0);
    expect((await copies("")).find((c) => c.id === copy.id)!.status).toBe("available");
  });

  it("notifications: mark once succeeds, re-mark throws, mark-all clears", async () => {
    const { book } = await bookWithCopy("کتاب اعلان", "BAR-NTF");
    const m = await member("920100");
    const rid = await addReservation(book.id, m.id, "external");
    await acceptReservation(rid);
    const list = await notifications();
    expect(list.length).toBeGreaterThan(0);
    await markNotificationRead(list[0].id);
    await expect(markNotificationRead(list[0].id)).rejects.toThrow();
    await markAllNotificationsRead();
    expect((await notifications()).every((n) => Number(n.is_read) === 1)).toBe(true);
  });

  it("engine contract: the Rust adapter exposes the exact same API surface as the SQL module", () => {
    const sqlKeys = Object.keys(SQL).sort();
    const rustKeys = Object.keys(RUST).sort();
    expect(rustKeys).toEqual(sqlKeys);
    for (const key of sqlKeys) {
      expect(typeof (RUST as unknown as Record<string, unknown>)[key]).toBe("function");
    }
    expect(LIB.activeBackend).toBe("ts");
    expect(LIB.dashboard).toBe(SQL.dashboard);
    expect(LIB.checkout).toBe(SQL.checkout);
  });

  it("engine contract: the Rust auth adapter exposes the exact same API surface as the SQL auth module", async () => {
    const [AUTH_SQL, AUTH_RUST, AUTH] = await Promise.all([
      import("../authSql"),
      import("../authRust"),
      import("../auth"),
    ]);
    const sqlKeys = Object.keys(AUTH_SQL)
      .filter((k) => typeof (AUTH_SQL as unknown as Record<string, unknown>)[k] === "function")
      .sort();
    const rustKeys = Object.keys(AUTH_RUST)
      .filter((k) => typeof (AUTH_RUST as unknown as Record<string, unknown>)[k] === "function")
      .sort();
    expect(rustKeys).toEqual(sqlKeys);
    for (const key of sqlKeys) {
      expect(typeof (AUTH_RUST as unknown as Record<string, unknown>)[key]).toBe("function");
    }
    expect(AUTH.activeAuthBackend).toBe("ts");
    expect(AUTH.login).toBe(AUTH_SQL.login);
    expect(AUTH.currentSession).toBe(AUTH_SQL.currentSession);
  });
});
