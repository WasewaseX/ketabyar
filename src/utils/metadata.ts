/**
 * External metadata lookup for cataloguing: Google Books, Open Library, and
 * an optional Groq-powered refinement pass. Lookups are unauthenticated and
 * fully optional — the app is offline-first and treats every provider as
 * best-effort. The original field mapping targets English-language catalogues;
 * KetabYar adds Persian language normalisation on top.
 */

export interface ExternalBookMetadata {
  title: string;
  subtitle?: string;
  arabic_title?: string;
  tags?: string;
  author?: string;
  publisher?: string;
  publicationYear?: number;
  category?: string;
  language: string;
  description?: string;
  cover_url?: string | null;
  isbn10?: string | null;
  isbn13?: string | null;
  dewey_code?: string | null;
  unresolvedFields?: ("arabic_title" | "subtitle" | "description")[];
}

const REQUEST_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const HAS_ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F]/;

/** Maps provider language codes onto catalog labels; Persian included. */
function normalizeLanguage(code: string | undefined): string {
  switch ((code || "").slice(0, 2).toLowerCase()) {
    case "fa": return "فارسی";
    case "en": return "English";
    case "ar": return "Arabic";
    case "fr": return "French";
    default: return code || "English";
  }
}

/** Drops generic catch-all subjects that make poor category labels. */
function cleanCategory(raw: string): string {
  const noise = /(translation|voyage|travel|general|textbook|study guide|handbook)/i;
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.find((p) => !noise.test(p)) ?? parts[0] ?? "";
}

const TAG_BUCKETS: { test: RegExp; tags: string[] }[] = [
  { test: /alchemist|philosoph|sina/i, tags: ["philosophy", "classic", "allegory"] },
  { test: /pride|prejudice|austen/i, tags: ["classic", "romance", "society"] },
  { test: /medic|anatomy|health|nursing/i, tags: ["medical", "reference", "science"] },
  { test: /histor|civiliz/i, tags: ["history", "non-fiction"] },
  { test: /novel|story|fiction/i, tags: ["fiction", "literature"] },
];

/** A small keyword-derived tag set so records never leave empty-handed. */
function generateFallbackTags(category: string): string {
  const tags = new Set<string>([category.toLowerCase()].filter(Boolean));
  for (const bucket of TAG_BUCKETS) {
    if (bucket.test.test(category)) bucket.tags.forEach((tag) => tags.add(tag));
  }
  return Array.from(tags).join(", ");
}

function firstIsbn(volumes: unknown): { isbn10: string | null; isbn13: string | null } {
  const identifiers = (volumes as { industryIdentifiers?: { type: string; identifier: string }[] })?.industryIdentifiers ?? [];
  let isbn10: string | null = null;
  let isbn13: string | null = null;
  for (const entry of identifiers) {
    if (entry.type === "ISBN_10" && !isbn10) isbn10 = entry.identifier.replace(/[- ]/g, "");
    if (entry.type === "ISBN_13" && !isbn13) isbn13 = entry.identifier.replace(/[- ]/g, "");
  }
  return { isbn10, isbn13 };
}

async function queryGoogleBooks(query: string, isIsbn: boolean): Promise<ExternalBookMetadata | null> {
  try {
    const url = isIsbn
      ? `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(query)}`
      : `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=5`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const items: unknown[] = payload?.items ?? [];
    if (items.length === 0) return null;
    const chosen = isIsbn
      ? items[0]
      : (items.find((item) => firstIsbn((item as { volumeInfo?: unknown }).volumeInfo).isbn13 || firstIsbn((item as { volumeInfo?: unknown }).volumeInfo).isbn10) ?? items[0]);
    const volume = (chosen as { volumeInfo?: Record<string, unknown> }).volumeInfo ?? {};
    const identifiers = firstIsbn(volume);
    const imageLinks = volume.imageLinks as { thumbnail?: string; smallThumbnail?: string } | undefined;
    const cover = (imageLinks?.thumbnail || imageLinks?.smallThumbnail || "")?.replace(/^http:/, "https:");
    return {
      title: String(volume.title ?? ""),
      subtitle: volume.subtitle ? String(volume.subtitle) : undefined,
      author: Array.isArray(volume.authors) ? volume.authors.join(", ") : undefined,
      publisher: volume.publisher ? String(volume.publisher) : undefined,
      publicationYear: volume.publishedDate ? parseInt(String(volume.publishedDate).slice(0, 4), 10) || undefined : undefined,
      category: Array.isArray(volume.categories) && volume.categories.length ? String(volume.categories[0]) : undefined,
      language: normalizeLanguage(volume.language as string | undefined),
      description: volume.description ? String(volume.description) : undefined,
      cover_url: cover || null,
      ...identifiers,
    };
  } catch (error) {
    console.error("Google Books lookup failed", error);
    return null;
  }
}

