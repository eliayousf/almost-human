/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import presenceTest from "@convex-dev/presence/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { ApiResult } from "../../shared/game-contract";
import { createMubitModel } from "./mubitModel";

const modules = import.meta.glob("./**/*.ts");
const command = () => ({ clientRequestId: crypto.randomUUID() });
function must<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
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
async function room(humans: 1 | 2 | 3) {
  const t = init();
  vi.spyOn(Math, "random").mockReturnValue((humans - 1) / 3 + 0.01);
  const people: Awaited<ReturnType<typeof player>>[] = [];
  const tickets = [];
  for (let i = 0; i < humans; i++) {
    const person = await player(t); people.push(person);
    tickets.push(must(await person.mutation(api.game.joinQueue, { input: command() })));
  }
  const ticket = must(await people[0].query(api.game.getQueue, { queueId: tickets[0].queueId }));
  if (ticket.status !== "assigned") throw new Error("Not matched");
  const roundId = ticket.roundId;
  const get = (index = 0) => people[index].query(api.game.getRound, { roundId }).then(must);
  return { t, people, roundId, get };
}
async function chat(r: Awaited<ReturnType<typeof room>>) {
  const round = await r.t.run(ctx => ctx.db.get(r.roundId));
  vi.setSystemTime(round!.chatStartsAt);
  await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
}
function noPrivateFields(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(["kind", "role", "botCount", "humanTarget", "threadId", "model", "provider", "persona", "botTurn", "botPending", "playerId"]).not.toContain(key);
    noPrivateFields(nested);
  }
}
function completion(text = "Moon shop idea: emergency cheese.") {
  return new Response(JSON.stringify({
    model: "gpt-6-luna", choices: [{ message: { role: "assistant", content: text }, finish_reason: "stop" }],
    usage: { prompt_tokens: 60, completion_tokens: 15 },
  }), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  vi.stubEnv("MUBIT_API_KEY", "mbt_synthetic_test_key"); vi.stubEnv("MUBIT_BOTS_ENABLED", "true");
  vi.stubGlobal("fetch", vi.fn(async () => completion()));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("randomized three-seat rooms", () => {
  test.each([1, 2, 3] as const)("matches %i humans with the remaining bot seats and hides composition", async humans => {
    const r = await room(humans);
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).take(3));
    expect(members).toHaveLength(3);
    expect(members.filter(m => m.kind === "ai")).toHaveLength(3 - humans);
    expect(await r.t.run(ctx => ctx.db.query("players").take(10))).toHaveLength(humans);
    expect(new Set(members.map(m => m.alias)).size).toBe(3);
    noPrivateFields(await r.get());
    await chat(r); noPrivateFields(await r.get());
  });

  test("does not reroll a waiting room on repeated queue commands", async () => {
    const t = init(); const person = await player(t);
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const first = must(await person.mutation(api.game.joinQueue, { input: command() }));
    vi.mocked(Math.random).mockReturnValue(0.01);
    const retry = must(await person.mutation(api.game.joinQueue, { input: command() }));
    expect(retry).toEqual(first);
    expect(await t.run(ctx => ctx.db.query("rounds").take(2))).toHaveLength(0);
    expect((await t.run(ctx => ctx.db.get(first.queueId)))?.humanTarget).toBe(3);
  });

  test("later solo draws do not starve the oldest three-human room", async () => {
    const t = init(); const a = await player(t); const b = await player(t); const c = await player(t);
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const first = must(await a.mutation(api.game.joinQueue, { input: command() }));
    vi.mocked(Math.random).mockReturnValue(0.01);
    const second = must(await b.mutation(api.game.joinQueue, { input: command() }));
    expect(second.status).toBe("waiting");
    expect(await t.run(ctx => ctx.db.query("rounds").take(2))).toHaveLength(0);
    must(await c.mutation(api.game.joinQueue, { input: command() }));
    const assigned = must(await a.query(api.game.getQueue, { queueId: first.queueId }));
    expect(assigned.status).toBe("assigned");
    const members = await t.run(ctx => ctx.db.query("members").take(3));
    expect(members.every(member => member.kind === "human")).toBe(true);
  });
});

