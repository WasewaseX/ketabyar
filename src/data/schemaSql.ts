import { exec, getDb } from "./localDb";

/**
 * KetabYar SQLite schema — **TypeScript edition** implementation (the complete
 * local library model): catalog (books, authors, publishers, tags, copies),
 * membership, circulation (loans, reservations, fines), the physical shelf map
 * (rooms → columns → shelves), notifications and the audit trail. Every
 * statement is idempotent so first boot and later boots are identical.
 * Selected by the build-time dispatcher in `schema.ts`; the Rust edition runs
 * the byte-identical DDL natively (ketabyar-core `schema.rs`) instead.
 */

const TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (room_id, number)
  )`,
  `CREATE TABLE IF NOT EXISTS shelves (
    id TEXT PRIMARY KEY,
    column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
    shelf_type TEXT NOT NULL DEFAULT 'top',
    code TEXT NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 40,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (column_id, code)
  )`,
  `CREATE TABLE IF NOT EXISTS publishers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    city TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    parent_id TEXT REFERENCES categories(id),
    color TEXT,
    description TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL UNIQUE,
    biography TEXT,
    external_ids TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS books (
    id TEXT PRIMARY KEY,
    item_type TEXT NOT NULL DEFAULT 'book',
    isbn10 TEXT,
    isbn13 TEXT,
    title TEXT NOT NULL,
    arabic_title TEXT,
    persian_title TEXT,
    subtitle TEXT,
    description TEXT,
    language TEXT NOT NULL DEFAULT 'فارسی',
    publication_year INTEGER,
    publication_date TEXT,
    edition TEXT,
    page_count INTEGER,
    cover_path TEXT,
    cover_url TEXT,
    publisher_id TEXT REFERENCES publishers(id),
    category_id TEXT REFERENCES categories(id),
    call_number TEXT,
    dewey_code TEXT,
    notes TEXT,
    tags TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS book_authors (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES authors(id),
    author_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (book_id, author_id)
  )`,
  `CREATE TABLE IF NOT EXISTS book_tags (
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY (book_id, tag_id)
  )`,
  `CREATE TABLE IF NOT EXISTS copies (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    accession_number TEXT NOT NULL UNIQUE,
    barcode TEXT NOT NULL UNIQUE,
    shelf_id TEXT REFERENCES shelves(id),
    acquisition_date TEXT,
    acquisition_source TEXT,
    price REAL,
    condition TEXT NOT NULL DEFAULT 'good',
    status TEXT NOT NULL DEFAULT 'available',
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY,
    member_number TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    department TEXT,
    role TEXT NOT NULL DEFAULT 'visitor',
    address TEXT,
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    expiry_date TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    reservation_banned INTEGER NOT NULL DEFAULT 0,
    ban_reason TEXT,
    banned_at TEXT,
    notes TEXT,
    avatar_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    archived_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY,
    copy_id TEXT NOT NULL REFERENCES copies(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    scope TEXT NOT NULL DEFAULT 'external',
    borrowed_at TEXT NOT NULL DEFAULT (datetime('now')),
    due_at TEXT NOT NULL,
    returned_at TEXT,
    renewed_count INTEGER NOT NULL DEFAULT 0,
    issued_by TEXT,
    received_by TEXT,
    condition_out TEXT,
    condition_in TEXT,
    notes TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES books(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    copy_id TEXT REFERENCES copies(id),
    scope TEXT NOT NULL DEFAULT 'internal',
    status TEXT NOT NULL DEFAULT 'pending',
    position INTEGER NOT NULL DEFAULT 0,
    requested_at TEXT NOT NULL DEFAULT (datetime('now')),
    reserved_at TEXT,
    expires_at TEXT,
    fulfilled_at TEXT,
    decided_by TEXT,
    decided_at TEXT,
    decision_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS fines (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL REFERENCES loans(id),
    member_id TEXT NOT NULL REFERENCES members(id),
    amount REAL NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    waived_reason TEXT,
    paid_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'system',
    title TEXT NOT NULL,
    body TEXT,
    link TEXT,
    entity_type TEXT,
    entity_id TEXT,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    before_json TEXT,
    after_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS library_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    library_name TEXT NOT NULL DEFAULT 'کتابخانه مرکزی دانشگاه',
    library_short_name TEXT NOT NULL DEFAULT 'کتابیار',
    library_address TEXT NOT NULL DEFAULT '',
    library_city TEXT NOT NULL DEFAULT '',
    library_phone TEXT NOT NULL DEFAULT '',
    library_email TEXT NOT NULL DEFAULT '',
    library_website TEXT NOT NULL DEFAULT '',
    library_hours TEXT NOT NULL DEFAULT 'شنبه تا چهارشنبه، ۸ تا ۱۶',
    library_description TEXT NOT NULL DEFAULT '',
    timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
    date_format TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
    currency TEXT NOT NULL DEFAULT 'IRR',
    loan_days INTEGER NOT NULL DEFAULT 14,
    loan_limit INTEGER NOT NULL DEFAULT 3,
    renew_limit INTEGER NOT NULL DEFAULT 2,
    reservation_hold_days INTEGER NOT NULL DEFAULT 3,
    reservation_external_days INTEGER NOT NULL DEFAULT 7,
    reservation_internal_days INTEGER NOT NULL DEFAULT 1,
    self_renewal_allowed INTEGER NOT NULL DEFAULT 0,
    grace_period_enabled INTEGER NOT NULL DEFAULT 0,
    grace_period_days INTEGER NOT NULL DEFAULT 0,
    fines_enabled INTEGER NOT NULL DEFAULT 1,
    fine_per_day REAL NOT NULL DEFAULT 500,
    max_fine_amount REAL NOT NULL DEFAULT 50000,
    fine_currency TEXT NOT NULL DEFAULT 'IRR',
    fines_payment_method TEXT NOT NULL DEFAULT 'cash',
    notify_overdue INTEGER NOT NULL DEFAULT 1,
    notify_due_soon INTEGER NOT NULL DEFAULT 1,
    notify_due_soon_days INTEGER NOT NULL DEFAULT 2,
    notify_ready INTEGER NOT NULL DEFAULT 1,
    shelf_row_count INTEGER NOT NULL DEFAULT 6,
    pin_hash TEXT,
    pin_salt TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `INSERT OR IGNORE INTO library_settings (id) VALUES (1)`,
];

const INDEXES: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_books_publisher_id ON books(publisher_id)`,
  `CREATE INDEX IF NOT EXISTS idx_books_category_id ON books(category_id)`,
  `CREATE INDEX IF NOT EXISTS idx_books_archived_at ON books(archived_at)`,
  `CREATE INDEX IF NOT EXISTS idx_books_item_type ON books(item_type)`,
  `CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON books(isbn13)`,
  `CREATE INDEX IF NOT EXISTS idx_copies_book_status ON copies(book_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_copies_shelf_id ON copies(shelf_id)`,
  `CREATE INDEX IF NOT EXISTS idx_book_authors_author_id ON book_authors(author_id)`,
  `CREATE INDEX IF NOT EXISTS idx_book_tags_tag_id ON book_tags(tag_id)`,
  `CREATE INDEX IF NOT EXISTS idx_loans_member_id ON loans(member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_loans_copy_id ON loans(copy_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS one_open_loan_per_copy ON loans(copy_id) WHERE returned_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS idx_reservations_member_id ON reservations(member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reservations_book_id ON reservations(book_id)`,
  `CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status)`,
  `CREATE INDEX IF NOT EXISTS idx_fines_member_id ON fines(member_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fines_loan_id ON fines(loan_id)`,
  `CREATE INDEX IF NOT EXISTS idx_fines_status ON fines(status)`,
  `CREATE INDEX IF NOT EXISTS idx_members_status ON members(status)`,
  `CREATE INDEX IF NOT EXISTS idx_members_archived_at ON members(archived_at)`,
  `CREATE INDEX IF NOT EXISTS idx_members_role ON members(role)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read)`,
];

/**
 * Read-model views — the joined shapes the repository queries by name
 * (book_catalog, copy_catalog, loan_details, reservation_details,
 * shelf_overview) so screens never hand-write multi-join SQL.
 */
const VIEWS: string[] = [
  `CREATE VIEW IF NOT EXISTS book_catalog AS
   SELECT
     b.*,
     p.name AS publisher,
     cat.name AS category,
     (SELECT GROUP_CONCAT(a.name, ', ') FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS author,
     (SELECT GROUP_CONCAT(t.name, ', ') FROM book_tags bt JOIN tags t ON t.id = bt.tag_id WHERE bt.book_id = b.id) AS tag_list,
     (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id) AS total_copies,
     (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'available') AS available_copies
   FROM books b
   LEFT JOIN publishers p ON p.id = b.publisher_id
   LEFT JOIN categories cat ON cat.id = b.category_id`,
  `CREATE VIEW IF NOT EXISTS copy_catalog AS
   SELECT
     c.*,
     b.title, b.item_type, b.metadata, b.cover_path,
     (SELECT GROUP_CONCAT(a.name, ', ') FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS author,
     s.code AS shelf,
     co.number AS column_number,
     r.name AS room
   FROM copies c
   JOIN books b ON b.id = c.book_id
   LEFT JOIN shelves s ON s.id = c.shelf_id
   LEFT JOIN columns co ON co.id = s.column_id
   LEFT JOIN rooms r ON r.id = co.room_id`,
  `CREATE VIEW IF NOT EXISTS loan_details AS
   SELECT
     l.*,
     b.title, b.item_type, c.barcode, m.full_name AS member_name,
     b.id AS book_id,
     b.subtitle,
     b.arabic_title,
     (SELECT GROUP_CONCAT(a.name, ', ') FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS author,
     cat.name AS category,
     p.name AS publisher,
     COALESCE(b.cover_path, b.cover_url) AS cover_path,
     b.isbn13,
     b.call_number,
     c.accession_number AS copy_accession,
     c.condition AS copy_condition,
     s.code AS copy_shelf,
     m.member_number,
     m.email AS member_email,
     m.phone AS member_phone,
     m.department AS member_dept,
     m.role AS member_role,
     m.avatar_path AS member_avatar
   FROM loans l
   JOIN copies c ON c.id = l.copy_id
   JOIN books b ON b.id = c.book_id
   JOIN members m ON m.id = l.member_id
   LEFT JOIN categories cat ON cat.id = b.category_id
   LEFT JOIN publishers p ON p.id = b.publisher_id
   LEFT JOIN shelves s ON s.id = c.shelf_id`,
  `CREATE VIEW IF NOT EXISTS reservation_details AS
   SELECT
     r.*,
     COALESCE(b.title, 'Unknown Title') AS title,
     b.subtitle, b.arabic_title,
     (SELECT GROUP_CONCAT(a.name, ', ') FROM book_authors ba JOIN authors a ON a.id = ba.author_id WHERE ba.book_id = b.id) AS author,
     cat.name AS category,
     b.item_type,
     COALESCE(b.cover_path, b.cover_url) AS cover_path,
     b.isbn13, b.call_number,
     p.name AS publisher,
     COALESCE(m.full_name, 'Visitor / Guest') AS member_name,
     m.member_number, m.email AS member_email, m.phone AS member_phone, m.department AS member_dept,
     m.role AS member_role, m.avatar_path AS member_avatar, m.reservation_banned AS member_banned,
     cp.barcode AS copy_barcode, cp.accession_number AS copy_accession, cp.condition AS copy_condition, s.code AS copy_shelf
   FROM reservations r
   LEFT JOIN books b ON b.id = r.book_id
   LEFT JOIN categories cat ON cat.id = b.category_id
   LEFT JOIN publishers p ON p.id = b.publisher_id
   LEFT JOIN members m ON m.id = r.member_id
   LEFT JOIN copies cp ON cp.id = r.copy_id
   LEFT JOIN shelves s ON s.id = cp.shelf_id`,
  `CREATE VIEW IF NOT EXISTS shelf_overview AS
   SELECT s.*, c.room_id AS room_id, c.number AS column_number, r.name AS room,
     (SELECT COUNT(*) FROM copies WHERE shelf_id = s.id AND status != 'archived') AS copy_count
   FROM shelves s
   JOIN columns c ON c.id = s.column_id
   JOIN rooms r ON r.id = c.room_id`,
];

/** Applies the schema once per app run; every statement is idempotent. */
export async function ensureSchema(): Promise<void> {
  await getDb(); // open the connection first
  for (const stmt of TABLES) await exec(stmt);
  for (const stmt of INDEXES) await exec(stmt);
  for (const stmt of VIEWS) await exec(stmt);
}
