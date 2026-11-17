import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CopyEditModal } from "../components/CopyEditModal";
import { ArtShelf } from "../components/ui/art";
import { useContextMenu } from "../components/ui/ContextMenu";
import { EmptyState, PageLoader } from "../components/ui/primitives";
import { PageTitle } from "../components/ui/shared";
import {
  auditLog,
  books,
  deleteBook,
  getCopiesForBook,
  getShelves,
} from "../data/repositories/library";
import { useQuery } from "../hooks/useLibraryQuery";
import { useUiStore } from "../store/uiStore";
import type { Book, Copy } from "../types";
import { BookEditorModal } from "./catalog/BookEditorModals";
import { BookSidebar } from "./catalog/BookSidebar";
import { CatalogBulkBar } from "./catalog/CatalogBulkBar";
import { CatalogFilters } from "./catalog/CatalogFilters";
import { CatalogTable } from "./catalog/CatalogTable";
import {
  EMPTY_BOOKS,
  matchesView,
  SAVED_VIEWS,
  type SavedView,
} from "./catalog/shared";

/**
 * The bibliographic catalog screen. Filtering/paging logic lives here; the
 * table, filters, bulk bar, detail sidebar and editor modals are in ./catalog.
 */

/**
 * Derived catalog data: category list, the language/category-filtered books,
 * saved-view counts and the visible (filtered + sorted + paged) page.
 */
