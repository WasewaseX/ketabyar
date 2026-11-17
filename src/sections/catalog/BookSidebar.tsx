import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, CopyPlus, Pencil, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { DefaultCover, StatusBadge } from "../../components/ui/primitives";
import { deleteCopy } from "../../data/repositories/library";
import { useUiStore } from "../../store/uiStore";
import type { Book, Copy, Shelf } from "../../types";
import { cn } from "../../utils/cn";
import { formatDisplayDate } from "../../utils/dates";
import { formatIsbn } from "../../utils/isbn";
import { getDisplayTitle } from "../../utils/titles";
import { AddCopyModal } from "./BookEditorModals";

interface AuditEntry {
  id: string;
  action: string;
  actor: string;
  created_at: string;
}

export function BookSidebar({
  book,
  tab,
  setTab,
  onClose,
  onEdit,
  onArchive,
  copies,
  shelves,
  audit,
  onEditCopy,
  onAddCopy,
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
  const titlePreference = useUiStore(
    (state) => state.preferences.titlePreference,
  );
  const display = getDisplayTitle(book, titlePreference);
  const [addCopyOpen, setAddCopyOpen] = useState(false);

  const spec = useMemo(() => {
    if (!book.metadata) return [] as [string, string][];
    try {
      return Object.entries(
        JSON.parse(book.metadata) as Record<string, unknown>,
      ).filter(
        ([, value]) => value !== null && value !== undefined && value !== "",
      );
    } catch {
      return [];
    }
  }, [book.metadata]);

  const deleteCopyMutation = useMutation({
    mutationFn: deleteCopy,
    onSuccess: () => {
      toast.success(t("catalog.alerts.copyArchived", "Copy archived"));
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const infoRows: [string, string][] = [
    [t("catalog.details.author", "Author"), book.author ?? "—"],
    [t("catalog.details.category", "Category"), book.category ?? "—"],
    [t("catalog.details.language", "Language"), book.language],
    [t("catalog.details.publisher", "Publisher"), book.publisher ?? "—"],
    [
      t("catalog.details.pubYear", "Year"),
      book.publication_year ? String(book.publication_year) : "—",
    ],
    [t("catalog.details.callNumber", "Call number"), book.call_number ?? "—"],
    [t("catalog.details.deweyCode", "Dewey"), book.dewey_code ?? "—"],
    [t("catalog.details.isbn10", "ISBN-10"), formatIsbn(book.isbn10) || "—"],
    [t("catalog.details.isbn13", "ISBN-13"), formatIsbn(book.isbn13) || "—"],
  ];

  return (
    <aside
      key={book.id}
      className="sticky top-0 w-[340px] shrink-0 self-start rounded-[var(--radius-card)] border border-ink/8 bg-white shadow-card dark:border-white/8 dark:bg-[#1b2723]"
    >
      <div className="relative">
        <div className="flex h-44 items-end justify-center rounded-t-[var(--radius-card)] bg-gradient-to-b from-accent/15 to-transparent p-4 dark:from-accent-dark/15">
          {book.cover_path ? (
            <img
              src={book.cover_path}
              alt=""
              className="h-full rounded-md object-cover shadow-lg"
            />
          ) : (
            <DefaultCover
              type={book.item_type}
              className="h-full w-24 rounded-md"
              iconSize={26}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("catalog.details.back", "Back")}
          className="absolute end-3 top-3 rounded-full bg-white/85 p-1.5 text-ink/70 hover:bg-white dark:bg-black/40 dark:text-ivory/70"
        >
          <X size={15} />
        </button>
      </div>

      <div className="border-b border-ink/8 p-4 dark:border-white/8">
        <h3 className="font-display text-base font-bold leading-snug">
          {display.main}
        </h3>
        {display.sub ? (
          <p className="mt-0.5 text-xs text-ink/55 dark:text-ivory/55">
            {display.sub}
          </p>
        ) : null}
        {book.tags ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {book.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
              .map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-ink/6 px-2 py-0.5 text-[10px] font-semibold dark:bg-white/8"
                >
                  {tag}
                </span>
              ))}
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-ink/5 py-2 text-xs font-bold transition hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
          >
            <Pencil size={13} /> {t("catalog.details.edit", "Edit")}
          </button>
          <button
            type="button"
            onClick={onArchive}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-red-600/10 py-2 text-xs font-bold text-red-600 transition hover:bg-red-600/20"
          >
            <Archive size={13} /> {t("catalog.details.archive", "Archive")}
          </button>
        </div>
      </div>

      <div className="flex border-b border-ink/8 text-[13px] font-semibold dark:border-white/8">
        {(["details", "copies"] as const).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "flex-1 py-2.5 transition",
              tab === key
                ? "border-b-2 border-accent text-accent dark:border-accent-dark dark:text-accent-dark"
                : "text-ink/50 dark:text-ivory/50",
            )}
          >
            {key === "details"
              ? t("catalog.details.title", "Details")
              : `${t("catalog.details.copies", "Copies")} (${copies.length})`}
          </button>
        ))}
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-4">
        {tab === "details" ? (
          <>
            <dl className="space-y-2 text-[13px]">
              {infoRows.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="shrink-0 text-ink/50 dark:text-ivory/50">
                    {label}
                  </dt>
                  <dd className="text-end font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            {spec.length > 0 ? (
              <>
                <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wide text-copper">
                  {t("catalog.details.specifications", "Item specifications")}
                </p>
                <dl className="space-y-2 text-[13px]">
                  {spec.map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="shrink-0 text-ink/50 dark:text-ivory/50">
                        {t(`itemFields.${key}`, key)}
                      </dt>
                      <dd className="text-end font-medium">{String(value)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : null}
            {book.description ? (
              <>
                <p className="mt-4 mb-1 text-[11px] font-bold uppercase tracking-wide text-copper">
                  {t("catalog.details.description", "Description")}
                </p>
                <p className="max-h-40 overflow-y-auto text-[13px] leading-relaxed text-ink/70 dark:text-ivory/70">
                  {book.description}
                </p>
              </>
            ) : null}
            {audit.length > 0 ? (
              <>
                <p className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wide text-copper">
                  {t("catalog.details.recentActivity", "Recent activity")}
                </p>
                <ul className="space-y-1.5 text-xs text-ink/60 dark:text-ivory/60">
                  {audit.map((entry) => (
                    <li key={entry.id} className="flex justify-between gap-2">
                      <span>
                        {t(
                          `activity.actions.${entry.action}`,
                          entry.action.replace(/_/g, " "),
                        )}
                      </span>
                      <span className="shrink-0">
                        {entry.actor} · {formatDisplayDate(entry.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAddCopyOpen(true)}
              className="mb-3 flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] border border-dashed border-ink/15 py-2.5 text-xs font-bold text-ink/60 transition hover:border-accent/40 hover:text-accent dark:border-white/15 dark:text-ivory/60 dark:hover:text-accent-dark"
            >
              <CopyPlus size={14} />
              {t("catalog.details.addCopy", "Add a copy")}
            </button>
            {copies.length === 0 ? (
              <p className="py-6 text-center text-xs text-ink/50 dark:text-ivory/50">
                {t(
                  "catalog.details.noCopiesYet",
                  "No physical copies registered yet.",
                )}
              </p>
            ) : (
              <ul className="space-y-2">
                {copies.map((copy) => (
                  <li
                    key={copy.id}
                    className="rounded-xl border border-ink/8 p-3 dark:border-white/8"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-[12px] font-bold">
                        {copy.barcode}
                      </p>
                      <StatusBadge value={copy.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-ink/50 dark:text-ivory/50">
                      {t("catalog.details.copyAccession", "Accession")}:{" "}
                      {copy.accession_number}
                      {copy.room
                        ? ` · ${copy.room} ${t("inventory.columnLabel", "Col {{number}}", { number: copy.column_number })} ${copy.shelf}`
                        : ""}
                    </p>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEditCopy(copy)}
                        className="rounded-lg bg-ink/5 p-1.5 hover:bg-ink/10 dark:bg-white/8 dark:hover:bg-white/15"
                        aria-label={t("catalog.details.edit", "Edit")}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            window.confirm(
                              t(
                                "catalog.alerts.confirmArchiveCopy",
                                "Archive this copy?",
                                { barcode: copy.barcode },
                              ),
                            )
                          )
                            deleteCopyMutation.mutate(copy.id);
                        }}
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
          onDone={() => {
            setAddCopyOpen(false);
            onAddCopy();
          }}
        />
      ) : null}
    </aside>
  );
}

/* ── Add-copy modal ──────────────────────────────────────────────────── */
