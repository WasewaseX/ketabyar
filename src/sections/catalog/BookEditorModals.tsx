import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImageUpload } from "../../components/ui/ImageUpload";
import { ItemTypeSelect, Modal } from "../../components/ui/primitives";
import { addCopy, saveBook, updateBook } from "../../data/repositories/library";
import { useUiStore } from "../../store/uiStore";
import type { Book, ItemType, Shelf } from "../../types";
import { cn } from "../../utils/cn";
import {
  cleanAccession,
  cleanBarcode,
  cleanText,
  formatIsbn,
  isValidIsbn,
  normalizeIsbn,
} from "../../utils/isbn";
import {
  downloadCoverAsBase64,
  enrichMetadataWithGroq,
  fetchBookMetadata,
} from "../../utils/metadata";
import {
  type BookForm,
  bookSchema,
  EMPTY_FORM,
  metadataFromForm,
  metadataToForm,
} from "./shared";

/** Shared Cancel/submit row for the item modals. */
function ModalActions({
  onClose,
  pending,
  cancelLabel,
  saveLabel,
  bordered,
}: {
  onClose: () => void;
  pending: boolean;
  cancelLabel: string;
  saveLabel: string;
  bordered?: boolean;
}) {
  return (
    <div
      className={
        bordered
          ? "flex justify-end gap-2 border-t border-ink/8 pt-4 dark:border-white/8"
          : "flex justify-end gap-2"
      }
    >
      <button
        type="button"
        onClick={onClose}
        className="rounded-[var(--radius-control)] px-4 py-2 text-sm font-semibold text-ink/60 hover:bg-ink/5 dark:text-ivory/60 dark:hover:bg-white/5"
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-[var(--radius-control)] bg-accent px-5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 dark:bg-accent-dark"
      >
        {saveLabel}
      </button>
    </div>
  );
}

