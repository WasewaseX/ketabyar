# Changelog — KetabYar

All notable changes to **KetabYar** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/).

> Provenance note: versions 1.0.0 – 1.0.2 and 1.1.0 were derived from the Warraq
> project and were licensed **PolyForm Noncommercial 1.0.0**. From 1.0.3 onward
> KetabYar is a clean-room rewrite licensed under **MIT**. See
> [NOTICE.md](NOTICE.md) for the full history.

## [1.2.3] — 2026-10-23

### Fixed
- **THE login deadlock — "nothing happens after typing the pin" — root-caused
  and fixed.** Reported since 1.1.1, survived four releases because previous
  fixes addressed symptoms (keyboard handlers, keypads) while the real bug sat
  one level above the login form: `Boot` in `App.tsx` read the session with
  `useAuthStore.getState().user` inside its render body — a **non-reactive,
  one-shot read**. `Boot` rendered the login page once and was never told that
  `setUser()` had fired after a successful login, so the app stayed on the
  login screen forever: PIN accepted, session stored, zero navigation, on
  every machine, both editions. The gate now uses a reactive
  `useAuthStore((state) => state.user)` subscription placed **above every
  conditional return** (Rules of Hooks), so the moment login succeeds the
  router mounts. Logout now returns to the login screen by the same
  mechanism.
- A failed `library_settings` load can no longer mask a successful login
  (it used to throw inside the login `try`, clearing the PIN and showing an
  error even though the session had been created) — the load is now
  non-fatal at both call sites; the settings store carries defaults.

### Added
- **`appGate.test.tsx` — the first UI-level regression tests**, mounting the
  real `App` (Providers + Boot + gate + LoginPage) in jsdom with the data
  layer mocked at the dispatcher boundary: boot → type 6-7-6-7 → the app
  must reach Onboarding; wrong PIN → error shown, stays on login; settings
  failure → login still succeeds; boot with no session → login screen. The
  hook-order mistake made while implementing the fix was caught by these
  very tests before release (Boot crashed into the Failure screen) — they
  exist to keep that class of bug out for good. 39 vitest tests total.

## [1.2.2] — 2026-10-22

### Changed
- **The Rust edition's webview is now 100% SQL-free.** Until now the
  `KetabYarRust_*` installers still ran two pieces through the webview SQL
  plugin: the PIN gate (`auth.ts` — hashing/verification via WebCrypto) and
  the schema bootstrap DDL (`schema.ts`). Both moved behind the build-time
  dispatcher pattern used by the repository layer:
  - **Native auth** — new `ketabyar-core` module `repo::auth` (exact port of
    the TS gate: salted SHA-256 in `library_settings`, identical Persian
    error strings, constant-time hash comparison) behind four Tauri commands
    (`pin_has`, `pin_set`, `pin_check`, `pin_bootstrap`). The hash scheme is
    byte-identical, so a database written by either edition validates in the
    other. The webview keeps only the localStorage session flag.
  - **Native schema** — the Rust frontend's `ensureSchema` is now a no-op;
    `ketabyar-core` already applies the byte-identical DDL natively when the
    Tauri setup hook opens the database, before any webview code runs.
- `auth.ts` and `schema.ts` became build-time dispatchers (`authSql.ts` /
  `authRust.ts`, `schemaSql.ts` / `schemaRust.ts`) mirroring
  `repositories/library.ts`; the `impl: typeof SQL` compiler contract now
  also covers authentication. The TypeScript edition's behaviour is
  unchanged.
- Verified on both production bundles: the Rust bundle contains **zero** SQL
  strings (no `INSERT INTO`, no DDL, no `sqlite:` connection string) and no
  WebCrypto PIN hashing, while the TS bundle keeps them and contains none of
  the native commands.

### Added
- Rust unit tests for the full PIN lifecycle (bootstrap idempotence,
  validation rejections, round-trip against the TS hash scheme, empty-state
  verification) mirroring the TS-side auth surface contract test (35 vitest
  tests total).

## [1.2.1] — 2026-10-22

### Added
- **Behavioural test-suite for the TypeScript engine** (`librarySql.test.ts`):
  the real repository code runs against an in-memory SQLite (Node's built-in
  `node:sqlite`) with `tauri-plugin-sql` mocked at the boundary — the exact
  SQL the `KetabYar_*` installers execute. 19 tests mirror the Rust core's
  integration suite so both editions are held to the same contract, including
  a new **engine-contract test** asserting the Rust adapter exports the exact
  same API surface as the SQL module and that the dispatcher folds to a
  single engine per build. `vitest.config.ts` now defines
  `__KETABYAR_BACKEND__` exactly like the production build.
