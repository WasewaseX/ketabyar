/**
 * KetabYar **Rust edition** schema bootstrap — a deliberate no-op.
 *
 * ketabyar-core applies the full idempotent schema natively (`schema.rs`,
 * byte-identical DDL) when the Tauri setup hook opens `ketabyar.db`, before
 * any webview code runs. The DDL in `schemaSql.ts` therefore never executes
 * in this edition and is tree-shaken out of the Rust frontend bundle.
 */
export async function ensureSchema(): Promise<void> {}
