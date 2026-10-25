import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const cast = JSON.parse(readFileSync(path.join(root, "src/assets/cast.json"), "utf8")) as Array<Record<"idle" | "talk" | "smile" | "poster", string>>;
const media = cast.flatMap(entry => [entry.idle, entry.talk, entry.smile, entry.poster]);
const mediaReady = media.length > 0 && media.every(file => {
  const target = path.join(root, "public/cast", file);
  return existsSync(target) && statSync(target).size > 0;
});

// Shared-client wiring per CASH_HANDOFF.md section 3. `--mode fixtures` builds
// the synthetic mock adapter; `--mode live` builds the real Convex adapter.
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, root, "VITE_"), ...process.env };
  if (command === "build" && mode === "live") {
    if (!env.VITE_CONVEX_URL) throw new Error("Live builds require the public VITE_CONVEX_URL.");
    const url = new URL(env.VITE_CONVEX_URL);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error("VITE_CONVEX_URL must be an HTTPS backend URL without credentials or query parameters.");
    }
  }
  if (!mediaReady) console.info("Cast media is incomplete; this build uses neutral portraits.");
  return {
  plugins: [react()],
  define: { __CAST_MEDIA_READY__: JSON.stringify(mediaReady) },
  resolve: {
    alias: { "@game": fileURLToPath(new URL("../shared", import.meta.url)) },
    dedupe: ["react", "react-dom", "convex", "@convex-dev/auth"],
  },
  server: {
    fs: { allow: [
      fileURLToPath(new URL(".", import.meta.url)),
      fileURLToPath(new URL("../shared", import.meta.url)),
      fileURLToPath(new URL("../backend/client", import.meta.url)),
    ] },
  },
  build: {
    target: "safari16.4",
    // Fonts and small portraits stay as separate cacheable files, never inlined.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
  };
});
