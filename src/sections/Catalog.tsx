import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, CopyPlus, Eye, Pencil, Plus, Search, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  addCopy, auditLog, books, deleteBook, deleteCopy, getCopiesForBook, getShelves, saveBook, updateBook,
} from "../data/repositories/library";
import { useUiStore } from "../store/uiStore";
import { useContextMenu } from "../components/ui/ContextMenu";
import { ItemTypeBadge, ItemTypeSelect, StatusBadge, DefaultCover, EmptyState, Modal, PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import { ImageUpload } from "../components/ui/ImageUpload";
import { CopyEditModal } from "../components/CopyEditModal";
import { ArtShelf } from "../components/ui/art";
import { getDisplayTitle } from "../utils/titles";
import { formatIsbn, isValidIsbn, normalizeIsbn, cleanBarcode, cleanAccession, cleanText } from "../utils/isbn";
import { formatDisplayDate } from "../utils/dates";
import { downloadCoverAsBase64, enrichMetadataWithGroq, fetchBookMetadata } from "../utils/metadata";
import { cn } from "../utils/cn";
import type { Book, Copy, ItemType, Shelf } from "../types";

/**
 * The bibliographic catalog: titles with their physical copies, saved views,
 * metadata autofill from Google Books / Open Library (+ optional Groq), and
 * full add / edit / archive flows.
 */

/* ── Form schema ─────────────────────────────────────────────────────── */

const optionalString = z.string().optional().nullable();

const bookSchema = z.object({
  item_type: z.string(),
  title: z.string().min(2, "یک عنوان وارد کنید"),
  subtitle: optionalString,
  arabic_title: optionalString,
  tags: optionalString,
  author: optionalString,
  isbn: optionalString,
  publisher: optionalString,
  category: optionalString,
  language: z.string().min(2),
  publication_year: z.union([z.string(), z.number()]).optional().nullable(),
  call_number: optionalString,
  dewey_code: optionalString,
  barcode: optionalString,
  accession: optionalString,
  description: optionalString,
  cover_path: optionalString,
  // item-type specific metadata:
  issue_number: optionalString, frequency: optionalString, issn: optionalString,
  pub_date: optionalString, issue_date: optionalString, press: optionalString,
  region: optionalString, editor: optionalString, ruling_type: optionalString,
  page_count: optionalString, paper_size: optionalString, brand: optionalString,
  media_format: optionalString, duration: optionalString, model_number: optionalString,
  specifications: optionalString, artist: optionalString, studio: optionalString, owner: optionalString,
});

type BookForm = z.infer<typeof bookSchema>;

const METADATA_KEYS = [
  "issue_number", "frequency", "issn", "pub_date", "issue_date", "press", "region", "editor",
  "ruling_type", "page_count", "paper_size", "brand", "media_format", "duration", "model_number",
  "specifications", "artist", "studio", "owner",
] as const;

const EMPTY_FORM: BookForm = {
  item_type: "book", title: "", subtitle: "", arabic_title: "", tags: "", author: "", isbn: "",
  publisher: "", category: "", language: "فارسی", publication_year: "", call_number: "", dewey_code: "",
  barcode: "", accession: "", description: "", cover_path: "",
  issue_number: "", frequency: "", issn: "", pub_date: "", issue_date: "", press: "", region: "",
  editor: "", ruling_type: "", page_count: "", paper_size: "", brand: "", media_format: "",
  duration: "", model_number: "", specifications: "", artist: "", studio: "", owner: "",
};

function metadataFromForm(form: BookForm): string | null {
  const entries = METADATA_KEYS.map((key) => [key, (form[key] as string | undefined)?.trim() ?? ""] as const)
    .filter(([, value]) => value.length > 0);
  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : null;
}

function metadataToForm(metadata: string | null | undefined): Partial<BookForm> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const patch: Record<string, string> = {};
    for (const key of METADATA_KEYS) {
      const value = parsed[key];
      if (typeof value === "string" || typeof value === "number") patch[key] = String(value);
    }
    return patch as Partial<BookForm>;
  } catch {
    return {};
  }
}

const SAVED_VIEWS = ["allBooks", "recentAdditions", "availableNow", "lowStock", "outOfStock", "noCopies", "missingCover", "missingIsbn"] as const;
type SavedView = (typeof SAVED_VIEWS)[number];

function matchesView(view: SavedView, book: Book): boolean {
  const total = book.total_copies ?? 0;
  const available = book.available_copies ?? 0;
  switch (view) {
    case "allBooks": return true;
    case "recentAdditions": return Date.now() - new Date(book.created_at).getTime() <= 7 * 86_400_000;
    case "availableNow": return available > 0;
    case "lowStock": return available > 0 && available <= 2;
    case "outOfStock": return total > 0 && available === 0;
    case "noCopies": return total === 0;
    case "missingCover": return !book.cover_path && !book.cover_url;
    case "missingIsbn": return !book.isbn13 && !book.isbn10;
  }
}

