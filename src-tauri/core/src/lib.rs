//! ketabyar-core — offline library engine (pure Rust + SQLite).
//!
//! A faithful, function-by-function port of `src/data/repositories/library.ts`
//! plus the native PIN gate (repo::auth, port of `src/data/auth.ts`).
//! SQL statements are byte-identical to the TypeScript edition; rows travel as
//! JSON so the React UI consumes exactly the same shapes from either backend.
//! Dependencies are MIT / Apache-2.0 only (rusqlite, serde, serde_json, ts-rs,
//! uuid, chrono, rand, sha2).

pub mod models;
pub mod repo;
pub mod schema;

pub use rusqlite;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Command error surfaced to the webview — carries the human (Persian) message.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export, export_to = "generated/")]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    pub message: String,
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}
impl std::error::Error for CommandError {}

impl From<rusqlite::Error> for CommandError {
    fn from(e: rusqlite::Error) -> Self {
        CommandError {
            message: e.to_string(),
        }
    }
}
impl From<serde_json::Error> for CommandError {
    fn from(e: serde_json::Error) -> Self {
        CommandError {
            message: e.to_string(),
        }
    }
}

pub type Result<T> = std::result::Result<T, CommandError>;

/// JS `new Date().toISOString()` — millisecond precision, trailing Z.
pub fn now_iso() -> String {
    chrono::Utc::now()
        .format("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

/// RFC4122 v4 UUID (lowercase) — same id space as `crypto.randomUUID()`.
pub fn uid() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// RFC4122 v4 UUID, uppercase, first `n` chars — mirrors the JS
/// `crypto.randomUUID().substring(0, n).toUpperCase()` barcode/accession suffixes.
pub fn uid_prefix_upper(n: usize) -> String {
    uuid::Uuid::new_v4().simple().to_string()[..n].to_uppercase()
}

/// rusqlite::Value from JSON — booleans become 0/1 exactly like the TS driver.
pub fn to_sql_value(v: &serde_json::Value) -> rusqlite::types::Value {
    match v {
        serde_json::Value::Null => rusqlite::types::Value::Null,
        serde_json::Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                rusqlite::types::Value::Integer(i)
            } else {
                rusqlite::types::Value::Real(n.as_f64().unwrap_or(0.0))
            }
        }
        serde_json::Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

/// Runs one INSERT/UPDATE/DELETE/DDL statement, returns affected row count.
pub fn exec(conn: &Connection, sql: &str, params: &[serde_json::Value]) -> Result<usize> {
    let vals: Vec<rusqlite::types::Value> = params.iter().map(to_sql_value).collect();
    Ok(conn.execute(sql, rusqlite::params_from_iter(vals.iter()))?)
}

/// SELECT returning every row as a JSON object (column-name keyed, last wins —
/// identical to the JS sqlite driver's row mapping).
pub fn select(
    conn: &Connection,
    sql: &str,
    params: &[serde_json::Value],
) -> Result<Vec<serde_json::Value>> {
    let mut stmt = conn.prepare(sql)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let vals: Vec<rusqlite::types::Value> = params.iter().map(to_sql_value).collect();
    let mut rows = stmt.query(rusqlite::params_from_iter(vals.iter()))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut obj = serde_json::Map::new();
        for (i, name) in names.iter().enumerate() {
            let v = match row.get_ref(i)? {
                rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                rusqlite::types::ValueRef::Integer(n) => serde_json::Value::Number(n.into()),
                rusqlite::types::ValueRef::Real(f) => serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null),
                rusqlite::types::ValueRef::Text(t) => {
                    serde_json::Value::String(String::from_utf8_lossy(t).into_owned())
                }
                rusqlite::types::ValueRef::Blob(b) => {
                    serde_json::Value::String(String::from_utf8_lossy(b).into_owned())
                }
            };
            obj.insert(name.clone(), v);
        }
        out.push(serde_json::Value::Object(obj));
    }
    Ok(out)
}

/// SELECT expecting zero or one row.
pub fn maybe_one(
    conn: &Connection,
    sql: &str,
    params: &[serde_json::Value],
) -> Result<Option<serde_json::Value>> {
    Ok(select(conn, sql, params)?.into_iter().next())
}

/// Single numeric column from a zero-or-one-row query (COUNT(*)/MAX() helpers).
pub fn scalar_i64(
    conn: &Connection,
    sql: &str,
    params: &[serde_json::Value],
    key: &str,
) -> Result<i64> {
    Ok(maybe_one(conn, sql, params)?
        .and_then(|v| v.get(key).and_then(|x| x.as_i64()))
        .unwrap_or(0))
}

/// SELECT expecting exactly one row (mirrors TS `one()`).
pub fn one(
    conn: &Connection,
    sql: &str,
    params: &[serde_json::Value],
) -> Result<serde_json::Value> {
    match maybe_one(conn, sql, params)? {
        Some(v) => Ok(v),
        None => Err(CommandError {
            message: "Expected a row but none was found.".into(),
        }),
    }
}

/// Coerces a 0/1 INTEGER column into a JSON boolean in-place (member flags, is_read…).
pub fn coerce_bool(row: &mut serde_json::Value, key: &str) {
    if let Some(obj) = row.as_object_mut() {
        if let Some(v) = obj.get(key) {
            let b = match v {
                serde_json::Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
                serde_json::Value::Bool(b) => *b,
                _ => false,
            };
            obj.insert(key.to_string(), serde_json::Value::Bool(b));
        }
    }
}

/// Opens a connection with the same pragmas the app relies on (FK enforcement
/// like Postgres semantics, WAL for safe multi-connection use with plugin-sql).
pub fn open(path: &std::path::Path) -> Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
    )?;
    Ok(conn)
}

/// Opens an in-memory database with the full schema applied (tests / tooling).
pub fn open_memory_with_schema() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    schema::ensure_schema(&conn)?;
    Ok(conn)
}
