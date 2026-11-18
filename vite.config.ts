import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Vite settings tuned for Tauri: fixed port, no screen clearing (so Rust
// errors stay visible), and no file watching inside src-tauri.
export default defineConfig(({ mode }) => {
  // loadEnv replaces a direct node:process import — node types stay out of
  // the app tsconfig and no directive is needed.
  const env = loadEnv(mode, ".", "");
  const host = env.TAURI_DEV_HOST;

  return {
    plugins: [react(), tailwindcss()],
    // Edition switch, resolved at BUILD time and inlined as a literal so the
    // bundler constant-folds the dispatcher and tree-shakes the other engine:
    //   npm run build        → "ts"   (TypeScript engine, tauri-plugin-sql)
    //   npm run build:rust   → "rust" (native ketabyar-core commands)
    define: {
      __KETABYAR_BACKEND__: JSON.stringify(
        env.VITE_KETABYAR_BACKEND === "rust" ? "rust" : "ts",
      ),
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
      watch: { ignored: ["**/src-tauri/**"] },
    },
  };
});
