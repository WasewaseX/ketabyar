import { Eye, Trash2 } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { ContextMenuItem } from "../../components/ui/ContextMenu";
import { DefaultCover, ItemTypeBadge } from "../../components/ui/primitives";
import type { Book } from "../../types";
import { cn } from "../../utils/cn";
import { formatDisplayDate } from "../../utils/dates";
import { formatIsbn } from "../../utils/isbn";
import { getDisplayTitle } from "../../utils/titles";

/** The catalog table with its per-row context menu and pagination. */
export function CatalogTable({
  pageBooks,
  selectedIds,
  setSelectedIds,
  toggleSort,
  sortIcon,
  onSelectBook,
  showContextMenu,
  archiveBook,
  titlePreference,

  currentPage,
  totalPages,
  setPage,
  total,
  pageSize,
}: {
  pageBooks: Book[];
  selectedIds: Set<string>;
  setSelectedIds: (next: Set<string>) => void;
  toggleSort: (key: string) => void;
  sortIcon: (key: string) => string;
  onSelectBook: (book: Book) => void;
  showContextMenu: (event: ReactMouseEvent, items: ContextMenuItem[]) => void;
  archiveBook: { mutate: (id: string) => void };
  titlePreference: "original" | "arabic";
  setSidebarTab: (tab: "details" | "copies") => void;
  currentPage: number;
  totalPages: number;
  setPage: (page: number) => void;
  total: number;
  pageSize: number;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]">
        <table className="w-full text-sm" style={{ minWidth: 1100 }}>
          <thead>
            <tr className="bg-ivory text-[11px] uppercase tracking-wide text-ink/60 dark:bg-white/5 dark:text-ivory/60">
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label={t("catalog.selectAll", "Select all books")}
                  checked={
                    pageBooks.length > 0 &&
                    pageBooks.every((book) => selectedIds.has(book.id))
                  }
                  onChange={(event) => {
                    if (event.target.checked)
                      setSelectedIds(
                        new Set([
                          ...selectedIds,
                          ...pageBooks.map((book) => book.id),
                        ]),
                      );
                    else
                      setSelectedIds(
                        new Set(
                          [...selectedIds].filter(
                            (id) => !pageBooks.some((book) => book.id === id),
                          ),
                        ),
                      );
                  }}
                />
              </th>
              {(
                [
                  ["title", t("catalog.headers.title", "Title")],
                  ["item_type", t("catalog.headers.type", "Type")],
                  ["author", t("catalog.headers.author", "Author")],
                  ["category", t("catalog.headers.category", "Category")],
                  ["isbn13", t("catalog.headers.isbn", "ISBN")],
                  ["created_at", t("catalog.headers.dateAdded", "Added")],
                  [
                    "available_copies",
                    t("catalog.headers.availability", "Availability"),
                  ],
                ] as const
              ).map(([key, label]) => (
                <th
                  key={key}
                  className="cursor-pointer px-4 py-3 text-start font-semibold"
                  onClick={() => toggleSort(key)}
                >
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
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      onSelectBook(book);
                    }
                  }}
                  onClick={(event) => {
                    if (
                      (event.target as HTMLElement).closest(
                        "input, button, a, label",
                      )
                    )
                      return;
                    onSelectBook(book);
                  }}
                  onContextMenu={(event) =>
                    showContextMenu(event, [
                      {
                        id: "view",
                        label: t(
                          "catalog.contextMenu.viewDetails",
                          "View details & copies",
                        ),
                        icon: Eye,
                        onClick: () => {
                          onSelectBook(book);
                        },
                      },
                      ...(book.isbn13 || book.isbn10
                        ? [
                            {
                              id: "copyIsbn",
                              label: t(
                                "catalog.contextMenu.copyIsbn",
                                "Copy ISBN",
                              ),
                              onClick: () => {
                                void navigator.clipboard.writeText(
                                  formatIsbn(book.isbn13 || book.isbn10),
                                );
                                toast.success(
                                  t("catalog.copiedIsbn", "ISBN copied"),
                                );
                              },
                            },
                          ]
                        : []),
                      {
                        id: "copyTitle",
                        label: t("catalog.contextMenu.copyTitle", "Copy title"),
                        onClick: () => {
                          void navigator.clipboard.writeText(book.title);
                          toast.success(
                            t("catalog.copiedTitle", "Title copied"),
                          );
                        },
                      },
                      {
                        id: "reserve",
                        label: t(
                          "catalog.contextMenu.reserveBook",
                          "Reserve this title",
                        ),
                        onClick: () =>
                          navigate(`/reservations?book_id=${book.id}`),
                      },
                      { id: "d", divider: true },
                      {
                        id: "delete",
                        label: t(
                          "catalog.contextMenu.deleteBook",
                          "Archive item",
                        ),
                        icon: Trash2,
                        variant: "danger",
                        onClick: () => {
                          if (
                            window.confirm(
                              t(
                                "catalog.alerts.confirmDelete",
                                'Archive "{{title}}"? Its copies stay in the inventory history.',
                                { title: book.title },
                              ),
                            )
                          )
                            archiveBook.mutate(book.id);
                        },
                      },
                    ])
                  }
                  className="cursor-pointer transition hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]"
                >
                  <td className="border-b border-ink/6 px-3 py-3 dark:border-white/6">
                    <input
                      type="checkbox"
                      aria-label={t(
                        "catalog.selectRow",
                        "Select book {{title}}",
                        { title: book.title },
                      )}
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
                        <img
                          src={book.cover_path}
                          alt=""
                          className="h-12 w-8 rounded-md object-cover shadow-sm"
                        />
                      ) : (
                        <DefaultCover
                          type={book.item_type}
                          className="h-12 w-8 rounded-md"
                        />
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{display.main}</p>
                        {display.sub ? (
                          <p className="truncate text-xs text-ink/50 dark:text-ivory/50">
                            {display.sub}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                    <ItemTypeBadge type={book.item_type} />
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 text-[13px] dark:border-white/6">
                    {book.author || "—"}
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 text-[13px] dark:border-white/6">
                    {book.category ||
                      t("catalog.uncategorized", "Uncategorized")}
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 font-mono text-xs dark:border-white/6">
                    {formatIsbn(book.isbn13 || book.isbn10) || "—"}
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 text-xs text-ink/60 dark:border-white/6 dark:text-ivory/60">
                    {formatDisplayDate(book.created_at)}
                  </td>
                  <td className="border-b border-ink/6 px-4 py-3 dark:border-white/6">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-bold",
                        (book.available_copies ?? 0) > 0
                          ? "bg-accent/12 text-accent dark:text-accent-dark"
                          : "bg-copper/15 text-copper",
                      )}
                    >
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
        <span>
          {t("catalog.showing", "Showing {{start}}–{{end}} of {{total}}", {
            start: (currentPage - 1) * pageSize + 1,
            end: Math.min(currentPage * pageSize, total),
            total: total,
          })}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
          >
            ‹
          </button>
          <span className="tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
            className="rounded-lg border border-ink/10 px-2 py-1 disabled:opacity-40 dark:border-white/10"
          >
            ›
          </button>
        </div>
      </div>
    </>
  );
}
