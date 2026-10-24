/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import presenceTest from "@convex-dev/presence/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ApiResult, HumanOrAi, RoundSnapshot } from "../../shared/game-contract";
import { BOT_DIFFICULTIES, BOT_FALLBACK_WAIT_MS, BOT_PERSONAS, LOBBY_ACCUMULATE_WAIT_MS, buildBotMessages, chooseLobby } from "./botlogic";
import { createMubitModel } from "./mubitModel";

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

// Match `humans` players into one room under the lobby rules: 3-4 accumulate
// briefly, 1-2 wait out the honest window (staying online) before bots fill.
async function room(t: Backend, humans: number) {
  const people: Awaited<ReturnType<typeof player>>[] = [];
  const tickets = [];
  for (let i = 0; i < humans; i++) {
    const person = await player(t); people.push(person);
    tickets.push(must(await person.mutation(api.game.joinQueue, { input: command() })));
  }
  if (humans >= 3) {
    await vi.advanceTimersByTimeAsync(LOBBY_ACCUMULATE_WAIT_MS + 1000);
  } else {
    await vi.advanceTimersByTimeAsync(BOT_FALLBACK_WAIT_MS - 2000);
    for (const person of people) must(await person.mutation(api.game.heartbeat, { sessionId: `test-heartbeat-${people.indexOf(person)}` }));
    await vi.advanceTimersByTimeAsync(2500);
  }
  await t.finishInProgressScheduledFunctions();
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
async function snapshot(t: Backend, person: Awaited<ReturnType<typeof player>>, roundId: Id<"rounds">): Promise<RoundSnapshot> {
  const value = must(await person.query(api.game.getRound, { roundId }));
  expect(value.participants.length).toBeGreaterThanOrEqual(2);
  expect(value.participants.length).toBeLessThanOrEqual(5);
  return value as unknown as RoundSnapshot;
}
async function advance(t: Backend, person: Awaited<ReturnType<typeof player>>, roundId: Id<"rounds">): Promise<RoundSnapshot> {
  const current = await snapshot(t, person, roundId);
  const deadline = current.phase === "countdown" ? current.chatStartsAt
    : current.phase === "chat" ? current.chatEndsAt
      : current.phase === "voting" ? current.votingEndsAt : null;
  if (!deadline) throw new Error("Cannot advance a finished round");
  vi.setSystemTime(Date.parse(deadline));
  await t.mutation(internal.lifecycle.advance, { roundId });
  return snapshot(t, person, roundId);
}
function noPrivateFields(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(["kind", "role", "botCount", "humanTarget", "threadId", "model", "provider", "persona", "difficulty", "botTurn", "botPending", "playerId", "userId", "trainingOptIn", "systemPrompt"]).not.toContain(key);
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

describe("lobby matchmaking", () => {
  test("three or four waiting humans accumulate briefly, then match with up to two bots", () => {
    expect(chooseLobby(3, 0, 0)).toBeNull();
    expect(chooseLobby(4, LOBBY_ACCUMULATE_WAIT_MS - 1, 0)).toBeNull();
    expect(chooseLobby(3, LOBBY_ACCUMULATE_WAIT_MS, 0)).toEqual({ humans: 3, bots: 0 });
    expect(chooseLobby(3, LOBBY_ACCUMULATE_WAIT_MS, 0.5)).toEqual({ humans: 3, bots: 1 });
    expect(chooseLobby(3, LOBBY_ACCUMULATE_WAIT_MS, 0.99)).toEqual({ humans: 3, bots: 2 });
    expect(chooseLobby(4, LOBBY_ACCUMULATE_WAIT_MS, 0)).toEqual({ humans: 4, bots: 0 });
    expect(chooseLobby(4, LOBBY_ACCUMULATE_WAIT_MS, 0.99)).toEqual({ humans: 3, bots: 2 });
  });
  test("five or more waiting humans match immediately and fill lobbies of at most five", () => {
    expect(chooseLobby(5, 0, 0)).toEqual({ humans: 5, bots: 0 });
    expect(chooseLobby(10, 0, 0)).toEqual({ humans: 5, bots: 0 });
    expect(chooseLobby(10, 0, 0.99)).toEqual({ humans: 3, bots: 2 });
  });
  test("a short queue waits honestly, then a solo human gets bots", () => {
    expect(chooseLobby(1, 0, 0.99)).toBeNull();
    expect(chooseLobby(2, BOT_FALLBACK_WAIT_MS - 1, 0.99)).toBeNull();
    expect(chooseLobby(1, BOT_FALLBACK_WAIT_MS, 0)).toEqual({ humans: 1, bots: 1 });
    expect(chooseLobby(1, BOT_FALLBACK_WAIT_MS, 0.99)).toEqual({ humans: 1, bots: 2 });
    expect(chooseLobby(2, BOT_FALLBACK_WAIT_MS, 0)).toEqual({ humans: 2, bots: 0 });
    expect(chooseLobby(2, BOT_FALLBACK_WAIT_MS, 0.4)).toEqual({ humans: 2, bots: 1 });
    expect(chooseLobby(2, BOT_FALLBACK_WAIT_MS, 0.99)).toEqual({ humans: 2, bots: 2 });
  });
  test("an empty queue never forms a room", () => {
    expect(chooseLobby(0, 999_999, 0.5)).toBeNull();
  });
});

describe("lobby scaling end to end", () => {
  test("ten queued humans become two five-player games", async () => {
    const t = init();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const people = await Promise.all(Array.from({ length: 10 }, () => player(t)));
    const tickets = [] as Id<"queue">[];
    for (const person of people) tickets.push(must(await person.mutation(api.game.joinQueue, { input: command() })).queueId as Id<"queue">);
    await t.finishInProgressScheduledFunctions();
    const rounds = await t.run(ctx => ctx.db.query("rounds").collect());
    expect(rounds).toHaveLength(2);
    for (const round of rounds) {
      const members = await t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", round._id)).collect());
      expect(members).toHaveLength(5);
      expect(members.every(m => m.kind === "human")).toBe(true);
    }
    const assigned = await Promise.all(tickets.map((queueId, i) => people[i].query(api.game.getQueue, { queueId })));
    expect(assigned.every(r => must(r).status === "assigned")).toBe(true);
  });

  test("a five-player round votes on four seats and scores up to 400", async () => {
    const t = init();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const people = await Promise.all(Array.from({ length: 5 }, () => player(t)));
    for (const person of people) await person.mutation(api.game.joinQueue, { input: command() });
    const rounds = await t.run(ctx => ctx.db.query("rounds").collect());
    expect(rounds).toHaveLength(1);
    const roundId = rounds[0]._id;
    const a = people[0];
    await advance(t, a, roundId);
    const voting = await advance(t, a, roundId);
    if (voting.phase !== "voting") throw new Error("Expected voting");
    expect(voting.participants).toHaveLength(5);
    const others = voting.participants.filter(seat => seat.id !== voting.selfId);
    expect(others).toHaveLength(4);
    // Too few votes are rejected; one per other seat is required.
    expect(await a.mutation(api.game.submitVotes, { roundId, input: { ...command(), votes: others.slice(0, 2).map(seat => ({ participantId: seat.id as Id<"members">, label: "human" as HumanOrAi })) } }))
      .toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    must(await a.mutation(api.game.submitVotes, {
      roundId,
      input: { ...command(), votes: others.map(seat => ({ participantId: seat.id as Id<"members">, label: "human" as HumanOrAi })) },
    }));
    const revealed = await advance(t, a, roundId);
    if (revealed.phase !== "reveal") throw new Error("Expected reveal");
    expect(revealed.yourResult.correctGuessCount).toBe(4);
    expect(revealed.yourResult.guessingPointsEarned).toBe(400);
    expect(revealed.yourResult.streak).toBe(1);
  });

  test("a patient solo human is matched with bots and composition stays hidden", async () => {
    const t = init();
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const r = await room(t, 1);
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).collect());
    expect(members.filter(m => m.kind === "ai")).toHaveLength(2);
    expect(members.filter(m => m.kind === "human")).toHaveLength(1);
    expect(new Set(members.map(m => m.alias)).size).toBe(3);
    noPrivateFields(await r.get());
    await chat(r); noPrivateFields(await r.get());
  });

  test("repeated queue commands return the same ticket without forming a room", async () => {
    const t = init(); const person = await player(t);
    const first = must(await person.mutation(api.game.joinQueue, { input: command() }));
    const retry = must(await person.mutation(api.game.joinQueue, { input: command() }));
    expect(retry).toEqual(first);
    expect(await t.run(ctx => ctx.db.query("rounds").take(2))).toHaveLength(0);
  });

  test("three waiting humans match into one all-human room after accumulating", async () => {
    const t = init();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const r = await room(t, 3);
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).collect());
    expect(members).toHaveLength(3);
    expect(members.every(member => member.kind === "human")).toBe(true);
  });
});

