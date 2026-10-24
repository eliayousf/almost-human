import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";
import presence from "@convex-dev/presence/convex.config";
import { v } from "convex/values";
const app = defineApp({ env: {
  MUBIT_API_KEY: v.optional(v.string()),
  MUBIT_BOTS_ENABLED: v.optional(v.string()),
} });
app.use(agent);
app.use(rateLimiter);
app.use(presence);
export default app;
