import { useTranslation } from "react-i18next";
import { CopyEditModal } from "../../components/CopyEditModal";
import { BookEditorModal } from "./BookEditorModals";
import { BookSidebar } from "./BookSidebar";
import type { useCatalogPageState } from "./useCatalogPageState";

type State = ReturnType<typeof useCatalogPageState>;

/** Sidebar + editor/copy dialogs for the selected book. */
export function CatalogSidePanels({
  state,
  copies,
  shelves,
  audit,
  archiveBook,
}: {
  state: State;
  copies: import("../../types").Copy[];
  shelves: import("../../types").Shelf[];
  audit: import("../Activity").AuditRow[];
  archiveBook: { mutate: (id: string) => void };
}) {
  const { t } = useTranslation();
  const {
    selectedBook,
    setSelectedBook,
    sidebarTab,
    setSidebarTab,
    editorOpen,
    setEditorOpen,
    editingBook,
    setEditingBook,
    editCopy,
    setEditCopy,
  } = state;
  return (
    <>
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
          copies={copies}
          shelves={shelves}
          audit={audit
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
          shelves={shelves}
        />
      ) : null}
    </>
  );
}