async function queryOpenLibraryByIsbn(clean: string): Promise<ExternalBookMetadata | null> {
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&jscmd=data&format=json`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const book = payload?.[`ISBN:${clean}`];
    if (!book) return null;
    const yearMatch = /\d{4}/.exec(String(book.publish_date ?? ""));
    return {
      title: String(book.title ?? ""),
      author: (book.authors ?? []).map((a: { name: string }) => a.name).join(", ") || undefined,
      publisher: (book.publishers ?? []).map((p: { name: string }) => p.name).join(", ") || undefined,
      publicationYear: yearMatch ? parseInt(yearMatch[0], 10) : undefined,
      category: (book.subjects ?? []).slice(0, 3).map((s: { name: string }) => s.name).join(", ") || undefined,
      language: normalizeLanguage(String(book.key ?? "").includes("/OLA/") ? "" : undefined),
      cover_url: book.cover?.large || book.cover?.medium || book.cover?.small || `https://covers.openlibrary.org/b/isbn/${clean}-L.jpg`,
      dewey_code: book.classifications?.dewey_decimal_class?.[0] ?? null,
    };
  } catch (error) {
    console.error("Open Library ISBN lookup failed", error);
    return null;
  }
}

async function queryOpenLibraryByText(query: string): Promise<ExternalBookMetadata | null> {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=5`;
    const response = await fetchWithTimeout(url);
    if (!response.ok) return null;
    const payload = await response.json();
    const docs: Record<string, unknown>[] = payload?.docs ?? [];
    const doc = docs.find((d) => Array.isArray(d.isbn) && d.isbn.length > 0);
    if (!doc) return null;
    const isbns = (doc.isbn as string[]).map((i) => i.replace(/[- ]/g, ""));
    const isbn13 = isbns.find((i) => i.length === 13) ?? null;
    const isbn10 = isbns.find((i) => i.length === 10) ?? null;
    const coverId = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null;
    return {
      title: String(doc.title ?? ""),
      author: Array.isArray(doc.author_name) ? doc.author_name.join(", ") : undefined,
      publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : undefined,
      publicationYear: (doc.first_publish_year as number) ?? (Array.isArray(doc.publish_year) ? doc.publish_year[0] : undefined),
      category: Array.isArray(doc.subject) ? doc.subject.slice(0, 3).join(", ") : undefined,
      language: "English",
      cover_url: coverId || (isbn13 || isbn10 ? `https://covers.openlibrary.org/b/isbn/${isbn13 || isbn10}-L.jpg` : null),
      isbn10,
      isbn13,
    };
  } catch (error) {
    console.error("Open Library text lookup failed", error);
    return null;
  }
}

function mergeResults(google: ExternalBookMetadata | null, openLibrary: ExternalBookMetadata | null, query: string): ExternalBookMetadata {
  // Google's catalogue wins per-field where it answered; Open Library fills
  // the gaps (notably Dewey and covers).
  const merged: ExternalBookMetadata = {
    title: google?.title || openLibrary?.title || "",
    subtitle: google?.subtitle || openLibrary?.subtitle,
    author: google?.author || openLibrary?.author,
    publisher: google?.publisher || openLibrary?.publisher,
    publicationYear: google?.publicationYear || openLibrary?.publicationYear,
    category: cleanCategory(google?.category || openLibrary?.category || ""),
    language: google?.language || openLibrary?.language || "English",
    description: google?.description || openLibrary?.description,
    cover_url: google?.cover_url || openLibrary?.cover_url || null,
    isbn10: google?.isbn10 || openLibrary?.isbn10 || null,
    isbn13: google?.isbn13 || openLibrary?.isbn13 || null,
    dewey_code: openLibrary?.dewey_code ?? google?.dewey_code ?? null,
  };

  // An Arabic-script query result doubles as the Arabic title.
  if (HAS_ARABIC_SCRIPT.test(merged.title)) merged.arabic_title = merged.title;

  if (!merged.cover_url && (merged.isbn13 || merged.isbn10)) {
    merged.cover_url = `https://covers.openlibrary.org/b/isbn/${merged.isbn13 || merged.isbn10}-L.jpg`;
  }
  merged.tags = generateFallbackTags(merged.category || "");

  const unresolved: ExternalBookMetadata["unresolvedFields"] = [];
  if (!merged.arabic_title) unresolved.push("arabic_title");
  if (!merged.subtitle) unresolved.push("subtitle");
  if (!merged.description || merged.description.length < 30) unresolved.push("description");
  merged.unresolvedFields = unresolved;

  if (!merged.title && !merged.author) {
    throw new Error(`Could not find any metadata matches for "${query}".`);
  }
  return merged;
}

