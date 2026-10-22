# Contributing to KetabYar

Thank you for considering a contribution. KetabYar is a fully-offline,
Persian-first (RTL) library-management desktop app built with **Tauri 2 +
React + TypeScript**, shipping two interchangeable data engines from one
codebase. This document explains everything you need to work on it
productively.

## Development setup

Requirements:

- **Node.js ≥ 20** (tested with 22/24)
- **npm ≥ 10**
- For running the desktop shell or touching Rust code: **Rust toolchain**
  (stable, `rustup`) plus the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/)
  for your OS. (Node-only work — typecheck, tests, web build — needs no Rust.)

```bash
npm install          # install JS dependencies
npm run dev          # vite dev server (UI only, no Tauri shell)
npm run tauri dev    # full desktop app in development mode
```

## npm scripts you will actually use

| Script | What it does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` over the whole project — must stay clean |
| `npm test` | vitest suite (repository + utils tests) |
| `npm run check:i18n` | i18n completeness gate — every `t()` key used in code must exist in `src/i18n/fa.json`; exits 1 on any missing key |
| `npm run build` | production build, **TS edition** (SQL runs in the webview via tauri-plugin-sql) |
| `npm run build:rust` | production build, **Rust edition** (SQL runs natively in `ketabyar-core`) |
| `npm run tauri build` | desktop installers for the TS edition |
| `cargo test` (in `src-tauri/core`) | Rust core integration tests |

CI (`ci.yml`) runs the i18n gate → typecheck → tests → builds on every push
and PR; `release.yml` builds both-edition installers on version tags.

## The two data engines — read this before touching data code

All screens talk to the database **exclusively** through
`src/data/repositories/library.ts`, a build-time dispatcher:

- `librarySql.ts` — TypeScript engine: SQL executes in the webview
  (tauri-plugin-sql / SQLite).
- `libraryRust.ts` — Rust engine: every call is a Tauri command served by
  `src-tauri/core` (ketabyar-core, rusqlite), with ts-rs-generated bindings
  under `src/types/generated/`.

Rules that keep the two editions identical:

1. **The compiler is the contract.** The dispatcher types the Rust module as
   `typeof SQL` — if the function surfaces drift, `npm run typecheck` fails.
2. **Behavior must match too.** Both engines are held to the same behavioral
   contract by two mirrored test-suites:
   `src/data/repositories/librarySql.test.ts` (TS engine against Node's
   built-in SQLite) and `src-tauri/core/tests/integration.rs` (Rust engine).
   If you change a business rule (checkout rules, fines, reservations…),
   update **both** engines and **both** test-suites in the same PR.
3. **Never import `localDb` from sections/components** — go through the
   repository layer. `auth.ts`/`schema.ts` are the only sanctioned direct
   users of the shared plugin layer.
4. Each installer must carry exactly one engine. The build-time flag
   `VITE_KETABYAR_BACKEND` (`ts` default | `rust`) is folded by Vite's
   `define` (`__KETABYAR_BACKEND__`) and the unused engine is tree-shaken.
   If your change adds a new repository function, wire it into **both**
   engine modules and register any new Tauri command in
   `src-tauri/src/lib.rs` + `commands.rs`.

## Persian / RTL conventions

- The UI language is Persian (`src/i18n/fa.json`). All user-visible strings
  go through `t()`; **never** hardcode display strings in components.
  Run `npm run check:i18n` before pushing — CI enforces it.
- Persian (`۴۰۲`) and Arabic-Indic (`٤٠٢`) digits typed by users are
  normalized to ASCII via `normalizeDigits()` (`src/utils/isbn.ts`);
  the Rust engine mirrors this in `normalize_digits`. Keep this true for any
  new input field that stores codes/numbers (e.g. member student IDs).
- Layout must remain RTL-safe: use logical properties/`dir`-aware components,
  avoid absolute left/right assumptions.

## Schema changes

The schema lives twice on purpose: `src/data/schema.ts` (TS edition, applied
via plugin-sql at boot) and `src-tauri/core/src/schema.rs` (Rust edition).
They must stay byte-for-byte equivalent in meaning; `scripts/gen_schema_rs.cjs`
helps regenerate the Rust file from the TS source. Every statement must be
idempotent (`IF NOT EXISTS`, `INSERT OR IGNORE`) so first boot and later
boots behave identically. **Never ship seed/demo rows** — a fresh install
must contain zero books, members, or loans.

## Testing guidance

- Repository tests run the real SQL against an in-memory SQLite
  (`node:sqlite`); the plugin-sql adapter is mocked once at the top of
  `librarySql.test.ts`. Add new business-rule tests there and, when the rule
  is engine-shared, mirror them in `integration.rs`.
- Utility functions (ISBN/barcode/phone cleaning, digit normalization) get
  plain unit tests next to their module (`*.test.ts`).
- A change that alters a Persian error message shared across engines should
  update both engines' message in the same commit — tests assert on
  substrings of these messages.

## Commit & PR style

- Conventional commits: `feat(...)`, `fix(...)`, `chore(release): ...`,
  `test(core): ...` — keep the subject in English and imperative.
- One logical change per PR; include test updates for behavior changes.
- Run the full local gate before pushing:
  `npm run check:i18n && npm run typecheck && npm test && npm run build && npm run build:rust`.

## Release process (maintainers)

1. Bump the version everywhere it lives: `package.json`,
   `package-lock.json` (only the two ketabyar entries),
   `src-tauri/tauri.conf.json`, `src-tauri/tauri.rust.conf.json`,
   `src-tauri/Cargo.toml` (and `src-tauri/core/Cargo.toml` when the core
   changed).
2. Add a Keep-a-Changelog entry to `CHANGELOG.md`; update the README
   download link to the new installer name.
3. Commit, tag `vX.Y.Z`, push the commit and the tag. `release.yml` builds
   and attaches `KetabYar_*` (TS) and `KetabYarRust_*` (Rust) installers.
4. Verify the assets on the release page before announcing.

## Security

Found a vulnerability? Please follow `SECURITY.md` — use GitHub's private
vulnerability reporting; do not open public issues for security problems.

## License

By contributing you agree that your contributions are licensed under the
MIT License that covers the repository (see `LICENSE` and `NOTICE.md` for
the historical carve-out).
