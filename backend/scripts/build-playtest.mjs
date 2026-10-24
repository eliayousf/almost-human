import { build } from "esbuild";
import { mkdir, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let deploymentUrl = process.env.CONVEX_URL;
if (!deploymentUrl) {
  const env = await readFile(path.join(backend, ".env.local"), "utf8").catch(() => "");
  const value = env.match(/^\s*CONVEX_URL\s*=\s*(.*?)\s*$/m)?.[1];
  deploymentUrl = value?.replace(/^(["'])(.*)\1$/, "$2");
}
if (!deploymentUrl) throw new Error("Set CONVEX_URL in backend/.env.local before building the playtest.");
const parsed = new URL(deploymentUrl);
if (!(parsed.protocol === "https:" || (parsed.protocol === "http:" && ["127.0.0.1", "localhost"].includes(parsed.hostname)))) {
  throw new Error("CONVEX_URL must be an HTTPS deployment URL or an HTTP loopback development URL.");
}
if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error("CONVEX_URL must not contain credentials or query parameters.");

const outdir = path.join(backend, "build");
await mkdir(outdir, { recursive: true });
await build({
  entryPoints: [path.join(backend, "playtest/main.ts")],
  outfile: path.join(outdir, "app.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2022"],
  nodePaths: [path.join(backend, "node_modules")],
  define: { __CONVEX_URL__: JSON.stringify(deploymentUrl) },
  sourcemap: false,
  logLevel: "warning",
});
await copyFile(path.join(backend, "playtest/index.html"), path.join(outdir, "index.html"));
await build({
  entryPoints: [path.join(backend, "playtest/react-main.tsx")],
  outfile: path.join(outdir, "react-app.js"), bundle: true, format: "esm", platform: "browser",
  target: ["es2022"], jsx: "automatic", nodePaths: [path.join(backend, "node_modules")],
  define: { __CONVEX_URL__: JSON.stringify(deploymentUrl), "process.env.NODE_ENV": '"development"' },
  sourcemap: false, logLevel: "warning",
});
await copyFile(path.join(backend, "playtest/react.html"), path.join(outdir, "react.html"));
console.log("Built backend/build. Only the public Convex deployment URL is included in the bundle.");
