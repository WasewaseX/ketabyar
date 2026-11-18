/**
 * External service endpoints — resolved from build-time env (see .env).
 * No URL literals here on purpose: the defaults live in the committed .env,
 * so each deployment can point the app at its own instances without code
 * changes, and the bundled bundle carries no baked-in URL.
 */
export const OPENLIBRARY_BASE = import.meta.env.VITE_OPENLIBRARY_BASE as string;
export const GROQ_ENDPOINT = import.meta.env.VITE_GROQ_ENDPOINT as string;
export const GROQ_MODELS_ENDPOINT = import.meta.env
  .VITE_GROQ_MODELS_ENDPOINT as string;
