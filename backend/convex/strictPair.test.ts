/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import presenceTest from "@convex-dev/presence/test";
import schema from "./schema";
import { api } from "./_generated/api";
import { BOT_FALLBACK_WAIT_MS, LOBBY_ACCUMULATE_WAIT_MS } from "./botlogic";
import type { ApiResult } from "../../shared/game-contract";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const command = () => ({ clientRequestId: crypto.randomUUID() });
function must<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}: ${result.error.message}`);
  return result.data;
}
function init() {
  const t = convexTest(schema, modules);
  agentTest.register(t); rateLimiterTest.register(t); presenceTest.register(t);
  return t;
}
type Backend = ReturnType<typeof init>;
async function player(t: Backend) {
  const userId = await t.run(ctx => ctx.db.insert("users", { isAnonymous: true }));
  const client = t.withIdentity({ subject: `${userId}|test-session` });
  must(await client.mutation(api.game.createSession, { input: { ...command(), adultConfirmed: true, rulesAccepted: true, policyVersion: "playtest-v1", trainingOptIn: false } }));
  return client;
}
const strictJoin = (person: Awaited<ReturnType<typeof player>>) =>
  person.mutation(api.game.joinQueue, { input: { ...command(), strictPair: true } }).then(must);
type QueueView = { status: "waiting" } | { status: "assigned"; roundId: Id<"rounds"> } | { status: string };
function assignedRoundId(queue: QueueView): Id<"rounds"> {
  if (queue.status !== "assigned") throw new Error(`Expected assigned, got ${queue.status}`);
  return (queue as { status: "assigned"; roundId: Id<"rounds"> }).roundId;
}
const membersOf = (t: Backend, roundId: Id<"rounds">) =>
  t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).collect());

describe("strictPair opt-in 1v1", () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    vi.stubEnv("MUBIT_API_KEY", "mbt_synthetic_test_key"); vi.stubEnv("MUBIT_BOTS_ENABLED", "true");
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  test("a lone strict human waits one accumulate window, then seats with exactly one bot", async () => {
    const t = init();
    const person = await player(t);
    const ticket = await strictJoin(person);
    // Not seated inside the grace window.
    const before = must(await person.query(api.game.getQueue, { queueId: ticket.queueId }));
    expect(before.status).toBe("waiting");
    await vi.advanceTimersByTimeAsync(LOBBY_ACCUMULATE_WAIT_MS + 1000);
    await t.finishInProgressScheduledFunctions();
    const queue = must(await person.query(api.game.getQueue, { queueId: ticket.queueId }));
    const members = await membersOf(t, assignedRoundId(queue));
    expect(members).toHaveLength(2);
    expect(members.filter(m => m.kind === "human")).toHaveLength(1);
    expect(members.filter(m => m.kind === "ai")).toHaveLength(1);
  });

  test("two strict humans joining inside the window pair together with no bot", async () => {
    const t = init();
    const a = await player(t); const b = await player(t);
    const ta = await strictJoin(a);
    const tb = await strictJoin(b);
    await t.finishInProgressScheduledFunctions();
    const qa = must(await a.query(api.game.getQueue, { queueId: ta.queueId }));
    const qb = must(await b.query(api.game.getQueue, { queueId: tb.queueId }));
    const ra = assignedRoundId(qa); const rb = assignedRoundId(qb);
    expect(ra).toBe(rb);
    const members = await membersOf(t, ra);
    expect(members).toHaveLength(2);
    expect(members.every(m => m.kind === "human")).toBe(true);
  });

  test("strict and default tickets never mix; default lobby rules are unchanged", async () => {
    const t = init();
    const strictPerson = await player(t);
    const normalA = await player(t); const normalB = await player(t);
    const ts = await strictJoin(strictPerson);
    const ta = await normalA.mutation(api.game.joinQueue, { input: command() }).then(must);
    const tb = await normalB.mutation(api.game.joinQueue, { input: command() }).then(must);
    await vi.advanceTimersByTimeAsync(LOBBY_ACCUMULATE_WAIT_MS + 1000);
    await t.finishInProgressScheduledFunctions();
    // Strict human got the two-seat bot room; normals still wait honestly.
    const qs = must(await strictPerson.query(api.game.getQueue, { queueId: ts.queueId }));
    const strictRound = assignedRoundId(qs);
    const strictMembers = await membersOf(t, strictRound);
    expect(strictMembers).toHaveLength(2);
    expect(strictMembers.filter(m => m.kind === "ai")).toHaveLength(1);
    let qa = must(await normalA.query(api.game.getQueue, { queueId: ta.queueId }));
    expect(qa.status).toBe("waiting");
    // Normals ride out the honest wait, then match under the default rules.
    await vi.advanceTimersByTimeAsync(BOT_FALLBACK_WAIT_MS - LOBBY_ACCUMULATE_WAIT_MS - 3000);
    for (const [i, person] of [normalA, normalB].entries()) must(await person.mutation(api.game.heartbeat, { sessionId: `heartbeat-normal-${i}` }));
    await vi.advanceTimersByTimeAsync(3000);
    await t.finishInProgressScheduledFunctions();
    qa = must(await normalA.query(api.game.getQueue, { queueId: ta.queueId }));
    const qb = must(await normalB.query(api.game.getQueue, { queueId: tb.queueId }));
    const na = assignedRoundId(qa); const nb = assignedRoundId(qb);
    expect(na).toBe(nb);
    expect(na).not.toBe(strictRound);
    const normalMembers = await membersOf(t, na);
    expect(normalMembers.filter(m => m.kind === "human")).toHaveLength(2);
    expect(normalMembers.length).toBeGreaterThanOrEqual(2);
    expect(normalMembers.length).toBeLessThanOrEqual(4);
  });

  test("an unflagged join stores no strictPair on the ticket", async () => {
    const t = init();
    const person = await player(t);
    const ticket = await person.mutation(api.game.joinQueue, { input: command() }).then(must);
    const row = await t.run(ctx => ctx.db.get(ticket.queueId));
    expect(row).not.toBeNull();
    expect((row as { strictPair?: boolean }).strictPair).toBeUndefined();
  });
});