describe("Mubit turns and lifecycle", () => {
  test("uses Mubit with room context, alternates bot seats, and reserves each turn once", async () => {
    const r = await room(1); await chat(r);
    must(await r.people[0].mutation(api.game.sendMessage, { roundId: r.roundId, input: { ...command(), text: "A shop selling moon cheese." } }));
    await Promise.all([0, 0].map(turn => r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn })));
    expect(fetch).toHaveBeenCalledTimes(1);
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 1 });
    expect(fetch).toHaveBeenCalledTimes(2);
    const value = await r.get(); if (value.phase !== "chat") throw new Error("Expected chat");
    expect(value.messages).toHaveLength(3);
    expect(value.messages[1].senderId).not.toBe(value.messages[2].senderId);
    expect(value.messages[1].senderId).not.toBe(value.selfId);
    noPrivateFields(value);
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe("https://api.mubit.ai/openai/v1/chat/completions");
    expect((options?.headers as Record<string, string>).authorization).toBe("Bearer mbt_synthetic_test_key");
    const body = JSON.parse(options?.body as string);
    expect(body.model).toBe("gpt-6-luna");
    expect(body.messages.at(-1).content).toContain("A shop selling moon cheese.");
    expect(body.max_completion_tokens).toBeLessThanOrEqual(384);
  });

  test("the real scheduled bot callback runs after the countdown and continues without bot heartbeats", async () => {
    const r = await room(1);
    await vi.advanceTimersByTimeAsync(7500); await r.t.finishInProgressScheduledFunctions();
    const value = await r.get(); if (value.phase !== "chat") throw new Error("Expected chat");
    expect(value.messages.some(message => message.senderId !== value.selfId)).toBe(true);
    must(await r.people[0].mutation(api.game.heartbeat, { sessionId: "test-heartbeat-session" }));
    await r.t.mutation(internal.connections.checkRound, { roundId: r.roundId });
    expect((await r.get()).phase).toBe("chat");
  });

  test("failed or blocked generations cancel without publishing an unsafe reply or fabricated success", async () => {
    const r = await room(1); await chat(r);
    vi.mocked(fetch).mockResolvedValueOnce(completion("Email me at test@example.com"));
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    expect(await r.get()).toMatchObject({ phase: "cancelled", reason: "service_unavailable" });
    expect(must(await r.people[0].query(api.game.getSession, {})).totalGuessingPoints).toBe(0);
    expect((await r.t.run(ctx => ctx.db.get(r.roundId)))?.messageCount).toBe(0);
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("provider errors are not retried or exposed to the room", async () => {
    const r = await room(2); await chat(r);
    vi.mocked(fetch).mockResolvedValueOnce(new Response("secret provider error body", { status: 503 }));
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await r.get()).toMatchObject({ phase: "cancelled", reason: "service_unavailable" });
    expect(JSON.stringify(await r.get())).not.toContain("secret provider");
  });

  test("a timed-out provider call cancels the room without retrying", async () => {
    const r = await room(1); await chat(r);
    vi.mocked(fetch).mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("private timeout diagnostics")), { once: true });
    }));
    const running = r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { interval: 1, timeout: 1000 });
    await vi.advanceTimersByTimeAsync(10_001); await running;
    expect(await r.get()).toMatchObject({ phase: "cancelled", reason: "service_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("late replies cannot publish after voting begins or a human leaves", async () => {
    const r = await room(1); await chat(r);
    expect(await r.t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 })).not.toBeNull();
    const round = await r.t.run(ctx => ctx.db.get(r.roundId));
    vi.setSystemTime(round!.chatEndsAt);
    await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    await r.t.mutation(internal.botState.commit, { roundId: r.roundId, turn: 0, text: "Late reply" });
    const value = await r.get(); if (value.phase !== "voting") throw new Error("Expected voting");
    expect(value.messages).toHaveLength(0);
    await r.people[0].mutation(api.game.leaveRound, { roundId: r.roundId, input: command() });
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 1 });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("a lost action is cancelled by its watchdog, and no bot calls start near the deadline", async () => {
    const r = await room(1); await chat(r);
    await r.t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 });
    await r.t.mutation(internal.botState.fail, { roundId: r.roundId, turn: 0 });
    expect((await r.get()).phase).toBe("cancelled");
    const other = await room(1); await chat(other);
    const round = await other.t.run(ctx => ctx.db.get(other.roundId));
    vi.setSystemTime(round!.chatEndsAt - 5000);
    await other.t.action(internal.bots.takeTurn, { roundId: other.roundId, turn: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("the room-wide attempt cap stops an unbounded bot conversation", async () => {
    const r = await room(1); await chat(r);
    for (let turn = 0; turn < 12; turn++) await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn });
    expect(fetch).toHaveBeenCalledTimes(10);
    const value = await r.get(); if (value.phase !== "chat") throw new Error("Expected chat");
    expect(value.messages).toHaveLength(10);
  });
});

