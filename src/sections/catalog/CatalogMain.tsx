import { Plus } from "lucide-react";
import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";
import { ArtShelf } from "../../components/ui/art";
import { EmptyState, PageLoader } from "../../components/ui/primitives";
import { PageTitle } from "../../components/ui/shared";
import type { Book } from "../../types";
import { CatalogFilters } from "./CatalogFilters";
import { CatalogTable } from "./CatalogTable";
import type { useCatalogPageState } from "./useCatalogPageState";

type State = ReturnType<typeof useCatalogPageState>;

/** Left column of the catalog: header, filters, loader/empty/table. */
export function CatalogMain({
  state,
  visibleBooks,
  pageBooks,
  currentPage,
  totalPages,
  categories,
  viewCounts,
  archiveBook,
  titlePreference,
  showContextMenu,
  pageSize,
  toggleSort,
  sortIcon,
}: {
  state: State;
  visibleBooks: Book[];
  pageBooks: Book[];
  currentPage: number;
  totalPages: number;
  categories: string[];
  viewCounts: Record<string, number>;
  archiveBook: { mutate: (id: string) => void };
  titlePreference: ComponentProps<typeof CatalogTable>["titlePreference"];
  showContextMenu: ComponentProps<typeof CatalogTable>["showContextMenu"];
  pageSize: number;
  toggleSort: (key: string) => void;
  sortIcon: (key: string) => string;
}) {
  const { t } = useTranslation();
  const {
    term,
    setTerm,
    typeFilter,
    setTypeFilter,
    categoryFilter,
    setCategoryFilter,
    languageFilter,
    setLanguageFilter,
    view,
    setView,

    setPage,
    booksQuery,

    setSelectedBook,

    setSidebarTab,
    selectedIds,
    setSelectedIds,
    setEditingBook,
    setEditorOpen,
  } = state;
  return (
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
  );
}
