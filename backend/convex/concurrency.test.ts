/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import presenceTest from "@convex-dev/presence/test";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { LOBBY_ACCUMULATE_WAIT_MS } from "./botlogic";
import { BOT_MAX_TYPING_MS } from "./botTiming";
import type { Id } from "./_generated/dataModel";
import { GAME_DEFAULTS, type ApiResult, type QueueTicket } from "../../shared/game-contract";

import { VOTE_FEEDBACK_TERMS_VERSION } from "../../shared/playtest-policy";

const modules = import.meta.glob("./**/*.ts");
const command = () => ({ clientRequestId: crypto.randomUUID() });
function must<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error.code + ": " + result.error.message);
  return result.data;
}
function init() {
  const t = convexTest(schema, modules);
  agentTest.register(t); rateLimiterTest.register(t); presenceTest.register(t);
  return t;
}
type Backend = ReturnType<typeof init>;
async function player(t: Backend) {
  const id = await t.run(ctx => ctx.db.insert("users", { isAnonymous: true }));
  const client = t.withIdentity({ subject: `${id}|synthetic-${crypto.randomUUID()}` });
  must(await client.mutation(api.game.createSession, { input: { ...command(), adultConfirmed: true, rulesAccepted: true, policyVersion: VOTE_FEEDBACK_TERMS_VERSION, trainingOptIn: true } }));
  return client;
}
function roundId(ticket: QueueTicket): Id<"rounds"> {
  if (ticket.status !== "assigned") throw new Error("A player was left waiting");
  return ticket.roundId as Id<"rounds">;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  vi.stubEnv("MUBIT_API_KEY", "synthetic-local-test-key"); vi.stubEnv("MUBIT_BOTS_ENABLED", "true");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
    model: "gpt-6-luna", choices: [{ message: { role: "assistant", content: "A short synthetic room reply." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 60, completion_tokens: 8 },
  }), { status: 200, headers: { "content-type": "application/json" } })));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("40 concurrent players", () => {
  test("forty humans form twenty private 1v1 rooms, exchange messages and settle their own votes once", async () => {
    const t = init();
    const people = await Promise.all(Array.from({ length: 40 }, () => player(t)));
    const tickets = await Promise.all(people.map(p => p.mutation(api.game.joinQueue, { input: { ...command(), strictPair: true } }).then(must)));
    await t.finishInProgressScheduledFunctions();
    const queues = await Promise.all(people.map((p, i) => p.query(api.game.getQueue, { queueId: tickets[i].queueId }).then(must)));
    const ids = queues.map(roundId);
    const rooms = [...new Set(ids)];
    expect(rooms).toHaveLength(20);
    const members = await t.run(ctx => ctx.db.query("members").collect());
    expect(members).toHaveLength(40);
    expect(new Set(members.map(m => m.kind === "human" ? m.playerId : null)).size).toBe(40);
    expect(members.every(m => m.kind === "human")).toBe(true);
    await vi.advanceTimersByTimeAsync(3_100); await t.finishInProgressScheduledFunctions();
    await Promise.all(people.map((p, i) => p.mutation(api.game.sendMessage, { roundId: ids[i], input: { ...command(), text: `Synthetic player ${i}` } }).then(must)));
    const chats = await Promise.all(people.map((p, i) => p.query(api.game.getRound, { roundId: ids[i] }).then(must)));
    for (const [i, chat] of chats.entries()) {
      expect(chat.phase).toBe("chat");
      expect(chat.participants).toHaveLength(2);
      if (chat.phase !== "chat") throw new Error("Expected chat");
      expect(chat.messages).toHaveLength(2);
      const sameRoom = ids.flatMap((id, index) => id === ids[i] ? [`Synthetic player ${index}`] : []);
      expect(chat.messages.map(m => m.text).sort()).toEqual(sameRoom.sort());
      expect(JSON.stringify(chat)).not.toMatch(/"kind"|"model"|"provider"/);
    }
    const foreignRoom = rooms.find(id => id !== ids[0])!;
    const foreign = await people[0].query(api.game.getRound, { roundId: foreignRoom });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("NOT_PARTICIPANT");
    const first = chats[0];
    if (first.phase !== "chat") throw new Error("Expected chat");
    vi.setSystemTime(Date.parse(first.chatEndsAt));
    await Promise.all(rooms.map(id => t.mutation(internal.lifecycle.advance, { roundId: id })));
    const voting = await Promise.all(people.map((p, i) => p.query(api.game.getRound, { roundId: ids[i] }).then(must)));
    await Promise.all(people.map((p, i) => {
      const view = voting[i];
      const other = view.participants.find(s => s.id !== view.selfId)!;
      return p.mutation(api.game.submitVotes, { roundId: ids[i], input: { ...command(), votes: [{ participantId: other.id as Id<"members">, label: "human" as const }] } }).then(must);
    }));
    const deadline = voting[0];
    if (deadline.phase !== "voting") throw new Error("Expected voting");
    vi.setSystemTime(Date.parse(deadline.votingEndsAt));
    await Promise.all(rooms.map(id => t.mutation(internal.lifecycle.advance, { roundId: id })));
    await Promise.all(rooms.map(id => t.mutation(internal.lifecycle.advance, { roundId: id })));
    for (const [i, p] of people.entries()) {
      const reveal = must(await p.query(api.game.getRound, { roundId: ids[i] }));
      expect(reveal.phase).toBe("reveal");
      if (reveal.phase !== "reveal") throw new Error("Expected reveal");
      expect(reveal.yourResult.correctGuessCount).toBe(1);
      expect(reveal.yourResult.guessingPointsEarned).toBe(100);
      expect(reveal.yourResult.totalGuessingPoints).toBe(100);
    }
    expect(fetch).not.toHaveBeenCalled();
  }, 30_000);

  test("forty independent human/AI rooms all receive replies without sharing turns or messages", async () => {
    const t = init();
    const people = await Promise.all(Array.from({ length: 40 }, () => player(t)));
    const ids: Id<"rounds">[] = [];
    for (const p of people) {
      const ticket = must(await p.mutation(api.game.joinQueue, { input: { ...command(), strictPair: true } }));
      // Arrange forty already-elapsed solo waits without advancing earlier rooms' clocks.
      await t.run(ctx => ctx.db.patch(ticket.queueId, { joinedAt: Date.now() - LOBBY_ACCUMULATE_WAIT_MS }));
      await t.mutation(internal.matchmaking.match, {});
      ids.push(roundId(must(await p.query(api.game.getQueue, { queueId: ticket.queueId }))));
    }
    expect(new Set(ids).size).toBe(40);
    // Cover countdown, the longest opener delay, and the current typing cap.
    // A fixed 16s wait raced the recently increased 6–12s reply pacing.
    await vi.advanceTimersByTimeAsync(GAME_DEFAULTS.countdownMs + 4_000 + BOT_MAX_TYPING_MS + 1_000);
    await t.finishInProgressScheduledFunctions();
    const views = await Promise.all(people.map((p, i) => p.query(api.game.getRound, { roundId: ids[i] }).then(must)));
    const botMessageIds = new Set<string>();
    for (const view of views) {
      expect(view.phase).toBe("chat");
      if (view.phase !== "chat") throw new Error("Expected chat");
      expect(view.participants).toHaveLength(2);
      expect(view.messages).toHaveLength(1);
      expect(view.messages[0].senderId).not.toBe(view.selfId);
      expect(view.messages[0].text).toBe("A short synthetic room reply.");
      botMessageIds.add(view.messages[0].id);
    }
    expect(botMessageIds.size).toBe(40);
    expect(fetch).toHaveBeenCalledTimes(40);
  }, 30_000);
});
