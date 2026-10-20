import { select, exec, uid, nowIso } from "./localDb";

/**
 * First-run seed: a small, realistic Persian **university library** so every
 * screen demonstrates itself out of the box (dashboard counts, circulation,
 * overdue fines, reservation queue…). Runs only when the library is empty.
 */

const iso = (offsetDays: number, hourOffset = 0) =>
  new Date(Date.now() + offsetDays * 86400000 + hourOffset * 3600000).toISOString();

interface SeedBook { title: string; author: string; publisher: string; category: string; year: number; isbn13: string; copies: number; shelf?: string; }

const BOOKS: SeedBook[] = [
  { title: "ریاضیات عمومی ۱", author: "محمدحسین شفیعیها", publisher: "انتشارات مرکز نشر دانشگاهی", category: "ریاضیات", year: 1398, isbn13: "9789645301275", copies: 3 },
  { title: "حساب دیفرانسیل و انتگرال", author: "پرویز شهریاری", publisher: "انتشارات خوارزمی", category: "ریاضیات", year: 1395, isbn13: "9789644870459", copies: 2 },
  { title: "فیزیک پایه ۱ و ۲", author: "جلال‌الدین پاشایی", publisher: "انتشارات دانشگاه تهران", category: "فیزیک", year: 1399, isbn13: "9786006501172", copies: 3 },
  { title: "مکانیک کوانتومی", author: "مهری باهری", publisher: "انتشارات مرکز نشر دانشگاهی", category: "فیزیک", year: 1397, isbn13: "9789645302417", copies: 1 },
  { title: "مبانی کامپیوتر و برنامه‌نویسی", author: "علی ماهیار", publisher: "انتشارات امیرکبیر", category: "مهندسی کامپیوتر", year: 1400, isbn13: "9789644632823", copies: 4 },
  { title: "ساختار داده‌ها و الگوریتم‌ها", author: "حمید داودی", publisher: "انتشارات نص", category: "مهندسی کامپیوتر", year: 1401, isbn13: "9786003331681", copies: 2 },
  { title: "شبکه‌های کامپیوتری", author: "اصغر بیات", publisher: "انتشارات نص", category: "مهندسی کامپیوتر", year: 1399, isbn13: "9786003331759", copies: 2 },
  { title: "هوش مصنوعی: رویکرد مدرن", author: "سعید منصوری", publisher: "انتشارات دانشگاه صنعتی شریف", category: "مهندسی کامپیوتر", year: 1402, isbn13: "9786229180016", copies: 1 },
  { title: "تاریخ ادبیات ایران", author: "ذبیح‌الله صفا", publisher: "انتشارات فردوس", category: "ادبیات فارسی", year: 1390, isbn13: "9789643204066", copies: 2 },
  { title: "غزلیات حافظ", author: "خواجه شمس‌الدین محمد حافظ", publisher: "انتشارات هرمس", category: "ادبیات فارسی", year: 1394, isbn13: "9789643630011", copies: 3 },
  { title: "تاریخ ایران باستان", author: "حسن پیرنیا", publisher: "انتشارات نگاه", category: "تاریخ", year: 1388, isbn13: "9789643510976", copies: 2 },
  { title: "مقدمه‌ای بر تاریخ اسلام", author: "علی اکبر فلاحی", publisher: "انتشارات سمت", category: "تاریخ", year: 1396, isbn13: "9786004550776", copies: 1 },
  { title: "حقوق مدنی: اشخاص", author: "ناصر کاتوزیان", publisher: "انتشارات بهمن برنا", category: "حقوق", year: 1393, isbn13: "9789643410076", copies: 2 },
  { title: "اصول فقه", author: "محمد جواد فاضل لنکرانی", publisher: "انتشارات سمت", category: "الهیات", year: 1395, isbn13: "9786004550219", copies: 1 },
  { title: "اقتصاد خرد", author: "فریدون تفضلی", publisher: "انتشارات نشر نو", category: "اقتصاد", year: 1397, isbn13: "9789645730136", copies: 2 },
  { title: "آناتومی انسان", author: "علیرضا رجبی", publisher: "انتشارات جامع‌النبی", category: "پزشکی", year: 1398, isbn13: "9786008910132", copies: 3 },
  { title: "بیوشیمی عمومی", author: "علی اصغر پرهیزگار", publisher: "انتشارات دانشگاه علوم پزشکی تهران", category: "پزشکی", year: 1394, isbn13: "9786006790125", copies: 2 },
  { title: "مقاومت مصالح", author: "فریدون وفایی", publisher: "انتشارات دانشگاه علم و صنعت", category: "مهندسی عمران", year: 1399, isbn13: "9786009150186", copies: 2 },
];

