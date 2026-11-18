import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Load the committed .env so endpoint constants resolve in tests on every
// platform (vitest does not guarantee automatic .env loading in jsdom).
const env = loadEnv("test", ".", "");

export default defineConfig({
  plugins: [react()],
  // Mirror the production TS build so `__KETABYAR_BACKEND__` (Vite `define`)
  // folds to "ts" in tests exactly as `npm run build` does.
  define: { __KETABYAR_BACKEND__: '"ts"' },
  test: { environment: "jsdom", globals: true, env },
});
