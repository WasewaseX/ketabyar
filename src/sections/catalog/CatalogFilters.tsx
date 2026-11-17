import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";
import { SAVED_VIEWS } from "./shared";

type SavedView = (typeof SAVED_VIEWS)[number];

/** Search field, type/category/language selects and the saved-view pills. */
export function CatalogFilters({
  term,
  setTerm,
  typeFilter,
  setTypeFilter,
  categoryFilter,
  setCategoryFilter,
  languageFilter,
  setLanguageFilter,
  categories,
  view,
  setView,
  viewCounts,
  setPage,
}: {
  term: string;
  setTerm: (value: string) => void;
  typeFilter: string;
  setTypeFilter: (value: string) => void;
  categoryFilter: string;
  setCategoryFilter: (value: string) => void;
  languageFilter: string;
  setLanguageFilter: (value: string) => void;
  categories: string[];
  view: SavedView;
  setView: (view: SavedView) => void;
  viewCounts: Record<SavedView, number>;
  setPage: (page: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-ink/40 dark:text-ivory/40"
          />
          <input
            id="catalog-page-search"
            aria-label={t(
              "catalog.searchPlaceholder",
              "Search title, author, ISBN…",
            )}
            className="field-input ps-9"
            placeholder={t(
              "catalog.searchPlaceholder",
              "Search title, author, ISBN…",
            )}
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label={t("catalog.filterType", "Item type filter")}
          className="field-select max-w-40"
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{t("itemTypes.allItems", "All items")}</option>
          <option value="book">{t("itemTypes.book", "Book")}</option>
          <option value="fyp">{t("itemTypes.fyp", "Thesis / FYP")}</option>
          <option value="journal">{t("itemTypes.journal", "Journal")}</option>
          <option value="other">{t("itemTypes.other", "Other")}</option>
        </select>
        <select
          aria-label={t("catalog.filterCategory", "Category filter")}
          className="field-select max-w-44"
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="">
            {t("catalog.allCategories", "All categories")}
          </option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          aria-label={t("catalog.filterLanguage", "Language filter")}
          className="field-select max-w-36"
          value={languageFilter}
          onChange={(event) => {
            setLanguageFilter(event.target.value);
            setPage(1);
          }}
        >
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
            type="button"
            key={key}
            onClick={() => {
              setView(key);
              setPage(1);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition",
              view === key
                ? "bg-accent text-white dark:bg-accent-dark"
                : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/5 dark:text-ivory/60 dark:hover:bg-white/10",
            )}
          >
            {t(`catalog.${key}`, key)}
            <span
              className={cn(
                "rounded-full px-1.5 text-[10px] font-bold",
                view === key ? "bg-white/25" : "bg-ink/10 dark:bg-white/10",
              )}
            >
              {viewCounts[key]}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
