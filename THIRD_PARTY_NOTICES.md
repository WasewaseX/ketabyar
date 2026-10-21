# Third-Party Notices

KetabYar gratefully builds on open-source software. All engine dependencies are
permissively licensed (MIT / Apache-2.0).

## KetabYar Rust engine (src-tauri/core)

| Crate | License | Use |
|---|---|---|
| [rusqlite](https://github.com/rusqlite/rusqlite) (+ bundled SQLite, public domain) | MIT | Native SQL engine |
| [ts-rs](https://github.com/Aleph-Alpha/ts-rs) | MIT / Apache-2.0 | TypeScript binding generation |
| [serde](https://github.com/serde-rs/serde) / serde_json | MIT / Apache-2.0 | Serialization |
| [uuid](https://github.com/uuid-rs/uuid) | MIT / Apache-2.0 | Record IDs |
| [chrono](https://github.com/chronotope/chrono) | MIT / Apache-2.0 | ISO timestamps / date math |
| [rand](https://github.com/rust-random/rand) | MIT / Apache-2.0 | Member numbers, tag colors |

## Frontend

| Package | License |
|---|---|
| React | MIT |
| Tauri / @tauri-apps/api / plugin-sql | MIT / Apache-2.0 |
| Vite | MIT |
| Tailwind CSS | MIT |
| TanStack Query | MIT |
| Recharts | MIT |
| lucide-react (icons) | ISC |
| i18next / react-i18next | MIT |
| Zustand | MIT |
| PapaParse | MIT |
| date-fns | MIT |
| cross-env | MIT |
| [Vazirmatn font](https://github.com/rastikerdar/vazirmatn) | SIL OFL 1.1 |

## Upstream base

KetabYar is built on the open-source [Warraq](https://github.com/mohaneddz/Warraq)
project (© Warraq Contributors, PolyForm Noncommercial License 1.0.0) with
substantial additional modifications, including a fully original Rust data
engine (ketabyar-core), an original local-auth design, and an original SQLite
schema port. See LICENSE for details.

The MIT, ISC, and Apache-2.0 licenses require preservation of their copyright
and permission notices, which are retained in the respective packages under
node_modules / Cargo registry metadata and in the distributed build.
