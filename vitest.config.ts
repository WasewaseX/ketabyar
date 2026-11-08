import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // Mirror the production TS build so `__KETABYAR_BACKEND__` (Vite `define`)
  // folds to "ts" in tests exactly as `npm run build` does.
  define: { __KETABYAR_BACKEND__: '"ts"' },
  test: { environment: "jsdom", globals: true },
});