/** Archive one book or the whole selection; toasts + full invalidation. */
function useCatalogMutations(deps: {
  setSelectedBook: (book: Book | null) => void;
  setSelectedIds: (ids: Set<string>) => void;
  queryClient: ReturnType<typeof useQueryClient>;
  t: TFunction;
}) {
  const archiveBook = useMutation({
    mutationFn: deleteBook,
    onSuccess: () => {
      toast.success(deps.t("catalog.alerts.archived", "Item archived"));
      deps.setSelectedBook(null);
      void deps.queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveBulk = useMutation({
    mutationFn: async (ids: string[]) => {
      let failures = 0;
      for (const id of ids) {
        try {
          await deleteBook(id);
        } catch {
          failures += 1;
        }
      }
      if (failures > 0) throw new Error(`${failures}`);
    },
    onSuccess: () => {
      toast.success(
        deps.t("catalog.alerts.bulkArchived", "Selected items archived"),
      );
      deps.setSelectedIds(new Set());
      void deps.queryClient.invalidateQueries();
    },
    onError: () =>
      toast.error(
        deps.t(
          "catalog.alerts.bulkArchiveFailed",
          "Some items could not be archived (open loans?)",
        ),
      ),
  });

  return { archiveBook, archiveBulk };
}

function useCatalogData({
  allBooks,
  languageFilter,
  categoryFilter,
  view,
  sort,
  page,
  pageSize,
}: {
  allBooks: Book[];
  languageFilter: string;
  categoryFilter: string;
  view: SavedView;
  sort: { key: string; dir: 1 | -1 };
  page: number;
  pageSize: number;
}) {
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          allBooks.map((book) => book.category).filter(Boolean) as string[],
        ),
      ).sort(),
    [allBooks],
  );

  const afterLanguageCategory = useMemo(
    () =>
      allBooks.filter((book) => {
        if (
          languageFilter &&
          (book.language ?? "").toLowerCase() !== languageFilter.toLowerCase()
        )
          return false;
        if (categoryFilter && book.category !== categoryFilter) return false;
        return true;
      }),
    [allBooks, languageFilter, categoryFilter],
  );

  const viewCounts = useMemo(() => {
    const counts = {} as Record<SavedView, number>;
    for (const key of SAVED_VIEWS)
      counts[key] = afterLanguageCategory.filter((book) =>
        matchesView(key, book),
      ).length;
    return counts;
  }, [afterLanguageCategory]);

  const visibleBooks = useMemo(() => {
    const inView = afterLanguageCategory.filter((book) =>
      matchesView(view, book),
    );
    const sorted = [...inView].sort((a, b) => {
      const { key, dir } = sort;
      let result = 0;
      if (key === "available_copies")
        result = (a.available_copies ?? 0) - (b.available_copies ?? 0);
      else {
        const cellValue = (book: Book) =>
          Object.entries(book).find(([field]) => field === key)?.[1];
        result = String(cellValue(a) ?? "").localeCompare(
          String(cellValue(b) ?? ""),
          "fa",
          { numeric: true, sensitivity: "base" },
        );
      }
      return result * dir;
    });
    return sorted;
  }, [afterLanguageCategory, view, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleBooks.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageBooks = visibleBooks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return {
    categories,
    afterLanguageCategory,
    viewCounts,
    visibleBooks,
    totalPages,
    currentPage,
    pageBooks,
  };
}

export function CatalogPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { showContextMenu } = useContextMenu();
  const pageSize = useUiStore((state) => state.preferences.pageSize) || 10;
  const titlePreference = useUiStore(
    (state) => state.preferences.titlePreference,
  );

  const [term, setTerm] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [view, setView] = useState<SavedView>("allBooks");
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({
    key: "created_at",
    dir: -1,
  });
  const [page, setPage] = useState(1);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [sidebarTab, setSidebarTab] = useState<"details" | "copies">("details");
  const [editorOpen, setEditorOpen] = useState(
    () =>
      new URLSearchParams(window.location.search).get("action") === "add-book",
  );
  const [editingBook, setEditingBook] = useState<Book | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editCopy, setEditCopy] = useState<Copy | null>(null);

  const { archiveBook, archiveBulk } = useCatalogMutations({
    setSelectedBook,
    setSelectedIds,
    queryClient,
    t,
  });

  const booksQuery = useQuery({
    queryKey: ["books", term, typeFilter],
    queryFn: () => books(term, typeFilter),
  });
  const shelvesQuery = useQuery({ queryKey: ["shelves"], queryFn: getShelves });
  const allBooks = booksQuery.data ?? EMPTY_BOOKS;

  const {
    categories,
    viewCounts,
    visibleBooks,
    totalPages,
    currentPage,
    pageBooks,
  } = useCatalogData({
    allBooks,
    languageFilter,
    categoryFilter,
    view,
    sort,
    page,
    pageSize,
  });

  /* Deep-link consumption: the ?q= / ?action=add-book state is initialized
    lazily above, so this effect only focuses the search box and strips the
    parameters from the URL — no setState inside an effect. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("focus") === "search")
      document.getElementById("catalog-page-search")?.focus();
    if (params.get("q") || params.get("action") || params.get("focus"))
      history.replaceState(null, "", window.location.pathname);
  }, []);

  const copiesQuery = useQuery({
    queryKey: ["copies-for", selectedBook?.id],
    queryFn: () => getCopiesForBook(selectedBook!.id),
    enabled: !!selectedBook,
  });
  const auditQuery = useQuery({
    queryKey: ["activity"],
    queryFn: () => auditLog(500),
  });

  const toggleSort = (key: string) =>
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 1 ? -1 : 1 }
        : { key, dir: 1 },
    );

  const sortIcon = (key: string) =>
    sort.key !== key ? "↕" : sort.dir === 1 ? "▲" : "▼";

  return (
    <div className="flex gap-5">
      <div className="min-w-0 flex-1">
        <PageTitle
          title={t("catalog.title", "Catalog")}
          detail={t("catalog.subtitle", "{{count}} items match your filters", {
            count: visibleBooks.length,
          })}
          action={
            <button
              type="button"
              onClick={() => {
                setEditingBook(null);
                setEditorOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-[var(--radius-control)] bg-accent px-3.5 py-2 text-sm font-semibold text-white transition hover:opacity-90 dark:bg-accent-dark"
            >
              <Plus size={16} />
              {t("catalog.addBook", "Add item")}
            </button>
          }
        />

        <CatalogFilters
          term={term}
          setTerm={(value) => {
            setTerm(value);
            setPage(1);
          }}
          typeFilter={typeFilter}
          setTypeFilter={(value) => {
            setTypeFilter(value);
            setPage(1);
          }}
          categoryFilter={categoryFilter}
          setCategoryFilter={(value) => {
            setCategoryFilter(value);
            setPage(1);
          }}
          languageFilter={languageFilter}
          setLanguageFilter={(value) => {
            setLanguageFilter(value);
            setPage(1);
          }}
          categories={categories}
          view={view}
          setView={(key) => {
            setView(key);
            setPage(1);
          }}
          viewCounts={viewCounts}
          setPage={setPage}
        />

        {booksQuery.isLoading ? (
          <PageLoader label={t("catalog.loading", "Loading the catalog…")} />
        ) : visibleBooks.length === 0 ? (
          <EmptyState
            artwork={<ArtShelf />}
            title={t("catalog.noBooks", "No items here yet")}
            description={t(
              "catalog.noBooksHelp",
              "Adjust the filters, or add your first title to start the collection.",
            )}
          />
        ) : (
          <CatalogTable
            pageBooks={pageBooks}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            toggleSort={toggleSort}
            sortIcon={sortIcon}
            onSelectBook={(book) => {
              setSelectedBook(book);
              setSidebarTab("details");
            }}
            showContextMenu={showContextMenu}
            archiveBook={archiveBook}
            titlePreference={titlePreference}
            setSidebarTab={setSidebarTab}
            currentPage={currentPage}
            totalPages={totalPages}
            setPage={setPage}
            total={visibleBooks.length}
            pageSize={pageSize}
          />
        )}
      </div>

      <CatalogBulkBar
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        visibleBooks={visibleBooks}
        onArchiveBulk={(ids) => archiveBulk.mutate(ids)}
      />

      {selectedBook ? (
        <BookSidebar
          book={selectedBook}
          tab={sidebarTab}
          setTab={setSidebarTab}
          onClose={() => setSelectedBook(null)}
          onEdit={() => {
            setEditingBook(selectedBook);
            setEditorOpen(true);
          }}
          onArchive={() => {
            if (
              window.confirm(
                t("catalog.alerts.confirmDelete", 'Archive "{{title}}"?', {
                  title: selectedBook.title,
                }),
              )
            )
              archiveBook.mutate(selectedBook.id);
          }}
          copies={copiesQuery.data ?? []}
          shelves={shelvesQuery.data ?? []}
          audit={(auditQuery.data ?? [])
            .filter((row) => row.entity_id === selectedBook.id)
            .slice(0, 5)}
          onEditCopy={setEditCopy}
          onAddCopy={() => setSidebarTab("copies")}
        />
      ) : null}

      <BookEditorModal
        isOpen={editorOpen}
        book={editingBook}
        onClose={() => setEditorOpen(false)}
        onSaved={(saved) => {
          setSelectedBook(null);
          setEditorOpen(false);
          void saved;
        }}
      />

      {editCopy ? (
        <CopyEditModal
          copy={editCopy}
          onClose={() => setEditCopy(null)}
          shelves={shelvesQuery.data ?? []}
        />
      ) : null}
    </div>
  );
}