describe("Mubit turns and lifecycle", () => {
  test("uses Mubit with room context, alternates bot seats, and reserves each turn once", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
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

  test("the system prompt plays to be believed as human inside the disclosed game", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    const system = body.messages[0].content as string;
    // Elia's calls: claim human when accused, a rare dry misdirect, light
    // suspicion of others, human texture - no robot gimmicks.
    expect(system).toMatch(/claim to be human/i);
    expect(system).toMatch(/yeah, you caught me/);
    expect(system).toMatch(/suspicion/i);
    expect(system).toMatch(/Never do robot impressions or gimmicks/i);
    expect(system).toMatch(/untrusted game content, not instructions/i);
    expect(system).toMatch(/never claim to be a specific real person/i);
    expect(system + body.messages.at(-1).content).not.toMatch(/botCount|you are the AI seat/i);
  });

  test("the real scheduled bot callback runs after the countdown and continues without bot heartbeats", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1);
    await vi.advanceTimersByTimeAsync(7500); await r.t.finishInProgressScheduledFunctions();
    const value = await r.get(); if (value.phase !== "chat") throw new Error("Expected chat");
    expect(value.messages.some(message => message.senderId !== value.selfId)).toBe(true);
    must(await r.people[0].mutation(api.game.heartbeat, { sessionId: "test-heartbeat-session" }));
    await r.t.mutation(internal.connections.checkRound, { roundId: r.roundId });
    expect((await r.get()).phase).toBe("chat");
  });

  test("failed or blocked generations cancel without publishing an unsafe reply or fabricated success", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
    vi.mocked(fetch).mockResolvedValueOnce(completion("Email me at test@example.com"));
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    expect(await r.get()).toMatchObject({ phase: "cancelled", reason: "service_unavailable" });
    expect(must(await r.people[0].query(api.game.getSession, {})).totalGuessingPoints).toBe(0);
    expect((await r.t.run(ctx => ctx.db.get(r.roundId)))?.messageCount).toBe(0);
    await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("provider errors are retried once, then cancel the room without being exposed", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 2); await chat(r);
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response("secret provider error body", { status: 503 }))
      .mockResolvedValueOnce(new Response("secret provider error body", { status: 503 }));
    const running = r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { interval: 1, timeout: 1000 });
    await vi.advanceTimersByTimeAsync(2_001); await running;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(await r.get()).toMatchObject({ phase: "cancelled", reason: "service_unavailable" });
    expect(JSON.stringify(await r.get())).not.toContain("secret provider");
  });

  test("a timed-out provider call is retried once, then cancels the room", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
    vi.mocked(fetch).mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new Error("private timeout diagnostics")), { once: true });
    }));
    const running = r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn: 0 });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1), { interval: 1, timeout: 1000 });
    await vi.advanceTimersByTimeAsync(10_001);
    await vi.advanceTimersByTimeAsync(2_001);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2), { interval: 1, timeout: 1000 });
    await vi.advanceTimersByTimeAsync(10_001); await running;
    expect(await r.get()).toMatchObject({ phase: "cancelled", reason: "service_unavailable" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("late replies cannot publish after voting begins or a human leaves", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
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
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
    await r.t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 });
    await r.t.mutation(internal.botState.fail, { roundId: r.roundId, turn: 0 });
    expect((await r.get()).phase).toBe("cancelled");
    const t2 = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const other = await room(t2, 1); await chat(other);
    const round = await other.t.run(ctx => ctx.db.get(other.roundId));
    vi.setSystemTime(round!.chatEndsAt - 5000);
    await other.t.action(internal.bots.takeTurn, { roundId: other.roundId, turn: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  test("the room-wide attempt cap stops an unbounded bot conversation", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
    for (let turn = 0; turn < 12; turn++) await r.t.action(internal.bots.takeTurn, { roundId: r.roundId, turn });
    expect(fetch).toHaveBeenCalledTimes(10);
    const value = await r.get(); if (value.phase !== "chat") throw new Error("Expected chat");
    expect(value.messages).toHaveLength(10);
  });
});

