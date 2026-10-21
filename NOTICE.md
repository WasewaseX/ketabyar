# NOTICE — KetabYar provenance and licensing

**KetabYar** is original software, released under the MIT License (see `LICENSE`).
Copyright © 2026 KetabYar contributors.

## Version history and code provenance

KetabYar began in 2025 as a fork of **Warraq** by MANAA Mohaned
(https://github.com/mohaneddz/Warraq), licensed under the PolyForm Noncommercial
License 1.0.0.

- **Versions 1.0.0 – 1.0.2 and 1.1.0** contained frontend code and assets
  derived from Warraq and therefore remained under the PolyForm Noncommercial
  1.0.0 license. Those versions must not be used commercially.
- **Version 1.0.3** is a complete clean-room rewrite: the entire application
  layer (React UI, design system, i18n dictionary, data services, Tauri/Rust
  shell) was written from scratch against a functional specification. No code
  from Warraq remains in this repository — neither in the source tree nor in
  the packaged releases from this version onward. Original Warraq artwork,
  screenshots and residual configuration were removed as well.
- Functionality ideas are not copyrightable; what this project takes from its
  history is the *product concept* (an offline, Persian, RTL library system),
  not the upstream expression.

From version 1.0.3 (including 1.1.1 and every later release), commercial use,
sale, and derivative work of **KetabYar** are permitted under the MIT License.
This does not retroactively relicense the old Warraq-derived releases
(≤ 1.0.2 and 1.1.0), which remain available only for noncommercial use.

## Fonts

- **Vazirmatn** — © The Vazirmatn Project Authors, SIL Open Font License 1.1
  (vendored in `src/assets/fonts/` together with `Vazirmatn-OFL.txt`).
- **IBM Plex Sans Arabic** and **Manrope** — SIL Open Font License 1.1, served
  via the @fontsource npm packages.

Fonts are embedded via their npm distributions; the OFL permits bundling,
redistribution and commercial use.

## Third-party packages

All runtime and build dependencies are distributed under permissive licenses
(MIT, Apache-2.0, ISC, BSD). See `THIRD-PARTY-NOTICES.md` for the inventory.

## ketabyar-core (Rust edition engine)

The `src-tauri/core` crate — the native Rust data engine used by the Rust
edition — is original KetabYar code (MIT), written as a function-by-function
port of this project's **own** TypeScript data services so both editions stay
behaviourally identical. Its dependencies (rusqlite, serde, ts-rs, uuid,
chrono, rand) are MIT / Apache-2.0.
