// Mubit has no public rating API, so this signs in the way the Mubit console
// does: the console login cookie (MUBIT_CONSOLE_COOKIE, the `__client=...`
// cookie of clerk.mubit.ai) mints a short-lived admin token for Mubit's console
// API. That API is undocumented and may change. Off unless
// MUBIT_RATINGS_ENABLED is "true". Secrets never enter logs or the database.
import { v } from "convex/values";
import { env, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

const CLERK = "https://clerk.mubit.ai";
const CONSOLE = "https://app.mubit.ai/mapi";
const MAX_ATTEMPTS = 4;
const RETRY_MS = 20_000;
const TRACE_PAGES = 3;

type Json = Record<string, unknown>;
const record = (value: unknown): Json => value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};

async function adminToken(cookie: string): Promise<string> {
  const headers = { cookie, origin: "https://app.mubit.ai", referer: "https://app.mubit.ai/" };
  const client = await fetch(`${CLERK}/v1/client`, { headers });
  if (!client.ok) throw new Error(`Mubit console login: HTTP ${client.status}`);
  const data = record(record(await client.json()).response);
  const sessions = (Array.isArray(data.sessions) ? data.sessions : []).map(record);
  const session = sessions.find(s => s.id === data.last_active_session_id) ?? sessions[0];
  if (!session) throw new Error("Mubit console login has expired");
  const minted = await fetch(`${CLERK}/v1/client/sessions/${String(session.id)}/tokens`, {
    method: "POST", headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ organization_id: String(session.last_active_organization_id ?? "") }),
  });
  const jwt = record(await minted.json().catch(() => null)).jwt;
  if (!minted.ok || typeof jwt !== "string") throw new Error(`Mubit admin token: HTTP ${minted.status}`);
  return jwt;
}

async function mapi(token: string, path: string, body?: Json): Promise<Json> {
  const response = await fetch(`${CONSOLE}${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Mubit console ${body ? "POST" : "GET"} ${path.split("?")[0]}: HTTP ${response.status}`);
  return record(await response.json().catch(() => null));
}

/** Sends one round's verdicts to Mubit as Good/Bad ratings, and records which
 * model served each call (the provider, or a trained adapter). */
export const rateRound = internalAction({
  args: { roundId: v.id("rounds"), attempt: v.number() }, returns: v.null(),
  handler: async (ctx, { roundId, attempt }) => {
    if (env.MUBIT_RATINGS_ENABLED !== "true" || !env.MUBIT_CONSOLE_COOKIE || !env.MUBIT_PROJECT?.trim()) return null;
    const calls = await ctx.runQuery(internal.ratings.pending, { roundId });
    if (!calls.length) return null;
    const retry = attempt + 1 < MAX_ATTEMPTS;
    try {
      const token = await adminToken(env.MUBIT_CONSOLE_COOKIE);
      // Never pick an arbitrary project from a broad console login.
      const project = env.MUBIT_PROJECT.trim();
      // Find each call's trace by its request ID among the project's newest traces.
      const traces = new Map<string, Json>();
      let cursor = "";
      for (let page = 0; page < TRACE_PAGES && traces.size < calls.length; page++) {
        const list = await mapi(token, `/engine/v2/traces?project=${encodeURIComponent(project)}&limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        for (const trace of (Array.isArray(list.traces) ? list.traces : []).map(record)) {
          const requestId = record(record(trace.routing).relay).request_id;
          if (calls.some(call => call.requestId === requestId)) traces.set(String(requestId), trace);
        }
        cursor = typeof list.next_cursor === "string" ? list.next_cursor : "";
        if (!cursor) break;
      }
      const results = [];
      for (const call of calls) {
        const trace = traces.get(call.requestId);
        if (!trace) { results.push({ id: call.id, status: "not_found" as const }); continue; }
        const routing = record(trace.routing);
        const adapter = record(routing.adapter);
        const servedBy = `${String(routing.served_by ?? "unknown")}${routing.adapter ? `:${String(adapter.version ?? adapter.id ?? "adapter")}` : ""}`;
        // Trace lookup/authentication can take time; honour a withdrawal before each upload.
        const eligible = await ctx.runQuery(internal.ratings.pending, { roundId });
        if (!eligible.some(candidate => candidate.id === call.id)) continue;
        try {
          await mapi(token, `/engine/v2/traces/${encodeURIComponent(String(trace.trace_id))}/feedback`, { rating: call.rating, comment: call.comment });
          results.push({ id: call.id, status: "sent" as const, servedBy });
        } catch (error) {
          console.error("Mubit rating not sent:", error instanceof Error ? error.message : "unknown error");
          results.push({ id: call.id, status: "failed" as const, servedBy });
        }
      }
      const unfinished = results.some(result => result.status !== "sent");
      await ctx.runMutation(internal.ratings.record, { results: unfinished && retry ? results.filter(result => result.status === "sent") : results });
      if (unfinished && retry) await ctx.scheduler.runAfter(RETRY_MS, internal.mubitConsole.rateRound, { roundId, attempt: attempt + 1 });
    } catch (error) {
      console.error("Mubit ratings failed:", error instanceof Error ? error.message : "unknown error");
      if (retry) await ctx.scheduler.runAfter(RETRY_MS, internal.mubitConsole.rateRound, { roundId, attempt: attempt + 1 });
      else await ctx.runMutation(internal.ratings.record, { results: calls.map(call => ({ id: call.id, status: "failed" as const })) });
    }
    return null;
  },
});
