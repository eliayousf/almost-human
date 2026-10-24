import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts", "client/**/*.test.ts"],
    server: { deps: { inline: ["@convex-dev/agent", "@convex-dev/rate-limiter", "@convex-dev/presence", "@convex-dev/batch-worker"] } },
  },
});
