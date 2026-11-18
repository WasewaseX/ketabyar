import { useEffect, useState } from "react";
import {
  auditLog,
  books,
  getCopiesForBook,
  getShelves,
} from "../../data/repositories/library";
import { useQuery } from "../../hooks/useLibraryQuery";
import type { Book, Copy } from "../../types";
import type { SAVED_VIEWS } from "./shared";

/**
 * Catalog page state: filters, saved view, selection, dialogs and the four
 * backing queries. Deep links (?q= / ?action=add-book / ?focus=search) are
 * consumed once here.
 */
export function useCatalogPageState() {
  const [term, setTerm] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [view, setView] = useState<(typeof SAVED_VIEWS)[number]>("allBooks");
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

  const booksQuery = useQuery({
    queryKey: ["books", term, typeFilter],
    queryFn: () => books(term, typeFilter),
  });
  const shelvesQuery = useQuery({ queryKey: ["shelves"], queryFn: getShelves });

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

  return {
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
    sort,
    setSort,
    page,
    setPage,
    selectedBook,
    setSelectedBook,
    sidebarTab,
    setSidebarTab,
    editorOpen,
    setEditorOpen,
    editingBook,
    setEditingBook,
    selectedIds,
    setSelectedIds,
    editCopy,
    setEditCopy,
    booksQuery,
    shelvesQuery,
    copiesQuery,
    auditQuery,
  };
}
