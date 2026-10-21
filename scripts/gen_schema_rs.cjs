#!/usr/bin/env node
/**
 * Generates src-tauri/core/src/schema.rs from src/data/schema.ts — the TS file
 * stays the single source of truth, so the Rust core can never drift from it.
 * Usage: node scripts/gen_schema_rs.js
 */
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.join(__dirname, "../src/data/schema.ts"), "utf8");

function extractArray(name) {
  const start = src.indexOf(`const ${name}: string[] = [`);
  if (start < 0) throw new Error(`array ${name} not found`);
  const eq = src.indexOf("=", start);
  const open = src.indexOf("[", eq);
  // scan for matching closing bracket
  let depth = 0, end = open;
  let inStr = false, quote = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) inStr = false;
      continue;
    }
    if (ch === "`" || ch === '"' || ch === "'") { inStr = true; quote = ch; continue; }
    if (ch === "[") depth++;
    if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  const body = src.slice(open + 1, end);
  // extract backtick template literals (no ${} interpolation inside DDL)
  const items = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(body)) !== null) items.push(m[1]);
  return items;
}

function rustEscape(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function emit(name, items) {
  return `pub const ${name}: &[&str] = &[\n` +
    items.map((s) => `    "${rustEscape(s)}",`).join("\n") +
    "\n];\n";
}

const TABLES = extractArray("TABLES");
const INDEXES = extractArray("INDEXES");
const VIEWS = extractArray("VIEWS");

const out = `//! KetabYar core — SQLite schema. AUTO-GENERATED from src/data/schema.ts by
//! scripts/gen_schema_rs.js — DO NOT EDIT BY HAND. Regenerate instead.
//! (tables, indexes, read-model views, settings singleton row)

use rusqlite::Connection;

${emit("TABLES", TABLES)}
${emit("INDEXES", INDEXES)}
${emit("VIEWS", VIEWS)}

/// Applies the schema; every statement is idempotent (safe on every boot).
pub fn ensure_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
    for stmt in TABLES {
        conn.execute_batch(stmt)?;
    }
    for stmt in INDEXES {
        conn.execute_batch(stmt)?;
    }
    for stmt in VIEWS {
        conn.execute_batch(stmt)?;
    }
    Ok(())
}
`;

fs.writeFileSync(path.join(__dirname, "../src-tauri/core/src/schema.rs"), out);
console.log(`schema.rs generated: ${TABLES.length} tables, ${INDEXES.length} indexes, ${VIEWS.length} views`);
