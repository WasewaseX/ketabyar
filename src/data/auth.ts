/**
 * KetabYar auth dispatcher — the single import point for authentication.
 *
 * Two interchangeable engines implement the identical public API:
 *   • `authSql.ts`  — TypeScript edition: PIN hashing in the webview
 *     (WebCrypto SHA-256 + salt), SQL through tauri-plugin-sql.
 *   • `authRust.ts` — Rust edition: PIN hashing/verification native in
 *     ketabyar-core (repo::auth) behind Tauri commands; zero webview SQL.
 *
 * The backend is chosen at build time exactly like the repository layer
 * (see repositories/library.ts): `__KETABYAR_BACKEND__` is inlined by Vite's
 * `define` as a string literal ("ts" | "rust"), so the bundler constant-folds
 * the selection and tree-shakes the engine that is not shipped.
 *
 * `impl` is typed as `typeof SQL` so the Rust module must stay structurally
 * identical to the SQL module — the compiler is the compatibility contract.
 */

import * as RUST from "./authRust";
import * as SQL from "./authSql";

declare const __KETABYAR_BACKEND__: "ts" | "rust";

const impl: typeof SQL = __KETABYAR_BACKEND__ === "rust" ? RUST : SQL;

export const activeAuthBackend: "ts" | "rust" = __KETABYAR_BACKEND__;

export const bootstrapAdminIfNeeded = impl.bootstrapAdminIfNeeded;
export const login = impl.login;
export const logout = impl.logout;
export const currentSession = impl.currentSession;
export const changeOwnPassword = impl.changeOwnPassword;
export const listUsers = impl.listUsers;
export const resetPassword = impl.resetPassword;

export type { LoginAccount } from "./authSql";
