import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Shared-client wiring per CASH_HANDOFF.md section 3. `--mode fixtures` builds
// the synthetic mock adapter; `--mode live` builds the real Convex adapter.
export default defineConfig({
  plugins: [react()],
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
});
