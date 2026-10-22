/**
 * KetabYar schema dispatcher — build-time engine selection, same contract as
 * the repository/auth dispatchers (see repositories/library.ts and auth.ts):
 *
 *   • `schemaSql.ts`  — TypeScript edition: idempotent DDL runs in the webview
 *     through tauri-plugin-sql.
 *   • `schemaRust.ts` — Rust edition: no-op, because ketabyar-core applies the
 *     byte-identical schema natively at startup (core/src/schema.rs).
 *
 * `__KETABYAR_BACKEND__` is inlined by Vite's `define`, so the bundler folds
 * this selection and tree-shakes the unused implementation.
 */
import * as SQL from "./schemaSql";
import * as RUST from "./schemaRust";

declare const __KETABYAR_BACKEND__: "ts" | "rust";

const impl: typeof SQL = __KETABYAR_BACKEND__ === "rust" ? RUST : SQL;

/** Applies the idempotent local schema (native no-op in the Rust edition). */
export const ensureSchema = impl.ensureSchema;