/** Runs Google Books and Open Library in parallel and merges the answers. */
export async function fetchBookMetadata(query: string): Promise<ExternalBookMetadata> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("Please enter a non-empty ISBN or search query.");
  const clean = trimmed.replace(/[- ]/g, "");
  const isIsbn = (clean.length === 10 || clean.length === 13) && /^\d{9}/.test(clean);

  const [google, openLibrary] = await Promise.all([
    queryGoogleBooks(clean, isIsbn),
    isIsbn ? queryOpenLibraryByIsbn(clean) : queryOpenLibraryByText(trimmed),
  ]);
  return mergeResults(google, openLibrary, trimmed);
}

/** Convenience alias for ISBN-only lookups. */
export async function fetchBookMetadataByIsbn(isbn: string): Promise<ExternalBookMetadata> {
  return fetchBookMetadata(isbn);
}

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Optional second pass: asks Groq's fast model to complete / correct the
 * merged record (Persian title translation, Dewey estimate, blurb). Any
 * failure leaves the incoming metadata untouched.
 */
export async function enrichMetadataWithGroq(
  queryOrIsbn: string,
  existingMetadata: ExternalBookMetadata,
  apiKey: string,
): Promise<ExternalBookMetadata> {
  if (!apiKey) return existingMetadata;
  try {
    const response = await fetchWithTimeout(GROQ_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "user",
            content:
              `You are a library cataloguing assistant. Refine and complete this record for the query "${queryOrIsbn}". ` +
              `Existing record: ${JSON.stringify(existingMetadata)}. ` +
              `Return ONLY a JSON object with the keys title, subtitle, arabic_title (Persian translation of the title), author, publisher, ` +
              `category, tags, language, description (100-200 words), publicationYear, isbn10, isbn13, dewey_code (best estimate).`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });
    if (!response.ok) throw new Error(`Groq API returned status ${response.status}`);
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices[0].message.content) as Record<string, unknown>;
    const pick = (key: string) => (parsed[key] ? String(parsed[key]) : undefined);

    const result: ExternalBookMetadata = {
      ...existingMetadata,
      title: pick("title") || existingMetadata.title,
      subtitle: pick("subtitle") || existingMetadata.subtitle,
      arabic_title: pick("arabic_title") || existingMetadata.arabic_title,
      author: pick("author") || existingMetadata.author,
      publisher: pick("publisher") || existingMetadata.publisher,
      category: pick("category") || existingMetadata.category,
      tags: pick("tags") || existingMetadata.tags,
      language: pick("language") || existingMetadata.language,
      description: pick("description") || existingMetadata.description,
      publicationYear: parsed.publicationYear ? Number(parsed.publicationYear) : existingMetadata.publicationYear,
      isbn10: pick("isbn10") || existingMetadata.isbn10,
      isbn13: pick("isbn13") || existingMetadata.isbn13,
      dewey_code: pick("dewey_code") || existingMetadata.dewey_code,
      cover_url: existingMetadata.cover_url, // Groq cannot supply covers.
    };

    const unresolved: ExternalBookMetadata["unresolvedFields"] = [];
    if (!result.arabic_title) unresolved.push("arabic_title");
    if (!result.subtitle) unresolved.push("subtitle");
    if (!result.description || result.description.length < 30) unresolved.push("description");
    result.unresolvedFields = unresolved;
    return result;
  } catch (error) {
    console.error("Groq enrichment failed; keeping existing metadata", error);
    return existingMetadata;
  }
}

/** Fetches a cover image and stores it as a base64 data URL; falls back to the URL itself. */
export async function downloadCoverAsBase64(coverUrl: string | null | undefined): Promise<string | null> {
  if (!coverUrl) return null;
  try {
    const response = await fetchWithTimeout(coverUrl);
    if (!response.ok) return coverUrl;
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Cover download failed", error);
    return coverUrl;
  }
}