- **CONTRIBUTING.md** — development setup, the two-engine rules (compiler
  contract + mirrored test-suites), Persian/RTL and i18n conventions, schema
  parity, testing guidance, release process.

### Fixed
- **Saving a book with an author crashed the TypeScript edition**
  (`NOT NULL constraint failed: authors.normalized_name`). The author
  upsert omitted the required `normalized_name` column that the Rust engine
  fills; both engines now behave identically.
- **Fulfilling a ready hold crashed the TypeScript edition** ("این نسخه
  اکنون قابل امانت نیست"): the held copy sits in `reserved` status and the
  TS `fulfilReservation` never re-freed it before checkout — the Rust engine
  has carried this fix since upstream migration 0020. TS now matches.
- **Visitors could take books home in the TypeScript edition.** The Rust
  engine refuses external (take-home) loans for `visitor` members; the TS
  engine silently allowed them. The gate is now enforced in both editions
  with the same Persian message.
- **Over-limit external checkouts could partially succeed in the TypeScript
  edition.** Rust rejects a whole batch that would exceed the loan limit
  before issuing anything (all-or-nothing); TS issued copies one by one and
  failed mid-batch, leaving a partial checkout. TS now performs the same
  up-front batch check with the same error message.

## [1.2.0] — 2026-10-22

### Added
- **Members are now registered by their student ID (کد دانشجویی).** The
  registration form no longer pre-fills a random membership number — the
  librarian types the university-issued code, which becomes the member's
  unique identifier across search, loans, holds, ID cards and reports.
  Codes are validated (3–24 characters) and shown exactly as stored.

### Fixed
- **Each installer now ships exactly one data engine.** The repository
  dispatcher selected its engine through a runtime ternary over
  `import.meta.env.VITE_KETABYAR_BACKEND`, which bundlers cannot
  constant-fold — so **every installer of every previous version carried
  BOTH engines** (the TypeScript SQL layer and the Rust command adapter),
  and the two editions were nearly the same size. The switch is now a
  build-time `define` literal (`__KETABYAR_BACKEND__`) that the bundler
  folds: the TypeScript bundle contains zero `ketabyar-core` command calls,
  the Rust bundle contains zero repository SQL, and the active engine is
  still displayed in Settings → About. (This also settles the "why is the
  Rust edition the same size?" question: the shared shell — Tauri runtime,
  WebView2 loader, UI assets, icons — dominates the installer size; the
  engines themselves differ by only ~26 KB of JavaScript.)
- **Persian-keyboard digits are now first-class in student IDs and member
  search.** Typing ۴۰۲۱۲۳۴۵ previously stored locale-specific digits that
  never matched a later ASCII search (or vice versa). Both engines now
  normalise Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII at input,
  at save time, and inside member search — in the TypeScript repository and
  in `ketabyar-core` alike, with unit and integration tests on each side.
- **The Rust edition no longer silently renumbers duplicate student IDs.**
  `save_member` retried any `member_number` UNIQUE violation with a random
  number, so registering an already-taken student ID could quietly save the
  member under a wrong code. An explicit duplicate now fails with a clear
  error (random retry remains only for auto-generated visitor codes).
- **Editing a member's student ID works in the Rust edition.** The native
  `update_member` silently ignored `member_number` changes (the TypeScript
  edition applied them); the patch now includes the cleaned, uniqueness-
  checked code, so both editions behave identically.
- Member ID cards, lists and loan details display the raw stored code —
  the cosmetic «MB-» prefix is gone since codes are now meaningful IDs.

### Changed
- Visitor quick-registration from the Reservations wizard keeps its
  operator-free «VIS-» auto code; students and staff are registered by
  their typed ID. Persian i18n strings (form label, search placeholder,
  copy toasts, duplicate alerts) updated from «شمارهٔ عضویت» to
  «کد دانشجویی».

## [1.1.2] — 2026-10-21

### Fixed
- **The Rust edition now actually runs the Rust engine.** A packaging bug in
  `build:rust` (`cross-env VITE_KETABYAR_BACKEND=rust tsc && vite build`)
  passed the backend flag to the TypeScript compiler only — the Vite build
  ran without it, so every "KetabYarRust" installer published in **1.0.3 and
  1.1.1 silently contained the TypeScript engine** with a different product
  name (the two installers differed by ~300 bytes). The flag now propagates
  to the frontend build; the shipped Rust bundle contains the native
  `ketabyar-core` commands and tree-shakes the webview SQL engine. Verified
  by marker inspection of both production bundles.
- **Login could appear dead on physical keyboards.** The PIN field is
  visually hidden and was never auto-focused, so typing ۶۷۶۷ before clicking
  the page did nothing. The login screen now focuses the field on mount and
  handles digits/Backspace/Enter at window level, with Persian (۶) and
  Arabic-Indic (٦) digit layouts normalised to ASCII. On-screen keypad
  behaviour is unchanged.

### Changed
- Reports aggregates (9 GROUP BY queries) and the "clear loans" action moved
  from ad-hoc SQL into the repository layer (`reportBreakdowns`,
  `clearCirculation`) so both editions execute them through their own engine;
  two new `ketabyar-core` commands back the Rust edition. Sections no longer
  import the SQL layer directly.
- Settings → About now shows the active **data engine** (TypeScript webview
  SQL vs native ketabyar-core), so the edition is verifiable in-app.

> ⚠️ Correction to earlier entries: the "Rust Edition" installers attached to
> 1.0.3 and 1.1.1 ran the TypeScript engine due to the packaging bug above.
> Their *binaries* registered the native commands, but the bundled frontend
> never called them. From 1.1.2 the Rust edition is genuinely native.

## [1.1.1] — 2026-10-21

### Changed
- Version number moved above the legacy **1.1.0** release so every user —
  including those who installed 1.1.0 — sees a proper forward upgrade path in
  Windows «Apps & features». 1.1.1 contains exactly the clean-room 1.0.3
  codebase plus project governance files.
- Added `CHANGELOG.md` (this file) and `SECURITY.md` (private vulnerability
  reporting policy).
- README now carries CI / release / license badges and points to the 1.1.1
  installers.

### Fixed
- `NOTICE.md` wording made airtight: the noncommercial carve-out now explicitly
  names **1.1.0** alongside ≤ 1.0.2, avoiding any ambiguity caused by 1.1.0
  shipping with a higher number but an older codebase.

## [1.0.3] — 2026-10-21

### Added
- **Clean-room rewrite of the entire application layer**, released under MIT:
  React UI (13 sections), original design system (ivory/ink/copper + 6 accent
  themes, light/dark, RTL), single-source Persian dictionary (843 keys checked
  by a CI script), original inline-SVG artwork and logo.
- **Two interchangeable data engines behind one identical 52-function API**:
  - *TS Edition* — SQL in the webview via `tauri-plugin-sql`
    (`KetabYar_*-setup.exe` / `.msi`).
  - *Rust Edition* — native **`ketabyar-core`** engine (rusqlite) behind Tauri
    commands with ts-rs generated bindings (`KetabYarRust_*-setup.exe`).
    A build-time `typeof SQL` compiler contract keeps the two adapters
    structurally identical.
- Real ISBN-13/ISBN-10 checksum validation with hyphenation and bidirectional
  conversion (replacing format-only checking).
- Synthetic notification alerting engine (overdue / due-soon / ready) with a
  persistent seen-marker store.
- Grace-aware fine charging (daily rate, grace period, cap, one charge per
  loan) and automatic reservation-queue promotion on copy return.
- Full backup / restore across all 15 tables with conflict-safe upserts, and a
  double-confirmed factory reset.
- Persian PDF report export (embedded Vazirmatn, Jalali dates), CSV/ZIP report
  bundles, membership cards, loan receipts, shelf-inspection scan sessions.

### Removed
- Every Warraq-derived file, asset, font module, translation and screenshot;
  Supabase machinery and the unused upstream Rust commands.

### Security
- Tauri capability set minimised to what the app actually uses; CSP restricted
  to the two optional catalog services (Google Books, Open Library) and the
  optional Groq enrichment endpoint.

## [1.1.0] — 2026-10-21 (⚠ noncommercial era)

> Internal Rust-edition preview released **before** the clean-room rewrite.
> Its code predates 1.0.3 and remains under PolyForm Noncommercial 1.0.0 —
> do not use commercially. Superseded by 1.1.1.

## [1.0.2] — 2026-10-20 (noncommercial era)

### Changed
- Library now boots **empty** — all demo data removed; default PIN changed to
  **6767**; full KetabYar branding pass.

## [1.0.1] — 2026-10-20 (noncommercial era)

### Fixed
- Boot failure on fresh installs: `plugin:sql|execute` was not allowed by the
  Tauri ACL, so schema creation was rejected.

## [1.0.0] — 2026-10-20 (noncommercial era)

- Initial public release (Warraq-derived, PolyForm Noncommercial 1.0.0).
