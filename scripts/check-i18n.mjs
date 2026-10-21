/** Checks that every literal t("…") key used in src/ exists in fa.json. */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fa = JSON.parse(readFileSync(join(ROOT, "src/i18n/fa.json"), "utf8"));

const flat = {};
(function walk(node, prefix) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) walk(value, path);
    else flat[path] = value;
  }
})(fa, "");

const used = new Set();
function scan(file) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\bt\(\s*"([a-zA-Z0-9_.\-]+)"/g)) used.add(match[1]);
}
(function walkSrc(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSrc(full);
    else if (/\.(tsx?|ts)$/.test(entry) && !entry.endsWith(".test.ts")) scan(full);
  }
})(join(ROOT, "src"));

const missing = [...used].filter((key) => !(key in flat)).sort();
console.log(`used literal keys: ${used.size}, fa.json keys: ${Object.keys(flat).length}`);
if (missing.length > 0) {
  console.error(`MISSING ${missing.length}:\n` + missing.join("\n"));
  process.exit(1);
}
console.log("ALL KEYS PRESENT ✔");
