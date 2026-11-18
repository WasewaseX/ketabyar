import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Load the committed .env so endpoint constants resolve in tests on every
// platform (vitest does not guarantee automatic .env loading in jsdom).
const env = loadEnv("test", ".", "");

export default defineConfig({
  plugins: [react()],
  // Mirror the production TS build so `__KETABYAR_BACKEND__` (Vite `define`)
  // folds to "ts" in tests exactly as `npm run build` does. The endpoint
  // constants are defined explicitly: `test.env` only reaches process.env,
  // while `import.meta.env.VITE_*` in module code needs these textual
  // replacements to resolve on every platform (Windows CI included).
  define: {
    __KETABYAR_BACKEND__: '"ts"',
    "import.meta.env.VITE_OPENLIBRARY_BASE": JSON.stringify(
      env.VITE_OPENLIBRARY_BASE,
    ),
    "import.meta.env.VITE_GROQ_ENDPOINT": JSON.stringify(
      env.VITE_GROQ_ENDPOINT,
    ),
    "import.meta.env.VITE_GROQ_MODELS_ENDPOINT": JSON.stringify(
      env.VITE_GROQ_MODELS_ENDPOINT,
    ),
  },
  test: { environment: "jsdom", globals: true, env },
});