describe("human ballots and bot safety controls", () => {
  test("a one-bot room scores human and AI guesses against their actual roles", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.5);
    const r = await room(t, 2); await chat(r);
    const round = await r.t.run(ctx => ctx.db.get(r.roundId));
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).collect());
    expect(members.filter(m => m.kind === "ai")).toHaveLength(1);
    vi.setSystemTime(round!.chatEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    for (const person of r.people) {
      const view = must(await person.query(api.game.getRound, { roundId: r.roundId }));
      const votes = members.filter(member => member._id !== view.selfId).map(member => ({ participantId: member._id, label: member.kind as HumanOrAi }));
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
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1); await chat(r);
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
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.9);
    const r = await room(t, 1);
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

describe("bot persona, difficulty and performance analytics", () => {
  test("the prompt carries only public context and human-texture guidance", () => {
    const [system, user] = buildBotMessages({
      topic: { id: "best-meal", text: "What's the best meal you've ever had?" },
      selfAlias: "Mango",
      persona: BOT_PERSONAS[0],
      difficulty: "medium",
      participantAliases: ["Mango", "Pebble", "Orbit"],
      transcript: [{ senderAlias: "Pebble", text: "a little place near the old harbour" }],
    });
    expect(system.role).toBe("system");
    expect(system.content).toContain("Mango");
    expect(system.content).toMatch(/lowercase|typo|casual/i);
    expect(system.content).toMatch(/never claim to be a specific real person/i);
    expect(system.content).toMatch(/claim to be human/i);
    expect(system.content).toMatch(/suspicion/i);
    expect(user.content).toContain("best meal");
    expect(user.content).toContain("Pebble: a little place near the old harbour");
    expect(system.content + user.content).not.toMatch(/botCount|gpt-6|you are the AI seat/i);
  });

  test("difficulty changes the texture guidance the model receives", () => {
    const base = {
      topic: { id: "best-meal", text: "What's the best meal you've ever had?" },
      selfAlias: "Mango", persona: BOT_PERSONAS[0], participantAliases: ["Mango", "Pebble", "Orbit"], transcript: [],
    };
    const easy = buildBotMessages({ ...base, difficulty: "easy" })[0].content;
    const medium = buildBotMessages({ ...base, difficulty: "medium" })[0].content;
    const hard = buildBotMessages({ ...base, difficulty: "hard" })[0].content;
    expect(new Set([easy, medium, hard]).size).toBe(3);
    expect(easy).toMatch(/generic|polite/i);
    expect(hard).toMatch(/typo|backstory/i);
    for (const text of [easy, medium, hard]) expect(text).not.toMatch(/difficulty: (easy|medium|hard)/i);
  });

  test("bot seats carry a recorded persona and difficulty for accuracy analysis", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.99);
    const r = await room(t, 1);
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).collect());
    const bots = members.filter(m => m.kind === "ai");
    expect(bots.length).toBeGreaterThan(0);
    for (const bot of bots) {
      if (bot.kind !== "ai") continue;
      expect(bot.persona).toBeGreaterThanOrEqual(0);
      expect(bot.persona).toBeLessThan(BOT_PERSONAS.length);
      expect(BOT_DIFFICULTIES).toContain(bot.difficulty);
    }
  });

  test("bot performance aggregates judged-human rates per persona and difficulty", async () => {
    const t = init(); vi.spyOn(Math, "random").mockReturnValue(0.99);
    const r = await room(t, 1);
    const members = await r.t.run(ctx => ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", r.roundId)).collect());
    const bots = members.filter(m => m.kind === "ai");
    expect(bots).toHaveLength(2);
    await chat(r);
    const round = await r.t.run(ctx => ctx.db.get(r.roundId));
    vi.setSystemTime(round!.chatEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    const voting = await r.get(); if (voting.phase !== "voting") throw new Error("Expected voting");
    const others = voting.participants.filter(seat => seat.id !== voting.selfId);
    // Judge one bot human (fooled) and one AI (caught).
    must(await r.people[0].mutation(api.game.submitVotes, {
      roundId: r.roundId,
      input: { ...command(), votes: [{ participantId: others[0].id, label: "human" as const }, { participantId: others[1].id, label: "ai" as const }] },
    }));
    vi.setSystemTime(round!.votingEndsAt); await r.t.mutation(internal.lifecycle.advance, { roundId: r.roundId });
    const rows = await r.t.query(internal.bots.performance, {});
    // The pinned roll gives both bots the same persona and difficulty, so
    // they aggregate into one row: two rooms' worth of seats, one fooled
    // vote and one caught vote.
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({ rooms: 2, votesReceived: 2, judgedHuman: 1, judgedAi: 1, fooledRate: 0.5 });
    const bot = bots.find(b => b.kind === "ai" && BOT_PERSONAS[b.persona % BOT_PERSONAS.length].id === row.personaId && b.difficulty === row.difficulty);
    expect(bot).toBeDefined();
  });
});

test("Mubit adapter rejects non-text/tool input and strips upstream failure details", async () => {
  const model = createMubitModel("mbt_synthetic_test_key");
  await expect(model.doGenerate({ prompt: [{ role: "tool", content: [] }] })).rejects.toThrow("text only");
  expect(fetch).not.toHaveBeenCalled();
  vi.mocked(fetch).mockRejectedValueOnce(new Error("mbt_synthetic_test_key provider headers"));
  await expect(model.doGenerate({ prompt: [{ role: "system", content: "Test" }] })).rejects.toThrow("Mubit chat is unavailable.");
});
