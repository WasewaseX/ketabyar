/** External service endpoints — resolved from build-time env (see .env). */
export const OPENLIBRARY_BASE = import.meta.env.VITE_OPENLIBRARY_BASE as string;
export const GROQ_ENDPOINT = import.meta.env.VITE_GROQ_ENDPOINT as string;

if (!OPENLIBRARY_BASE || !GROQ_ENDPOINT) {
  throw new Error(
    "Missing VITE_OPENLIBRARY_BASE / VITE_GROQ_ENDPOINT — copy .env to .env.local",
  );
}
