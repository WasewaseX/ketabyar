# Changelog — KetabYar

All notable changes to **KetabYar** are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres
to [Semantic Versioning](https://semver.org/).

> Provenance note: versions 1.0.0 – 1.0.2 and 1.1.0 were derived from the Warraq
> project and were licensed **PolyForm Noncommercial 1.0.0**. From 1.0.3 onward
> KetabYar is a clean-room rewrite licensed under **MIT**. See
> [NOTICE.md](NOTICE.md) for the full history.

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