export function AddCopyModal({
  book,
  shelves,
  onClose,
  onDone,
}: {
  book: Book;
  shelves: Shelf[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [accession, setAccession] = useState<string>(crypto.randomUUID());
  const [barcode, setBarcode] = useState("");
  const [shelfId, setShelfId] = useState("");
  const [condition, setCondition] = useState("good");

  const mutation = useMutation({
    mutationFn: () =>
      addCopy(
        book.id,
        cleanBarcode(barcode),
        cleanAccession(accession),
        condition,
        shelfId || null,
      ),
    onSuccess: () => {
      toast.success(t("catalog.alerts.copyAdded", "Copy added to the shelf"));
      void queryClient.invalidateQueries();
      onDone();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t("catalog.details.addCopyTitle", "Add a copy")}
      size="md"
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <p className="text-sm text-ink/60 dark:text-ivory/60">{book.title}</p>
        <label>
          <span>
            {t("catalog.addModal.accessionLabel", "Accession number *")}
          </span>
          <input
            className="field-input font-mono"
            required
            value={accession}
            onChange={(event) => setAccession(event.target.value)}
          />
        </label>
        <label>
          <span>
            {t("catalog.addModal.barcodeLabel", "Barcode (scan or type)")}
          </span>
          <input
            className="field-input font-mono"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
          />
        </label>
        <label>
          <span>{t("catalog.details.shelfLabel", "Shelf")}</span>
          <select
            className="field-select"
            value={shelfId}
            onChange={(event) => setShelfId(event.target.value)}
          >
            <option value="">
              {t("catalog.details.shelfUnassigned", "Unassigned")}
            </option>
            {shelves.map((shelf) => (
              <option key={shelf.id} value={shelf.id}>
                {shelf.room} ·{" "}
                {t("inventory.columnLabel", "Col {{number}}", {
                  number: shelf.column_number,
                })}{" "}
                ·{" "}
                {shelf.shelf_type === "floor"
                  ? t("inventory.floorShelf", "Floor shelf")
                  : shelf.code}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>{t("catalog.details.copyCondition", "Condition")}</span>
          <select
            className="field-select"
            value={condition}
            onChange={(event) => setCondition(event.target.value)}
          >
            {["mint", "good", "worn", "damaged"].map((value) => (
              <option key={value} value={value}>
                {t(`catalog.condition.${value}`, value)}
              </option>
            ))}
          </select>
        </label>
        <ModalActions
          onClose={onClose}
          pending={mutation.isPending}
          cancelLabel={t("catalog.addModal.cancel", "Cancel")}
          saveLabel={t("catalog.addModal.save", "Add copy")}
        />
      </form>
    </Modal>
  );
}

/* ── Add / edit modal ────────────────────────────────────────────────── */

export function BookEditorModal({
  isOpen,
  book,
  onClose,
  onSaved,
}: {
  isOpen: boolean;
  book: Book | null;
  onClose: () => void;
  onSaved: (book: Book) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const groqKey = useUiStore((state) => state.preferences.groqApiKey);
  const groqEnabled = useUiStore((state) => state.preferences.groqEnabled);
  const [autoFilling, setAutoFilling] = useState(false);
  const [unresolved, setUnresolved] = useState<{
    key: string;
    fields: string[];
  }>({ key: "", fields: [] });
  // Unresolved field names belong to the book they were found for; for any
  // other book they read as empty (replaces a reset inside the open effect).
  const unresolvedKey = String(book?.id ?? "new");
  const unresolvedFields =
    unresolved.key === unresolvedKey ? unresolved.fields : [];

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
    } else {
      form.reset(EMPTY_FORM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, book?.id]);

  const mutation = useMutation({
    mutationFn: async (values: BookForm) => {
      const yearValue =
        typeof values.publication_year === "string"
          ? parseInt(values.publication_year, 10)
          : values.publication_year;
      const payload = {
        item_type: values.item_type,
        title: cleanText(values.title),
        subtitle: values.subtitle || null,
        arabic_title: values.arabic_title || null,
        tags: values.tags || null,
        author:
          values.author ||
          (values.item_type === "journal" || values.item_type === "fyp"
            ? values.editor
            : "") ||
          null,
        publisher:
          values.publisher ||
          (values.item_type === "other" ? values.brand : "") ||
          null,
        category: values.category || null,
        language: cleanText(values.language),
        publication_year:
          Number.isFinite(yearValue) && yearValue ? yearValue : null,
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
          throw new Error(
            t(
              "catalog.alerts.invalidIsbn",
              "This ISBN failed its checksum — please double-check it.",
            ),
          );
        }
        await saveBook({
          ...payload,
          isbn10: normalized.length === 10 ? normalized : null,
          isbn13: normalized.length === 13 ? normalized : null,
          barcode: values.barcode ? cleanBarcode(values.barcode) : undefined,
          accession: values.accession
            ? cleanAccession(values.accession)
            : undefined,
        } as Parameters<typeof saveBook>[0]);
      }
    },
    onSuccess: async () => {
      toast.success(
        t(
          book ? "catalog.alerts.updated" : "catalog.alerts.bookSaved",
          book ? "Item updated" : "Item added to the catalog",
        ),
      );
      await queryClient.invalidateQueries();
      onSaved((book ?? { id: "" }) as Book);
    },
    onError: (error: Error) =>
      toast.error(
        t("catalog.alerts.saveError", "Could not save: {{message}}", {
          message: error.message,
        }),
      ),
  });

  const autofill = async () => {
    const isbn = normalizeIsbn(form.getValues("isbn") ?? "");
    const query = isbn || form.getValues("title");
    if (!query.trim()) {
      toast.warning(
        t("catalog.alerts.typeQuery", "Type a title or ISBN first"),
      );
      return;
    }
    setAutoFilling(true);
    try {
      toast.info(
        t("catalog.alerts.querying", "Querying Google Books & Open Library…"),
      );
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
      if (meta.publicationYear)
        form.setValue("publication_year", String(meta.publicationYear));
      if (meta.isbn13 || meta.isbn10)
        form.setValue("isbn", formatIsbn(meta.isbn13 || meta.isbn10));
      if (!values.dewey_code && meta.dewey_code)
        form.setValue("dewey_code", meta.dewey_code);
      setUnresolved({
        key: unresolvedKey,
        fields: meta.unresolvedFields ?? [],
      });
      if (meta.cover_url) {
        toast.info(t("catalog.alerts.downloadingCover", "Downloading cover…"));
        const cover = await downloadCoverAsBase64(meta.cover_url);
        if (cover) form.setValue("cover_path", cover);
      }
      toast.success(
        t("catalog.alerts.autofilled", "Fields filled — review and save"),
      );
    } catch (error) {
      toast.error(
        t("catalog.alerts.notFound", "No metadata found for this query"),
      );
      void error;
    } finally {
      setAutoFilling(false);
    }
  };

  const gapHint = (field: string) =>
    unresolvedFields.includes(
      field as "subtitle" | "arabic_title" | "description",
    ) ? (
      <p className="mt-1 text-[11px] text-amber-600">
        {t(
          "catalog.addModal.autofillGap",
          "Needs manual entry (or enable Groq for AI assist)",
        )}
      </p>
    ) : null;

  const text = (
    name: keyof BookForm,
    label: string,
    options?: { required?: boolean; mono?: boolean },
  ) => (
    <label>
      <span>
        {label}
        {options?.required ? <span className="text-copper"> *</span> : null}
      </span>
      <input
        className={cn("field-input", options?.mono && "font-mono")}
        {...form.register(name as never)}
      />
    </label>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        book
          ? t("catalog.addModal.editTitle", "Edit item")
          : t("catalog.addModal.title", "Add an item")
      }
      size="2xl"
    >
      <form
        className="space-y-4"
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold">
              {t("catalog.addModal.cover", "Cover")}
            </p>
            <ImageUpload
              shape="cover"
              value={form.watch("cover_path")}
              onChange={(value) => form.setValue("cover_path", value ?? "")}
            />
          </div>
          <div className="grid gap-3">
            <div>
              <p className="mb-1.5 text-[13px] font-semibold">
                {t("catalog.itemType", "Item type")}
              </p>
              <ItemTypeSelect
                value={itemType}
                onChange={(value) => form.setValue("item_type", value)}
              />
            </div>
            <label>
              <span>
                {t("catalog.addModal.titleLabel", "Title")}
                <span className="text-copper"> *</span>
              </span>
              <input
                className="field-input"
                required
                {...form.register("title")}
              />
              {form.formState.errors.title ? (
                <p className="mt-1 text-[11px] text-red-600">
                  {t("catalog.alerts.titleRequired", "A title is required")}
                </p>
              ) : null}
            </label>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {text("subtitle", t("catalog.addModal.subtitleLabel", "Subtitle"))}
          {text(
            "arabic_title",
            t("catalog.addModal.arabicTitleLabel", "Arabic title"),
          )}
          {gapHint("subtitle")}
          {gapHint("arabic_title")}

          {itemType === "book" ? (
            <>
              <label>
                <span>{t("catalog.addModal.isbnLabel", "ISBN")}</span>
                <div className="flex gap-2">
                  <input
                    className="field-input font-mono"
                    {...form.register("isbn")}
                  />
                  <button
                    type="button"
                    onClick={() => void autofill()}
                    disabled={autoFilling}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-copper/12 px-3 text-xs font-bold text-copper transition hover:bg-copper/20 disabled:opacity-50"
                  >
                    <Wand2 size={13} />
                    {autoFilling
                      ? t("catalog.addModal.autofilling", "…")
                      : t("catalog.addModal.autofill", "Autofill")}
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
                <input
                  type="number"
                  className="field-input"
                  {...form.register("publication_year")}
                />
              </label>
              {text(
                "issue_number",
                t("itemFields.registrationNumber", "Registration number"),
              )}
            </>
          ) : null}

          {itemType === "journal" ? (
            <>
              {text(
                "issue_number",
                t("itemFields.issueNumber", "Volume & issue"),
              )}
              {text("issn", t("itemFields.issn", "ISSN"), { mono: true })}
            </>
          ) : null}

          {itemType === "other" ? (
            <>
              {text("brand", t("itemFields.brand", "Brand"))}
              {text(
                "model_number",
                t("itemFields.modelNumber", "Model / serial"),
              )}
            </>
          ) : null}

          {text(
            "category",
            itemType === "fyp"
              ? t("itemFields.department", "Department / specialty")
              : t("catalog.addModal.categoryLabel", "Category"),
          )}

          <label>
            <span>
              {t("catalog.addModal.langLabel", "Language")}
              <span className="text-copper"> *</span>
            </span>
            <input
              className="field-input"
              required
              {...form.register("language")}
            />
          </label>

          {itemType !== "fyp" ? (
            <label>
              <span>
                {t("catalog.addModal.pubYearLabel", "Publication year")}
              </span>
              <input
                type="number"
                className="field-input"
                {...form.register("publication_year")}
              />
            </label>
          ) : null}

          {text(
            "publisher",
            itemType === "journal"
              ? t("itemFields.press", "Press / society")
              : t("catalog.addModal.publisherLabel", "Publisher"),
          )}

          {!book ? (
            <>
              {text(
                "barcode",
                t(
                  "catalog.addModal.barcodeLabel",
                  "First copy barcode (scan or type)",
                ),
                { mono: true },
              )}
              {text(
                "accession",
                t(
                  "catalog.addModal.accessionAutoLabel",
                  "First copy accession (auto if blank)",
                ),
                { mono: true },
              )}
            </>
          ) : null}

          {text(
            "tags",
            t("catalog.addModal.tagsLabel", "Tags (comma separated)"),
          )}
          {itemType === "book"
            ? text(
                "call_number",
                t("catalog.addModal.callNumberLabel", "Call number"),
              )
            : null}
          {itemType === "book"
            ? text(
                "dewey_code",
                t("catalog.addModal.deweyLabel", "Dewey number"),
              )
            : null}
        </div>

        <label>
          <span>{t("catalog.addModal.descLabel", "Description")}</span>
          <textarea
            className="field-input min-h-20"
            rows={3}
            {...form.register("description")}
          />
        </label>
        {gapHint("description")}

        <ModalActions
          onClose={onClose}
          pending={mutation.isPending}
          cancelLabel={t("catalog.addModal.cancel", "Cancel")}
          saveLabel={t("catalog.addModal.save", "Save item")}
          bordered
        />
      </form>
    </Modal>
  );
}
