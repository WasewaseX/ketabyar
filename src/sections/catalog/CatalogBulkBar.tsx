import { useTranslation } from "react-i18next";
import type { Book } from "../../types";

/** Bulk archive bar over the selected books. */
export function CatalogBulkBar({
  selectedIds,
  setSelectedIds,
  visibleBooks,
  onArchiveBulk,
}: {
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  visibleBooks: Book[];
  onArchiveBulk: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* Bulk bar */}
      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 start-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-[#17211f] px-5 py-3 text-sm text-white shadow-2xl rtl:translate-x-1/2">
          <span className="font-bold">
            {t("catalog.bulk.selectedCount", "{{count}} selected", {
              count: selectedIds.size,
            })}
          </span>
          <button
            type="button"
            className="rounded-lg px-2 py-1 hover:bg-white/10"
            onClick={() =>
              setSelectedIds(new Set(visibleBooks.map((book) => book.id)))
            }
          >
            {t("catalog.bulk.selectAll", "Select all")}
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1 hover:bg-white/10"
            onClick={() => setSelectedIds(new Set())}
          >
            {t("catalog.bulk.deselectAll", "Deselect all")}
          </button>
          <button
            type="button"
            className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold hover:bg-red-700"
            onClick={() => {
              if (
                window.confirm(
                  t(
                    "catalog.alerts.confirmBulkArchive",
                    "Archive {{count}} selected items?",
                    { count: selectedIds.size },
                  ),
                )
              ) {
                onArchiveBulk(Array.from(selectedIds));
              }
            }}
          >
            {t("catalog.bulk.archiveSelected", "Archive selected")}
          </button>
        </div>
      ) : null}
    </>
  );
}