const MEMBERS = [
  { full_name: "زهرا محمدی", role: "student", department: "مهندسی کامپیوتر", phone: "09121234567", member_number: "401122334", expiry: 300 },
  { full_name: "امیرحسین کریمی", role: "student", department: "مهندسی برق", phone: "09351112233", member_number: "401122335", expiry: 300 },
  { full_name: "فاطمه رضایی", role: "student", department: "پزشکی", phone: "09195556677", member_number: "401122336", expiry: 180 },
  { full_name: "دکتر محمود احمدی", role: "medic", department: "مهندسی کامپیوتر", phone: "09127778899", member_number: "F-1042", expiry: 700 },
  { full_name: "دکتر لیلا موسوی", role: "medic", department: "حقوق", phone: "09123334455", member_number: "F-2087", expiry: 700 },
  { full_name: "حسین نیک‌پور", role: "staff", department: "امور اداری", phone: "09124445566", member_number: "S-0031", expiry: 500 },
];

export async function seedIfEmpty(): Promise<void> {
  const existing = await select<{ n: number }>(`SELECT COUNT(*) AS n FROM books`);
  if ((existing[0]?.n ?? 0) > 0) return;

  // ── Rooms, bookcase columns and shelves ────────────────────────────────
  const mainRoomId = uid();
  const refRoomId = uid();
  await exec(`INSERT INTO rooms (id, name, notes, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [mainRoomId, "سالن اصلی", "قفسه‌های امانت‌دادن", nowIso(), nowIso()]);
  await exec(`INSERT INTO rooms (id, name, notes, created_at, updated_at) VALUES (?,?,?,?,?)`,
    [refRoomId, "سالن مرجع", "منابع فقط در کتابخانه", nowIso(), nowIso()]);

  const shelfIds: Record<string, string> = {};
  const provisionColumn = async (roomId: string, number: number, rows: string[]) => {
    const colId = uid();
    await exec(`INSERT INTO columns (id, room_id, number, created_at, updated_at) VALUES (?,?,?,?,?)`, [colId, roomId, number, nowIso(), nowIso()]);
    shelfIds[`${number}-S`] = uid();
    await exec(`INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [shelfIds[`${number}-S`], colId, "floor", "S", 120, nowIso(), nowIso()]);
    for (const r of rows) {
      shelfIds[`${number}-${r}`] = uid();
      await exec(`INSERT INTO shelves (id, column_id, shelf_type, code, capacity, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
        [shelfIds[`${number}-${r}`], colId, "top", r, 40, nowIso(), nowIso()]);
    }
  };
  await provisionColumn(mainRoomId, 1, ["A", "B", "C", "D", "E", "F"]);
  await provisionColumn(refRoomId, 1, ["A", "B", "C"]);

  // ── Reference data ──────────────────────────────────────────────────────
  const catIds: Record<string, string> = {};
  for (const name of [...new Set(BOOKS.map((b) => b.category))]) {
    const id = uid();
    catIds[name] = id;
    await exec(`INSERT INTO categories (id, name) VALUES (?,?)`, [id, name]);
  }
  const pubIds: Record<string, string> = {};
  for (const name of [...new Set(BOOKS.map((b) => b.publisher))]) {
    const id = uid();
    pubIds[name] = id;
    await exec(`INSERT INTO publishers (id, name) VALUES (?,?)`, [id, name]);
  }
  const authorIds: Record<string, string> = {};
  for (const name of [...new Set(BOOKS.map((b) => b.author))]) {
    const id = uid();
    authorIds[name] = id;
    await exec(`INSERT INTO authors (id, name, normalized_name) VALUES (?,?,?)`, [id, name, name.toLowerCase()]);
  }

  // ── Books + copies ──────────────────────────────────────────────────────
  const bookIds: string[] = [];
  const copyIdsByBook: Record<string, string[]> = {};
  for (const b of BOOKS) {
    const bookId = uid();
    bookIds.push(bookId);
    copyIdsByBook[bookId] = [];
    await exec(
      `INSERT INTO books (id, item_type, isbn13, title, language, publication_year, publisher_id, category_id, call_number, cover_url, source, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [bookId, "book", b.isbn13, b.title, "فارسی", b.year, pubIds[b.publisher], catIds[b.category],
        `${b.category.slice(0, 2)}-${100 + Math.floor(Math.random() * 900)}`,
        `https://covers.openlibrary.org/bn/${b.isbn13}-M.jpg?default=false`, "seed", nowIso(), nowIso()]);
    await exec(`INSERT INTO book_authors (book_id, author_id, author_order) VALUES (?,?,0)`, [bookId, authorIds[b.author]]);
    for (let c = 0; c < b.copies; c++) {
      const copyId = uid();
      copyIdsByBook[bookId].push(copyId);
      const shelfKey = c === 0 ? `1-${["A", "B", "C", "D", "E", "F"][Math.floor(Math.random() * 6)]}` : `1-S`;
      await exec(
        `INSERT INTO copies (id, book_id, accession_number, barcode, shelf_id, acquisition_date, condition, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [copyId, bookId, `KB-${1000 + bookIds.length * 10 + c}`, `BAR${b.isbn13.slice(-8)}${c}`, shelfIds[shelfKey] ?? null,
          iso(-400), "good", "available", nowIso(), nowIso()]);
    }
  }

  // ── Members ─────────────────────────────────────────────────────────────
  const memberIds: string[] = [];
  for (const m of MEMBERS) {
    const id = uid();
    memberIds.push(id);
    await exec(
      `INSERT INTO members (id, member_number, full_name, phone, department, role, joined_at, expiry_date, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [id, m.member_number, m.full_name, m.phone, m.department, m.role, iso(-120), iso(m.expiry), "active", nowIso(), nowIso()]);
  }

  // ── Loans: 2 on-time active, 1 due-soon, 1 overdue, 1 returned ─────────
  const addLoan = async (bookIdx: number, copyIdx: number, memberIdx: number, borrowedDaysAgo: number, loanDays: number, returned?: boolean) => {
    const bookId = bookIds[bookIdx];
    const copyId = copyIdsByBook[bookId][copyIdx];
    const loanId = uid();
    const borrowedAt = iso(-borrowedDaysAgo);
    const dueAt = iso(-borrowedDaysAgo + loanDays);
    await exec(
      `INSERT INTO loans (id, copy_id, member_id, scope, borrowed_at, due_at, returned_at, issued_by, condition_out)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [loanId, copyId, memberIds[memberIdx], "external", borrowedAt, dueAt, returned ? iso(-borrowedDaysAgo + loanDays - 2) : null,
        "ketabdar", "good"]);
    await exec(`UPDATE copies SET status = ? WHERE id = ?`, [returned ? "available" : "on-loan", copyId]);
    return loanId;
  };
  await addLoan(0, 0, 0, 3, 14);            // active, due in ~11 days
  await addLoan(4, 0, 3, 10, 14);           // faculty, due in ~4 days (due soon)
  await addLoan(9, 0, 1, 26, 14);           // OVERDUE by ~12 days (will produce a fine on return)
  await addLoan(5, 0, 2, 30, 14, true);     // returned on time-ish

  // ── Reservations: one pending, one queued, one ready ────────────────────
  await exec(
    `INSERT INTO reservations (id, book_id, member_id, scope, status, position, requested_at) VALUES (?,?,?,?,?,0,?)`,
    [uid(), bookIds[7], memberIds[2], "external", "pending", nowIso()]); // هوش مصنوعی — single copy on loan → pending
  await exec(
    `INSERT INTO reservations (id, book_id, member_id, scope, status, position, requested_at, reserved_at, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?,'ketabdar',?)`,
    [uid(), bookIds[3], memberIds[4], "external", "queued", 1, iso(-2), iso(-2), iso(-2)]); // مکانیک کوانتومی — copy on loan → queued
  const readyResId = uid();
  const readyCopyId = copyIdsByBook[bookIds[10]][0];
  await exec(
    `INSERT INTO reservations (id, book_id, member_id, copy_id, scope, status, position, requested_at, reserved_at, expires_at, decided_by, decided_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [readyResId, bookIds[10], memberIds[0], readyCopyId, "external", "ready", 0, iso(-1), iso(-1), iso(2), "ketabdar", iso(-1)]);
  await exec(`UPDATE copies SET status = 'reserved' WHERE id = ?`, [readyCopyId]);
  await exec(
    `INSERT INTO notifications (id, type, title, body, link, entity_type, entity_id, is_read, created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    [uid(), "reservation_ready", "تاریخ ایران باستان", "زهرا محمدی", "/reservations", "reservation", readyResId, 0, nowIso()]);

  // ── Audit ───────────────────────────────────────────────────────────────
  await exec(
    `INSERT INTO audit_logs (id, actor, action, entity_type, entity_id, after_json, created_at) VALUES (?,?,?,?,?,?,?)`,
    [uid(), "system", "seed", "library", "first-run", JSON.stringify({ books: BOOKS.length, members: MEMBERS.length }), nowIso()]);
}