/* ── Page ────────────────────────────────────────────────────────────── */

export function CatalogPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;
  const titlePreference = useUiStore((state) => state.preferences.titlePreference);

  const [term, setTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [view, setView] = useState<SavedView>("allBooks");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "created_at", dir: -1 });
  const [page, setPage] = useState(1);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"details" | "copies">("details");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editCopy, setEditCopy] = useState<Copy | null>(null);

  const booksQuery = useQuery({ queryKey: ["books", term, typeFilter], queryFn: () => books(term, typeFilter) });
  const shelvesQuery = useQuery({ queryKey: ["shelves"], queryFn: getShelves });
  const allBooks = booksQuery.data ?? [];

  /* URL deep links: ?q=, ?action=add-book, ?focus=search */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q");
    if (q) setTerm(q);
    if (params.get("action") === "add-book") { setEditingBook(null); setEditorOpen(true); }
    if (params.get("focus") === "search") document.getElementById("catalog-page-search")?.focus();
    if (q || params.get("action") || params.get("focus")) history.replaceState(null, "", location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(allBooks.map((book) => book.category).filter(Boolean) as string[])).sort(),
    [allBooks],
  );

  const afterLanguageCategory = useMemo(
    () => allBooks.filter((book) => {
      if (languageFilter && (book.language ?? "").toLowerCase() !== languageFilter.toLowerCase()) return false;
      if (categoryFilter && book.category !== categoryFilter) return false;
      return true;
    }),
    [allBooks, languageFilter, categoryFilter],
  );

  const viewCounts = useMemo(() => {
    const counts = {} as Record<SavedView, number>;
    for (const key of SAVED_VIEWS) counts[key] = afterLanguageCategory.filter((book) => matchesView(key, book)).length;
    return counts;
  }, [afterLanguageCategory]);

  const visibleBooks = useMemo(() => {
    const inView = afterLanguageCategory.filter((book) => matchesView(view, book));
    const sorted = [...inView].sort((a, b) => {
      const { key, dir } = sort;
      let result = 0;
      if (key === "available_copies") result = (a.available_copies ?? 0) - (b.available_copies ?? 0);
      else result = String((a as unknown as Record<string, unknown>)[key] ?? "").localeCompare(String((b as unknown as Record<string, unknown>)[key] ?? ""), "fa", { numeric: true, sensitivity: "base" });
      return result * dir;
    });
    return sorted;
  }, [afterLanguageCategory, view, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleBooks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageBooks = visibleBooks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const copiesQuery = useQuery({
    queryKey: ["copies-for", selectedBook?.id],
    queryFn: () => getCopiesForBook(selectedBook!.id),
    enabled: !!selectedBook,
  });
  const auditQuery = useQuery({ queryKey: ["activity"], queryFn: () => auditLog(500) });

  const archiveBook = useMutation({
    mutationFn: deleteBook,
    onSuccess: () => {
      toast.success(t("catalog.alerts.archived", "Item archived"));
      setSelectedBook(null);
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveBulk = useMutation({
    mutationFn: async (ids: string[]) => {
      let failures = 0;
      for (const id of ids) {
        try { await deleteBook(id); } catch { failures += 1; }
      }
      if (failures > 0) throw new Error(`${failures}`);
    },
    onSuccess: () => {
      toast.success(t("catalog.alerts.bulkArchived", "Selected items archived"));
      setSelectedIds(new Set());
      void queryClient.invalidateQueries();
    },
    onError: () => toast.error(t("catalog.alerts.bulkArchiveFailed", "Some items could not be archived (open loans?)")),
  });

  const toggleSort = (key: string) =>
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }));

  const sortIcon = (key: string) => (sort.key !== key ? "↕" : sort.dir === 1 ? "▲" : "▼");

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1">
        <PageTitle
          title={t("catalog.title", "Catalog")}
          detail={t("catalog.subtitle", "{{count}} items match your filters", { count: visibleBooks.length })}
          action={
            <button
              onClick={() => { setEditingBook(null); setEditorOpen(true); }}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark"
            >
              <Plus size={16} />
              {t("catalog.addBook", "Add item")}
            </button>
          }
        />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink/40 dark:text-ivory/40" />
            <input
              id="catalog-page-search"
              className="field-input ps-9"
              placeholder={t("catalog.searchPlaceholder", "Search title, author, ISBN…")}
              value={term}
              onChange={(event) => { setTerm(event.target.value); setPage(1); }}
            />
          </div>
          <select className="field-select max-w-40" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}>
            <option value="">{t("itemTypes.allItems", "All items")}</option>
            <option value="book">{t("itemTypes.book", "Book")}</option>
            <option value="fyp">{t("itemTypes.fyp", "Thesis / FYP")}</option>
            <option value="journal">{t("itemTypes.journal", "Journal")}</option>
            <option value="other">{t("itemTypes.other", "Other")}</option>
          </select>
          <select className="field-select max-w-44" value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}>
            <option value="">{t("catalog.allCategories", "All categories")}</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select className="field-select max-w-36" value={languageFilter} onChange={(event) => { setLanguageFilter(event.target.value); setPage(1); }}>
            <option value="">{t("catalog.allLanguages", "All languages")}</option>
            <option value="فارسی">{t("languages.persian", "Persian")}</option>
            <option value="English">{t("languages.english", "English")}</option>
            <option value="Arabic">{t("languages.arabic", "Arabic")}</option>
            <option value="French">{t("languages.french", "French")}</option>
          </select>
        </div>

        <div className="mb-4 flex flex-wrap gap-1.5">
          {SAVED_VIEWS.map((key) => (
            <button
              key={key}
              onClick={() => { setView(key); setPage(1); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition",
                view === key ? "bg-accent text-white dark:bg-accent-dark" : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
              )}
            >
              {t(`catalog.${key}`, key)}
              <span className={cn("rounded-full px-1.5 text-[10px] font-bold", view === key ? "bg-white/25" : "bg-ink/10 dark:bg-white/10")}>{viewCounts[key]}</span>
            </button>
          ))}
        </div>

        {booksQuery.isLoading ? (
          <PageLoader label={t("catalog.loading", "Loading the catalog…")} />
        ) : visibleBooks.length === 0 ? (
          <EmptyState artwork={<ArtShelf />} title={t("catalog.noBooks", "No items here yet")} description={t("catalog.noBooksHelp", "Adjust the filters, or add your first title to start the collection.")} />
        ) : (
          <>
            <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
              <table className="w-full text-sm" style={{ minWidth: 1100 }}>
                <thead>
                  <tr className="bg-ivory text-[11px] uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        checked={pageBooks.length > 0 && pageBooks.every((book) => selectedIds.has(book.id))}
                        onChange={(event) => {
                          if (event.target.checked) setSelectedIds(new Set([...selectedIds, ...pageBooks.map((book) => book.id)]));
                          else setSelectedIds(new Set([...selectedIds].filter((id) => !pageBooks.some((book) => book.id === id))));
                        }}
                      />
                    </th>
                    {([
                      ["title", t("catalog.headers.title", "Title")],
                      ["item_type", t("catalog.headers.type", "Type")],
                      ["author", t("catalog.headers.author", "Author")],
                      ["category", t("catalog.headers.category", "Category")],
                      ["isbn13", t("catalog.headers.isbn", "ISBN")],
                      ["created_at", t("catalog.headers.dateAdded", "Added")],
                      ["available_copies", t("catalog.headers.availability", "Availability")],
                    ] as const).map(([key, label]) => (
                      <th key={key} className="cursor-pointer px-4 py-3 text-start font-semibold" onClick={() => toggleSort(key)}>
                        {label} <span className="opacity-50">{sortIcon(key)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pageBooks.map((book) => {
                    const display = getDisplayTitle(book, titlePreference);
                    return (
                      <tr
                        key={book.id}
                        onClick={() => { setSelectedBook(book); setSidebarTab("details"); }}
                        onContextMenu={(event) =>
                          showContextMenu(event, [
                            { id: "view", label: t("catalog.contextMenu.viewDetails", "View details & copies"), icon: Eye, onClick: () => { setSelectedBook(book); setSidebarTab("details"); } },
                            ...(book.isbn13 || book.isbn10 ? [{ id: "copyIsbn", label: t("catalog.contextMenu.copyIsbn", "Copy ISBN"), onClick: () => { void navigator.clipboard.writeText(formatIsbn(book.isbn13 || book.isbn10)); toast.success(t("catalog.copiedIsbn", "ISBN copied")); } }] : []),
                            { id: "copyTitle", label: t("catalog.contextMenu.copyTitle", "Copy title"), onClick: () => { void navigator.clipboard.writeText(book.title); toast.success(t("catalog.copiedTitle", "Title copied")); } },
                            { id: "reserve", label: t("catalog.contextMenu.reserveBook", "Reserve this title"), onClick: () => navigate(`/reservations?book_id=${book.id}`) },
                            { id: "d", divider: true },
                            { id: "delete", label: t("catalog.contextMenu.deleteBook", "Archive item"), icon: Trash2, variant: "danger", onClick: () => { if (window.confirm(t("catalog.alerts.confirmDelete", 'Archive "{{title}}"? Its copies stay in the inventory history.', { title: book.title }))) archiveBook.mutate(book.id); } },
                          ])
                        }
                        className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
                      >
                        <td className="border-b border-ink/6 px-3 py-3 dark:border-white/6" onClick={(event) => event.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(book.id)}
                            onChange={(event) => {
                              const next = new Set(selectedIds);
                              if (event.target.checked) next.add(book.id);
                              else next.delete(book.id);
                              setSelectedIds(next);
                            }}
                          />
                        </td>
                        <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                          <div className="flex items-center gap-3">
                            {book.cover_path ? (
                              <img src={book.cover_path} alt="" className="h-12 w-8 rounded-md object-cover shadow-sm" />
                            ) : (
                              <DefaultCover type={book.item_type} className="h-12 w-8 rounded-md" />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{display.main}</p>
                              {display.sub ? <p className="truncate text-xs text-ink/50 dark:text-ivory/50">{display.sub}</p> : null}
                            </div>
                          </div>
                        </td>
                        <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6"><ItemTypeBadge type={book.item_type} /></td>
                        <td className="border-b border-ink/6 px-4 py-3 text-[13px] dark:border-white/6">{book.author || "—"}</td>
                        <td className="border-b border-ink/6 px-4 py-3 text-[13px] dark:border-white/6">{book.category || t("catalog.uncategorized", "Uncategorized")}</td>
                        <td className="border-b border-ink/6 px-4 py-3 font-mono text-xs dark:border-white/6">{formatIsbn(book.isbn13 || book.isbn10) || "—"}</td>
                        <td className="border-b border-ink/6 px-4 py-3 text-xs text-ink/60 dark:border-white/6 dark:text-ivory/60">{formatDisplayDate(book.created_at)}</td>
                        <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                          <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-bold", (book.available_copies ?? 0) > 0 ? "bg-accent/12 text-accent dark:text-accent-dark" : "bg-copper/15 text-copper")}>
                            {book.available_copies ?? 0}/{book.total_copies ?? 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-ink/60 dark:text-ivory/60">
              <span>{t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", { start: (currentPage - 1) * pageSize + 1, end: Math.min(currentPage * pageSize, visibleBooks.length), total: visibleBooks.length })}</span>
              <div className="flex items-center gap-2">
                <button disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">‹</button>
                <span className="tabular-nums">{currentPage} / {totalPages}</span>
                <button disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10">›</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
          <span className="font-bold">{t("catalog.bulk.selectedCount", "{{count}} selected", { count: selectedIds.size })}</span>
          <button className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setSelectedIds(new Set(visibleBooks.map((book) => book.id)))}>{t("catalog.bulk.selectAll", "Select all")}</button>
          <button className="rounded-lg px-2 py-1 hover:bg-white/10" onClick={() => setSelectedIds(new Set())}>{t("catalog.bulk.deselectAll", "Deselect all")}</button>
          <button
            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
            onClick={() => {
              if (window.confirm(t("catalog.alerts.confirmBulkArchive", "Archive {{count}} selected items?", { count: selectedIds.size }))) {
                archiveBulk.mutate(Array.from(selectedIds));
              }
            }}
          >
            {t("catalog.bulk.archiveSelected", "Archive selected")}
          </button>
        </div>
      ) : null}

      {/* Detail sidebar */}
      {selectedBook ? (
        <BookSidebar
          book={selectedBook}
          tab={sidebarTab}
          setTab={setSidebarTab}
          onClose={() => setSelectedBook(null)}
          onEdit={() => { setEditingBook(selectedBook); setEditorOpen(true); }}
          onArchive={() => {
            if (window.confirm(t("catalog.alerts.confirmDelete", 'Archive "{{title}}"?', { title: selectedBook.title }))) archiveBook.mutate(selectedBook.id);
          }}
          copies={copiesQuery.data ?? []}
          shelves={shelvesQuery.data ?? []}
          audit={(auditQuery.data ?? []).filter((row) => row.entity_id === selectedBook.id).slice(0, 5)}
          onEditCopy={setEditCopy}
          onAddCopy={() => setSidebarTab("copies")}
        />
      ) : null}

      <BookEditorModal
        isOpen={editorOpen}
        book={editingBook}
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => { setSelectedBook(null); setEditorOpen(false); void saved; }}
      />

      {editCopy ? (
        <CopyEditModal copy={editCopy} onClose={() => setEditCopy(null)} shelves={shelvesQuery.data ?? []} />
      ) : null}
    </div>
  );
}

/* ── Detail sidebar ──────────────────────────────────────────────────── */

interface AuditEntry { id: string; action: string; actor: string; created_at: string }

function BookSidebar({
  book, tab, setTab, onClose, onEdit, onArchive, copies, shelves, audit, onEditCopy, onAddCopy,
}: {
  book: Book;
  tab: "details" | "copies";
  setTab: (tab: "details" | "copies") => void;
  onClose: () => void;
  onEdit: () => void;
  onArchive: () => void;
  copies: Copy[];
  shelves: Shelf[];
  audit: AuditEntry[];
  onEditCopy: (copy: Copy) => void;
  onAddCopy: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const titlePreference = useUiStore((state) => state.preferences.titlePreference);
  const display = getDisplayTitle(book, titlePreference);
  const [addCopyOpen, setAddCopyOpen] = useState(false);

  const spec = useMemo(() => {
    if (!book.metadata) return [] as [string, string][];
    try {
      return Object.entries(JSON.parse(book.metadata) as Record<string, unknown>).filter(([, value]) => value !== null && value !== undefined && value !== "");
    } catch {
      return [];
    }
  }, [book.metadata]);

  const deleteCopyMutation = useMutation({
    mutationFn: deleteCopy,
    onSuccess: () => { toast.success(t("catalog.alerts.copyArchived", "Copy archived")); void queryClient.invalidateQueries(); },
    onError: (error: Error) => toast.error(error.message),
  });

  const infoRows: [string, string][] = [
    [t("catalog.details.author", "Author"), book.author ?? "—"],
    [t("catalog.details.category", "Category"), book.category ?? "—"],
    [t("catalog.details.language", "Language"), book.language],
    [t("catalog.details.publisher", "Publisher"), book.publisher ?? "—"],
    [t("catalog.details.pubYear", "Year"), book.publication_year ? String(book.publication_year) : "—"],
    [t("catalog.details.callNumber", "Call number"), book.call_number ?? "—"],
    [t("catalog.details.deweyCode", "Dewey"), book.dewey_code ?? "—"],
    [t("catalog.details.isbn10", "ISBN-10"), formatIsbn(book.isbn10) || "—"],
    [t("catalog.details.isbn13", "ISBN-13"), formatIsbn(book.isbn13) || "—"],
  ];

  return (
    <aside key={book.id} className="sticky top-0 w-[340px] shrink-0 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
      <div className="relative">
        <div className="flex h-44 items-end justify-center rounded-t-[var(--radius-card)] bg-gradient-to-b from-accent/15 to-transparent p-4 dark:from-accent-dark/15">
          {book.cover_path ? (
            <img src={book.cover_path} alt="" className="h-full rounded-md object-cover shadow-lg" />
          ) : (
            <DefaultCover type={book.item_type} className="h-full w-24 rounded-md" iconSize={26} />
          )}
        </div>
        <button onClick={onClose} aria-label={t("catalog.details.back", "Back")} className="absolute end-3 top-3 rounded-full bg-white/85 p-1.5 text-ink/70 hover:bg-white dark:bg-black/40 dark:text-ivory/70">
          <X size={15} />
        </button>
      </div>

      <div className="border-b border-ink/8 p-4 dark:border-white/8">
        <h3 className="font-display text-base font-bold leading-snug">{display.main}</h3>
        {display.sub ? <p className="mt-0.5 text-xs text-ink/55 dark:text-ivory/55">{display.sub}</p> : null}
        {book.tags ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {book.tags.split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
              <span key={tag} className="rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-semibold dark:bg-white/8">{tag}</span>
            ))}
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button onClick={onEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-ink/5 py-2 text-xs font-bold transition hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15">
            <Pencil size={13} /> {t("catalog.details.edit", "Edit")}
          </button>
          <button onClick={onArchive} className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-red-600/10 py-2 text-xs font-bold text-red-600 transition hover:bg-red-600/20">
            <Archive size={13} /> {t("catalog.details.archive", "Archive")}
          </button>
        </div>
      </div>

      <div className="flex border-b border-ink/8 text-[13px] font-semibold dark:border-white/8">
        {(["details", "copies"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn("flex-1 py-2.5 transition", tab === key ? "border-b-2 border-accent text-accent dark:border-accent-dark dark:text-accent-dark" : "text-ink/50 dark:text-ivory/50")}
          >
            {key === "details" ? t("catalog.details.title", "Details") : `${t("catalog.details.copies", "Copies")} (${copies.length})`}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {tab === "details" ? (
          <>
            <dl className="space-y-2 text-[13px]">
              {infoRows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-ink/50 dark:text-ivory/50">{label}</dt>
                  <dd className="text-end font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {spec.length > 0 ? (
              <>
                <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wide text-copper">{t("catalog.details.specifications", "Item specifications")}</p>
                <dl className="space-y-2 text-[13px]">
                  {spec.map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-ink/50 dark:text-ivory/50">{t(`itemFields.${key}`, key)}</dt>
                      <dd className="text-end font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            {book.description ? (
              <>
                <p className="mt-4 mb-1 text-[11px] font-bold uppercase tracking-wide text-copper">{t("catalog.details.description", "Description")}</p>
                <p className="max-h-40 overflow-y-auto text-[13px] leading-relaxed text-ink/70 dark:text-ivory/70">{book.description}</p>
              </>
            ) : null}
            {audit.length > 0 ? (
              <>
                <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wide text-copper">{t("catalog.details.recentActivity", "Recent activity")}</p>
                <ul className="space-y-1.5 text-xs text-ink/60 dark:text-ivory/60">
                  {audit.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-2">
                      <span>{t(`activity.actions.${entry.action}`, entry.action.replace(/_/g, " "))}</span>
                      <span className="shrink-0">{entry.actor} · {formatDisplayDate(entry.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <>
            <button
              onClick={() => setAddCopyOpen(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-ink/15 py-2.5 text-xs font-bold text-ink/60 transition hover:border-accent/40 hover:text-accent dark:border-white/15 dark:text-ivory/60 dark:hover:text-accent-dark"
            >
              <CopyPlus size={14} />
              {t("catalog.details.addCopy", "Add a copy")}
            </button>
            {copies.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">{t("catalog.details.noCopiesYet", "No physical copies registered yet.")}</p>
            ) : (
              <ul className="space-y-2">
                {copies.map((copy) => (
                  <li key={copy.id} className="rounded-xl border border-ink/8 p-3 dark:border-white/8">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[12px] font-bold">{copy.barcode}</p>
                      <StatusBadge value={copy.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink/50 dark:text-ivory/50">
                      {t("catalog.details.copyAccession", "Accession")}: {copy.accession_number}
                      {copy.room ? ` · ${copy.room} ${t("inventory.columnLabel", "Col {{number}}", { number: copy.column_number })} ${copy.shelf}` : ""}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button onClick={() => onEditCopy(copy)} className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15" aria-label={t("catalog.details.edit", "Edit")}><Pencil size={12} /></button>
                      <button
                        onClick={() => { if (window.confirm(t("catalog.alerts.confirmArchiveCopy", "Archive this copy?", { barcode: copy.barcode }))) deleteCopyMutation.mutate(copy.id); }}
                        className="rounded-lg bg-red-600/10 p-1.5 text-red-600 hover:bg-red-600/20"
                        aria-label={t("catalog.details.archive", "Archive")}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {addCopyOpen && tab === "copies" ? (
        <AddCopyModal
          book={book}
          shelves={shelves}
          onClose={() => setAddCopyOpen(false)}
          onDone={() => { setAddCopyOpen(false); onAddCopy(); }}
        />
      ) : null}
    </aside>
  );
}

/* ── Add-copy modal ──────────────────────────────────────────────────── */

function AddCopyModal({ book, shelves, onClose, onDone }: { book: Book; shelves: Shelf[]; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [accession, setAccession] = useState<string>(crypto.randomUUID());
  const [barcode, setBarcode] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [condition, setCondition] = useState("good");

  const mutation = useMutation({
    mutationFn: () => addCopy(book.id, cleanBarcode(barcode), cleanAccession(accession), condition, shelfId || null),
    onSuccess: () => {
      toast.success(t("catalog.alerts.copyAdded", "Copy added to the shelf"));
      void queryClient.invalidateQueries();
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal isOpen onClose={onClose} title={t("catalog.details.addCopyTitle", "Add a copy")} size="md">
      <form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); mutation.mutate(); }}>
        <p className="text-sm text-ink/60 dark:text-ivory/60">{book.title}</p>
        <label>
          <span>{t("catalog.addModal.accessionLabel", "Accession number *")}</span>
          <input className="field-input font-mono" required value={accession} onChange={(event) => setAccession(event.target.value)} />
        </label>
        <label>
          <span>{t("catalog.addModal.barcodeLabel", "Barcode (scan or type)")}</span>
          <input className="field-input font-mono" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
        </label>
        <label>
          <span>{t("catalog.details.shelfLabel", "Shelf")}</span>
          <select className="field-select" value={shelfId} onChange={(event) => setShelfId(event.target.value)}>
            <option value="">{t("catalog.details.shelfUnassigned", "Unassigned")}</option>
            {shelves.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.room} · {t("inventory.columnLabel", "Col {{number}}", { number: shelf.column_number })} · {shelf.shelf_type === "floor" ? t("inventory.floorShelf", "Floor shelf") : shelf.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("catalog.details.copyCondition", "Condition")}</span>
          <select className="field-select" value={condition} onChange={(event) => setCondition(event.target.value)}>
            {["mint", "good", "worn", "damaged"].map((value) => (
              <option key={value} value={value}>{t(`catalog.condition.${value}`, value)}</option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5">{t("catalog.addModal.cancel", "Cancel")}</button>
          <button type="submit" disabled={mutation.isPending} className="rounded-[var(--radius-control)] bg-accent px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark">
            {t("catalog.addModal.save", "Add copy")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Add / edit modal ────────────────────────────────────────────────── */

function BookEditorModal({ isOpen, book, onClose, onSaved }: { isOpen: boolean; book: Book | null; onClose: () => void; onSaved: (book: Book) => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const groqKey = useUiStore((state) => state.preferences.groqApiKey);
  const groqEnabled = useUiStore((state) => state.preferences.groqEnabled);
  const [autoFilling, setAutoFilling] = useState(false);
  const [unresolved, setUnresolved] = useState<string[]>([]);

  const form = useForm<BookForm>({
    resolver: zodResolver(bookSchema),
    defaultValues: EMPTY_FORM,
  });
  const itemType = form.watch("item_type") as ItemType;

  useEffect(() => {
    if (!isOpen) return;
    if (book) {
      form.reset({
        ...EMPTY_FORM,
        ...metadataToForm(book.metadata),
        item_type: String(book.item_type ?? "book"),
        title: book.title,
        subtitle: book.subtitle ?? "",
        arabic_title: book.arabic_title ?? "",
        tags: book.tags ?? "",
        author: book.author ?? "",
        isbn: formatIsbn(book.isbn13 || book.isbn10),
        publisher: book.publisher ?? "",
        category: book.category ?? "",
        language: book.language || "فارسی",
        publication_year: book.publication_year ?? "",
        call_number: book.call_number ?? "",
        dewey_code: book.dewey_code ?? "",
        description: book.description ?? "",
        cover_path: book.cover_path ?? "",
      });
      setUnresolved([]);
    } else {
      form.reset(EMPTY_FORM);
      setUnresolved([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, book?.id]);

  const mutation = useMutation({
    mutationFn: async (values: BookForm) => {
      const yearValue = typeof values.publication_year === "string" ? parseInt(values.publication_year, 10) : values.publication_year;
      const payload = {
        item_type: values.item_type,
        title: cleanText(values.title),
        subtitle: values.subtitle || null,
        arabic_title: values.arabic_title || null,
        tags: values.tags || null,
        author: (values.author || (values.item_type === "journal" || values.item_type === "fyp" ? values.editor : "") || null),
        publisher: values.publisher || (values.item_type === "other" ? values.brand : "") || null,
        category: values.category || null,
        language: cleanText(values.language),
        publication_year: Number.isFinite(yearValue) && yearValue ? yearValue : null,
        call_number: values.call_number || null,
        dewey_code: values.dewey_code || null,
        description: values.description || null,
        cover_path: values.cover_path || null,
        metadata: metadataFromForm(values),
      };

      if (book) {
        await updateBook(book.id, payload);
      } else {
        const normalized = normalizeIsbn(values.isbn ?? "");
        if (normalized && !isValidIsbn(normalized)) {
          throw new Error(t("catalog.alerts.invalidIsbn", "This ISBN failed its checksum — please double-check it."));
        }
        await saveBook({
          ...payload,
          isbn10: normalized.length === 10 ? normalized : null,
          isbn13: normalized.length === 13 ? normalized : null,
          barcode: values.barcode ? cleanBarcode(values.barcode) : undefined,
          accession: values.accession ? cleanAccession(values.accession) : undefined,
        } as Parameters<typeof saveBook>[0]);
      }
    },
    onSuccess: async () => {
      toast.success(t(book ? "catalog.alerts.updated" : "catalog.alerts.bookSaved", book ? "Item updated" : "Item added to the catalog"));
      await queryClient.invalidateQueries();
      onSaved((book ?? { id: "" }) as Book);
    },
    onError: (error: Error) => toast.error(t("catalog.alerts.saveError", "Could not save: {{message}}", { message: error.message })),
  });

  const autofill = async () => {
    const isbn = normalizeIsbn(form.getValues("isbn") ?? "");
    const query = isbn || form.getValues("title");
    if (!query.trim()) {
      toast.warning(t("catalog.alerts.typeQuery", "Type a title or ISBN first"));
      return;
    }
    setAutoFilling(true);
    try {
      toast.info(t("catalog.alerts.querying", "Querying Google Books & Open Library…"));
      let meta = await fetchBookMetadata(query);
      if (groqEnabled && groqKey) {
        toast.info(t("catalog.alerts.enriching", "Refining with Groq…"));
        meta = await enrichMetadataWithGroq(query, meta, groqKey);
      }
      const values = form.getValues();
      form.setValue("title", meta.title || values.title);
      if (meta.subtitle) form.setValue("subtitle", meta.subtitle);
      if (meta.arabic_title) form.setValue("arabic_title", meta.arabic_title);
      if (meta.author) form.setValue("author", meta.author);
      if (meta.publisher) form.setValue("publisher", meta.publisher);
      if (meta.category) form.setValue("category", meta.category);
      if (meta.tags) form.setValue("tags", meta.tags);
      if (meta.language) form.setValue("language", meta.language);
      if (meta.description) form.setValue("description", meta.description);
      if (meta.publicationYear) form.setValue("publication_year", String(meta.publicationYear));
      if (meta.isbn13 || meta.isbn10) form.setValue("isbn", formatIsbn(meta.isbn13 || meta.isbn10));
      if (!values.dewey_code && meta.dewey_code) form.setValue("dewey_code", meta.dewey_code);
      setUnresolved(meta.unresolvedFields ?? []);
      if (meta.cover_url) {
        toast.info(t("catalog.alerts.downloadingCover", "Downloading cover…"));
        const cover = await downloadCoverAsBase64(meta.cover_url);
        if (cover) form.setValue("cover_path", cover);
      }
      toast.success(t("catalog.alerts.autofilled", "Fields filled — review and save"));
    } catch (error) {
      toast.error(t("catalog.alerts.notFound", "No metadata found for this query"));
      void error;
    } finally {
      setAutoFilling(false);
    }
  };

  const gapHint = (field: string) =>
    unresolved.includes(field as "subtitle" | "arabic_title" | "description") ? (
      <p className="mt-1 text-[11px] text-amber-600">{t("catalog.addModal.autofillGap", "Needs manual entry (or enable Groq for AI assist)")}</p>
    ) : null;

  const text = (name: keyof BookForm, label: string, options?: { required?: boolean; mono?: boolean }) => (
    <label>
      <span>{label}{options?.required ? <span className="text-copper"> *</span> : null}</span>
      <input className={cn("field-input", options?.mono && "font-mono")} {...form.register(name as never)} />
    </label>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={book ? t("catalog.addModal.editTitle", "Edit item") : t("catalog.addModal.title", "Add an item")} size="2xl">
      <form className="space-y-4" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">{t("catalog.addModal.cover", "Cover")}</p>
            <ImageUpload shape="cover" value={form.watch("cover_path")} onChange={(value) => form.setValue("cover_path", value ?? "")} />
          </div>
          <div className="grid gap-3">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">{t("catalog.itemType", "Item type")}</p>
              <ItemTypeSelect value={itemType} onChange={(value) => form.setValue("item_type", value)} />
            </div>
            <label>
              <span>{t("catalog.addModal.titleLabel", "Title")}<span className="text-copper"> *</span></span>
              <input className="field-input" required {...form.register("title")} />
              {form.formState.errors.title ? <p className="mt-1 text-[11px] text-red-600">{t("catalog.alerts.titleRequired", "A title is required")}</p> : null}
            </label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {text("subtitle", t("catalog.addModal.subtitleLabel", "Subtitle"))}
          {text("arabic_title", t("catalog.addModal.arabicTitleLabel", "Arabic title"))}
          {gapHint("subtitle")}
          {gapHint("arabic_title")}

          {itemType === "book" ? (
            <>
              <label>
                <span>{t("catalog.addModal.isbnLabel", "ISBN")}</span>
                <div className="flex gap-2">
                  <input className="field-input font-mono" {...form.register("isbn")} />
                  <button type="button" onClick={() => void autofill()} disabled={autoFilling} className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-copper/12 px-3 text-xs font-bold text-copper transition hover:bg-copper/20 disabled:opacity-50">
                    <Wand2 size={13} />
                    {autoFilling ? t("catalog.addModal.autofilling", "…") : t("catalog.addModal.autofill", "Autofill")}
                  </button>
                </div>
              </label>
              {text("author", t("catalog.addModal.authorLabel", "Author(s)"))}
            </>
          ) : null}

          {itemType === "fyp" ? (
            <>
              {text("editor", t("itemFields.supervisor", "Supervisor"))}
              <label>
                <span>{t("itemFields.defenseYear", "Defense year")}</span>
                <input type="number" className="field-input" {...form.register("publication_year")} />
              </label>
              {text("issue_number", t("itemFields.registrationNumber", "Registration number"))}
            </>
          ) : null}

          {itemType === "journal" ? (
            <>
              {text("issue_number", t("itemFields.issueNumber", "Volume & issue"))}
              {text("issn", t("itemFields.issn", "ISSN"), { mono: true })}
            </>
          ) : null}

          {itemType === "other" ? (
            <>
              {text("brand", t("itemFields.brand", "Brand"))}
              {text("model_number", t("itemFields.modelNumber", "Model / serial"))}
            </>
          ) : null}

          {text("category", itemType === "fyp" ? t("itemFields.department", "Department / specialty") : t("catalog.addModal.categoryLabel", "Category"))}

          <label>
            <span>{t("catalog.addModal.langLabel", "Language")}<span className="text-copper"> *</span></span>
            <input className="field-input" required {...form.register("language")} />
          </label>

          {itemType !== "fyp" ? (
            <label>
              <span>{t("catalog.addModal.pubYearLabel", "Publication year")}</span>
              <input type="number" className="field-input" {...form.register("publication_year")} />
            </label>
          ) : null}

          {text("publisher", itemType === "journal" ? t("itemFields.press", "Press / society") : t("catalog.addModal.publisherLabel", "Publisher"))}

          {!book ? (
            <>
              {text("barcode", t("catalog.addModal.barcodeLabel", "First copy barcode (scan or type)"), { mono: true })}
              {text("accession", t("catalog.addModal.accessionAutoLabel", "First copy accession (auto if blank)"), { mono: true })}
            </>
          ) : null}

          {text("tags", t("catalog.addModal.tagsLabel", "Tags (comma separated)"))}
          {itemType === "book" ? text("call_number", t("catalog.addModal.callNumberLabel", "Call number")) : null}
          {itemType === "book" ? text("dewey_code", t("catalog.addModal.deweyLabel", "Dewey number")) : null}
        </div>

        <label>
          <span>{t("catalog.addModal.descLabel", "Description")}</span>
          <textarea className="field-input min-h-20" rows={3} {...form.register("description")} />
        </label>
        {gapHint("description")}

        <div className="flex justify-end gap-2 border-t border-ink/8 pt-4 dark:border-white/8">
          <button type="button" onClick={onClose} className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5">{t("catalog.addModal.cancel", "Cancel")}</button>
          <button type="submit" disabled={mutation.isPending} className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark">
            {t("catalog.addModal.save", "Save item")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
