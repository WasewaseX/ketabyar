# Third-party notices

KetabYar depends on the following open-source packages. License texts ship
inside each package under `node_modules/<package>/LICENSE` (npm) and inside the
Cargo registry checkout for Rust crates. This file is an inventory, not a
substitute for the authoritative license texts.

## Frontend (npm)

| Package | License |
| --- | --- |
| react, react-dom | MIT |
| react-router-dom | MIT |
| @tanstack/react-query, @tanstack/react-table, @tanstack/react-virtual | MIT |
| zustand | MIT |
| i18next, react-i18next | MIT |
| zod, @hookform/resolvers, react-hook-form | MIT |
| @tauri-apps/api and official @tauri-apps plugins (sql, dialog, fs, opener, autostart, notification, clipboard-manager, window-state, store, log, global-shortcut) | MIT / Apache-2.0 |
| recharts | MIT |
| lucide-react | ISC |
| cmdk | MIT |
| sonner | MIT |
| motion (Framer Motion) | MIT |
| date-fns | MIT |
| jspdf, jspdf-autotable | MIT |
| jszip | MIT / GPL-3.0 dual (MIT option used) |
| papaparse | MIT |
| exceljs | MIT |
| @zxing/browser | Apache-2.0 |
| clsx, tailwind-merge, class-variance-authority | MIT / Apache-2.0 |
| vazirmatn (font) | SIL OFL 1.1 |
| @fontsource/ibm-plex-sans-arabic, @fontsource/manrope (fonts) | SIL OFL 1.1 |

## Desktop shell (Rust, crates.io)

| Crate | License |
| --- | --- |
| tauri, tauri-build | MIT / Apache-2.0 |
| tauri-plugin-sql (sqlite) | MIT / Apache-2.0 |
| tauri-plugin-opener, -store, -autostart, -global-shortcut, -single-instance, -notification, -dialog, -fs, -window-state, -clipboard-manager, -log | MIT / Apache-2.0 |
| serde, serde_json | MIT / Apache-2.0 |

## Toolchain

| Tool | License |
| --- | --- |
| TypeScript | Apache-2.0 |
| Vite | MIT |
| Tailwind CSS 4 (@tailwindcss/vite) | MIT |
| vitest, jsdom, @testing-library/* | MIT |
| Playwright (dev-time logo rendering only) | Apache-2.0 |
