import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useContextMenu } from "../components/ui/ContextMenu";
import { deleteBook } from "../data/repositories/library";
import { useUiStore } from "../store/uiStore";
import type { Book } from "../types";
import { CatalogBulkBar } from "./catalog/CatalogBulkBar";
import { CatalogMain } from "./catalog/CatalogMain";
import { CatalogSidePanels } from "./catalog/CatalogSidePanels";
import {
  EMPTY_BOOKS,
  matchesView,
  SAVED_VIEWS,
  type SavedView,
} from "./catalog/shared";
import { useCatalogPageState } from "./catalog/useCatalogPageState";

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

  const state = useCatalogPageState();
  const {
    selectedBook,
    setSelectedBook,
    selectedIds,
    setSelectedIds,
    languageFilter,
    categoryFilter,
    view,
    sort,
    setSort,
    page,

    booksQuery,
    shelvesQuery,
    copiesQuery,
    auditQuery,
  } = state;

  const { archiveBook, archiveBulk } = useCatalogMutations({
    setSelectedBook,
    setSelectedIds,
    queryClient,
    t,
  });

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
        <CatalogMain
          state={state}
          visibleBooks={visibleBooks}
          pageBooks={pageBooks}
          currentPage={currentPage}
          totalPages={totalPages}
          categories={categories}
          viewCounts={viewCounts}
          archiveBook={archiveBook}
          titlePreference={titlePreference}
          showContextMenu={showContextMenu}
          pageSize={pageSize}
          toggleSort={toggleSort}
          sortIcon={sortIcon}
        />{" "}
      </div>
      <CatalogBulkBar
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        visibleBooks={visibleBooks}
        onArchiveBulk={(ids) => archiveBulk.mutate(ids)}
      />
      <CatalogSidePanels
        state={state}
        copies={copiesQuery.data ?? []}
        shelves={shelvesQuery.data ?? []}
        audit={(auditQuery.data ?? [])
          .filter((row) => selectedBook && row.entity_id === selectedBook.id)
          .slice(0, 5)}
        archiveBook={archiveBook}
      />{" "}
    </div>
  );
}
