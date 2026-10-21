import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
// @ts-expect-error node types are intentionally omitted from the app tsconfig
import process from "node:process";

const host = process.env.TAURI_DEV_HOST;

// Vite settings tuned for Tauri: fixed port, no screen clearing (so Rust
// errors stay visible), and no file watching inside src-tauri.
export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    watch: { ignored: ["**/src-tauri/**"] },
  },
}));
