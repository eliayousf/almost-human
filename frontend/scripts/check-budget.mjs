// Soft gzip budget (warning only) for the critical path: entry JS + adapter chunk + CSS loaded
// before first render. Lazy chunks are listed separately, not counted.
// Usage: node scripts/check-budget.mjs [distDir]   (default: dist)
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const dist = process.argv[2] ?? "dist";
const BUDGET = 100 * 1024;
const assets = join(dist, "assets");
const html = readFileSync(join(dist, "index.html"), "utf8");
const gz = file => gzipSync(readFileSync(join(assets, file)), { level: 9 }).length;
const kb = bytes => (bytes / 1024).toFixed(1).padStart(6);

const files = readdirSync(assets).filter(file => /\.(js|css)$/.test(file));
const critical = files.filter(file => html.includes(file) || /^(live|binding)-/.test(file));
// Chunks statically imported by a critical chunk are critical too.
const source = file => readFileSync(join(assets, file), "utf8");
for (const file of critical) {
  if (!file.endsWith(".js")) continue;
  // Static `from"./x.js"` / `import"./x.js"` only; dynamic import("./x") is lazy.
  for (const [, other] of source(file).matchAll(/(?:from|import)\s*["']\.\/([^"']+)["']/g)) {
    if (files.includes(other) && !critical.includes(other)) critical.push(other);
  }
}
let total = 0;
for (const file of files) {
  const size = gz(file);
  const isCritical = critical.includes(file);
  if (isCritical) total += size;
  console.log(`${isCritical ? "critical" : "lazy    "} ${kb(size)} KB gz  ${file}`);
}
console.log(`critical total ${kb(total)} KB gz (budget ${BUDGET / 1024} KB)`);
// Soft goal: warn, never fail the build.
if (total > BUDGET) console.warn("WARNING: critical path is over the ~100 KB soft goal.");
// END check-budget.mjs
