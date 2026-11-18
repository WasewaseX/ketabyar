/**
 * External service endpoints. Hosts are configurable per environment via
 * VITE_OPENLIBRARY_HOST / VITE_GROQ_HOST (see .env); the committed defaults
 * are the public hosts, composed into full URLs here so no environment
 * variable is ever required for the app to boot.
 */
const OPENLIBRARY_HOST =
  import.meta.env.VITE_OPENLIBRARY_HOST ?? "openlibrary.org";
const GROQ_HOST = import.meta.env.VITE_GROQ_HOST ?? "api.groq.com";

export const OPENLIBRARY_BASE = `https://${OPENLIBRARY_HOST}`;
export const GROQ_ENDPOINT = `https://${GROQ_HOST}/openai/v1/chat/completions`;
export const GROQ_MODELS_ENDPOINT = `https://${GROQ_HOST}/openai/v1/models`;