describe("human ballots and bot safety controls", () => {
  test("a one-bot room scores human and AI guesses against their actual roles", async () => {
    const r = await room(2); await chat(r);
    const round = await r.t.run(ctx => ctx.db.get(r.roundId));
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).take(3));
    vi.setSystemTime(round!.chatEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    for (const person of r.people) {
      const view = must(await person.query(api.game.getRound, { roundId: r.roundId }));
      const votes = members.filter(member => member._id !== view.selfId).map(member => ({ participantId: member._id, label: member.kind }));
      must(await person.mutation(api.game.submitVotes, { roundId: r.roundId, input: { ...command(), votes } }));
    }
    vi.setSystemTime(round!.votingEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    for (const index of [0, 1]) {
      const view = await r.get(index); if (view.phase !== "reveal") throw new Error("Expected reveal");
      expect(view.yourResult.guessingPointsEarned).toBe(200);
      expect(view.yourResult.recognition.humanVotesReceived).toBe(1);
      expect(view.yourResult.recognition.fraction).toBe(1);
    }
    expect(must(await r.t.query(api.game.getLeaderboard, {})).entries).toHaveLength(2);
  });

  test("correct AI guesses earn 200 points and bots never get ballots, profiles or leaderboard entries", async () => {
    const r = await room(1); await chat(r);
    const round = await r.t.run(ctx => ctx.db.get(r.roundId));
    vi.setSystemTime(round!.chatEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    const value = await r.get();
    const votes = value.participants.filter(seat => seat.id !== value.selfId).map(seat => ({ participantId: seat.id, label: "ai" as const }));
    must(await r.people[0].mutation(api.game.submitVotes, { roundId: r.roundId, input: { ...command(), votes } }));
    vi.setSystemTime(round!.votingEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    const revealed = await r.get(); if (revealed.phase !== "reveal") throw new Error("Expected reveal");
    expect(revealed.yourResult.guessingPointsEarned).toBe(200);
    expect(revealed.participants.filter(seat => seat.kind === "ai")).toHaveLength(2);
    expect(revealed.yourResult.recognition.fraction).toBeNull();
    expect(must(await r.t.query(api.game.getLeaderboard, {})).entries).toHaveLength(1);
    expect(await r.t.run(ctx => ctx.db.query("ballots").take(4))).toHaveLength(1);
  });

  test("reports and blocks accept bot seats without leaking their role or creating fake human records", async () => {
    const r = await room(1);
    const value = await r.get(); const target = value.participants.find(seat => seat.id !== value.selfId)!;
    expect(await r.people[0].mutation(api.game.reportParticipant, { roundId: r.roundId, input: { ...command(), participantId: target.id, reason: "spam" } })).toEqual({ ok: true, data: { recorded: true } });
    const reports = await r.t.run(ctx => ctx.db.query("reports").take(2));
    expect(reports[0].targetMemberId).toBe(target.id);
    expect(reports[0].targetPlayerId).toBeUndefined();
    expect(await r.people[0].mutation(api.game.blockParticipant, { roundId: r.roundId, input: { ...command(), participantId: target.id } })).toEqual({ ok: true, data: { left: true } });
    expect((await r.get()).phase).toBe("cancelled");
    expect(await r.t.run(ctx => ctx.db.query("blocks").take(2))).toHaveLength(0);
  });
});

test("Mubit adapter rejects non-text/tool input and strips upstream failure details", async () => {
  const model = createMubitModel("mbt_synthetic_test_key");
  await expect(model.doGenerate({ prompt: [{ role: "tool", content: [] }] })).rejects.toThrow("text only");
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockRejectedValueOnce(new Error("mbt_synthetic_test_key provider headers"));
  await expect(model.doGenerate({ prompt: [{ role: "system", content: "Test" }] })).rejects.toThrow("Mubit chat is unavailable.");
});
