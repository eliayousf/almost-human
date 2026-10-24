/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import agentTest from "@convex-dev/agent/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import presenceTest from "@convex-dev/presence/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import type { ApiResult, HumanOrAi, QueueTicket, RoundSnapshot, SessionView } from "../../shared/game-contract";

const modules = import.meta.glob("./**/*.ts");
const POLICY_VERSION = "playtest-v1";
const command = () => ({ clientRequestId: crypto.randomUUID() });

function init() {
  const t = convexTest(schema, modules);
  agentTest.register(t);
  rateLimiterTest.register(t);
  presenceTest.register(t);
  return t;
}
type TestBackend = ReturnType<typeof init>;
type Player = {
  client: ReturnType<TestBackend["withIdentity"]>;
  userId: Id<"users">;
  session: SessionView;
};

function must<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.error.code}: ${result.error.message}`);
  return result.data;
}

async function player(t: TestBackend, trainingOptIn = false): Promise<Player> {
  const userId = await t.run((ctx) => ctx.db.insert("users", { isAnonymous: true }));
  // Convex Auth's subject is userId|authSessionId. These tests mock identity;
  // the browser playtest separately exercises actual anonymous sign-in/JWTs.
  const client = t.withIdentity({ subject: `${userId}|test-session-${crypto.randomUUID()}` });
  const session = must(await client.mutation(api.game.createSession, {
    input: { ...command(), adultConfirmed: true, rulesAccepted: true, policyVersion: POLICY_VERSION, trainingOptIn },
  }));
  return { client, userId, session };
}

async function room(t: TestBackend) {
  const people = await Promise.all([player(t), player(t), player(t)]) as [Player, Player, Player];
  const tickets = await Promise.all(people.map((person) => person.client.mutation(api.game.joinQueue, { input: command() })));
  const assigned = await Promise.all(people.map((person, index) => person.client.query(api.game.getQueue, {
    queueId: must(tickets[index]).queueId,
  })));
  const roundIds = assigned.map((result) => {
    const ticket = must(result);
    expect(ticket.status).toBe("assigned");
    if (ticket.status !== "assigned") throw new Error("Room did not match");
    return ticket.roundId;
  });
  expect(new Set(roundIds).size).toBe(1);
  const roundId = roundIds[0] as Id<"rounds">;
  return { people, roundId };
}

async function snapshot(person: Player, roundId: Id<"rounds">): Promise<RoundSnapshot> {
  const value = must(await person.client.query(api.game.getRound, { roundId }));
  // Convex validates arrays; the handlers enforce their exact shared tuple size.
  expect(value.participants).toHaveLength(3);
  return value as unknown as RoundSnapshot;
}

async function advance(t: TestBackend, person: Player, roundId: Id<"rounds">): Promise<RoundSnapshot> {
  const current = await snapshot(person, roundId);
  const deadline = current.phase === "countdown" ? current.chatStartsAt
    : current.phase === "chat" ? current.chatEndsAt
      : current.phase === "voting" ? current.votingEndsAt : null;
  if (!deadline) throw new Error("Cannot advance a finished round");
  vi.setSystemTime(Date.parse(deadline));
  await t.mutation(internal.lifecycle.advance, { roundId });
  return snapshot(person, roundId);
}

type BackendGuess = { participantId: Id<"members">; label: HumanOrAi };
function guesses(value: RoundSnapshot, labels: readonly [HumanOrAi, HumanOrAi] = ["human", "human"]): BackendGuess[] {
  const others = value.participants.filter((seat) => seat.id !== value.selfId);
  return [
    { participantId: others[0].id as Id<"members">, label: labels[0] },
    { participantId: others[1].id as Id<"members">, label: labels[1] },
  ];
}

async function elapseWithHeartbeats(t: TestBackend, people: readonly Player[], deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    await vi.advanceTimersByTimeAsync(Math.min(10_000, deadline - Date.now()));
    await t.finishInProgressScheduledFunctions();
    for (const person of people) {
      must(await person.client.mutation(api.game.heartbeat, { sessionId: `test-${person.userId}` }));
    }
  }
}

function assertPrivateFieldsAbsent(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(["kind", "role", "botCount", "model", "provider", "threadId", "userId", "trainingOptIn", "systemPrompt"]).not.toContain(key);
    assertPrivateFieldsAbsent(nested);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T04:00:00.000Z"));
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("anonymous sessions and atomic all-human matching", () => {
  test("requires authentication and persists separate, revocable training consent", async () => {
    const t = init();
    expect(await t.query(api.game.getSession, {})).toMatchObject({ ok: false, error: { code: "UNAUTHENTICATED" } });
    const person = await player(t, true);
    expect(person.session.trainingOptIn).toBe(true);
    must(await person.client.mutation(api.game.setTrainingConsent, {
      input: { ...command(), policyVersion: POLICY_VERSION, trainingOptIn: false },
    }));
    expect(must(await person.client.query(api.game.getSession, {})).trainingOptIn).toBe(false);
  });

  test("matches three distinct humans into one room despite repeated queue commands", async () => {
    const t = init();
    const { people, roundId } = await room(t);
    const all = await Promise.all(people.map((person) => snapshot(person, roundId)));
    expect(new Set(all.map((value) => value.selfId)).size).toBe(3);
    expect(all.every((value) => value.phase === "countdown")).toBe(true);
    expect(all[0].participants).toHaveLength(3);
    expect(new Set(all[0].participants.map((seat) => seat.id)).size).toBe(3);
    await Promise.all(people.map((person) => person.client.mutation(api.game.joinQueue, { input: command() })));
    const stored = await t.run((ctx) => ctx.db.query("rounds").take(10));
    expect(stored).toHaveLength(1);
    expect(stored[0]._id).toBe(roundId);
  });

  test("reveals neither topic during countdown nor roles before reveal", async () => {
    const t = init();
    const { people, roundId } = await room(t);
    const [a] = people;
    const countdown = await snapshot(a, roundId);
    expect(countdown).not.toHaveProperty("topic");
    expect(countdown).not.toHaveProperty("messages");
    assertPrivateFieldsAbsent(countdown);
    const chat = await advance(t, a, roundId);
    expect(chat.phase).toBe("chat");
    expect(chat).toHaveProperty("topic.text");
    assertPrivateFieldsAbsent(chat);
  });
});

describe("round authorization, messages, and server deadlines", () => {
  test("an outsider cannot read, send to, or vote in a room", async () => {
    const t = init();
    const { people: [a], roundId } = await room(t);
    const outsider = await player(t);
    const chat = await advance(t, a, roundId);
    expect(await outsider.client.query(api.game.getRound, { roundId })).toMatchObject({ ok: false, error: { code: "NOT_PARTICIPANT" } });
    expect(await outsider.client.mutation(api.game.sendMessage, { roundId, input: { ...command(), text: "Uninvited" } }))
      .toMatchObject({ ok: false, error: { code: "NOT_PARTICIPANT" } });
    await advance(t, a, roundId);
    expect(await outsider.client.mutation(api.game.submitVotes, { roundId, input: { ...command(), votes: guesses(chat) } }))
      .toMatchObject({ ok: false, error: { code: "NOT_PARTICIPANT" } });
  });

  test("chat accepts one idempotent message, blocks contact sharing, and rejects messages outside its window", async () => {
    const t = init();
    const { people: [a], roundId } = await room(t);
    expect((await a.client.mutation(api.game.sendMessage, { roundId, input: { ...command(), text: "Too early" } })).ok).toBe(false);
    await advance(t, a, roundId);
    const input = { ...command(), text: "Pineapple belongs on pizza." };
    const accepted = must(await a.client.mutation(api.game.sendMessage, { roundId, input }));
    expect(must(await a.client.mutation(api.game.sendMessage, { roundId, input })).id).toBe(accepted.id);
    for (const text of ["Contact test@example.com", "Call +44 7700 900123"]) {
      expect(await a.client.mutation(api.game.sendMessage, { roundId, input: { ...command(), text } }))
        .toMatchObject({ ok: false, error: { code: "MESSAGE_BLOCKED" } });
    }
    const chat = await snapshot(a, roundId);
    if (chat.phase !== "chat") throw new Error("Expected chat");
    expect(chat.messages).toHaveLength(1);
    expect(chat.messages[0].text).toBe(input.text);
    vi.setSystemTime(Date.parse(chat.chatEndsAt));
    expect((await a.client.mutation(api.game.sendMessage, { roundId, input: { ...command(), text: "Too late" } })).ok).toBe(false);
    // A lost response may be retried after the deadline: it must return the
    // already-accepted message rather than insert another or undo acceptance.
    expect(must(await a.client.mutation(api.game.sendMessage, { roundId, input })).id).toBe(accepted.id);
  });

  test("scheduled lifecycle follows 3 seconds, 2 minutes, then the voting window", async () => {
    const t = init();
    const { people, roundId } = await room(t);
    const [a] = people;
    const countdown = await snapshot(a, roundId);
    if (countdown.phase !== "countdown") throw new Error("Expected countdown");
    expect(Date.parse(countdown.chatEndsAt) - Date.parse(countdown.chatStartsAt)).toBe(120_000);
    // convex-test's commit clock can move a few milliseconds beyond the frozen
    // wall clock while setup transactions commit. Use the actual server deadline.
    await elapseWithHeartbeats(t, people, Date.parse(countdown.chatStartsAt) - 1);
    await t.finishInProgressScheduledFunctions();
    expect((await snapshot(a, roundId)).phase).toBe("countdown");
    await elapseWithHeartbeats(t, people, Date.parse(countdown.chatStartsAt));
    await t.finishInProgressScheduledFunctions();
    expect((await snapshot(a, roundId)).phase).toBe("chat");
    await elapseWithHeartbeats(t, people, Date.parse(countdown.chatEndsAt));
    await t.finishInProgressScheduledFunctions();
    expect((await snapshot(a, roundId)).phase).toBe("voting");
    const voting = await snapshot(a, roundId);
    if (voting.phase !== "voting") throw new Error("Expected voting");
    await elapseWithHeartbeats(t, people, Date.parse(voting.votingEndsAt));
    await t.finishInProgressScheduledFunctions();
    expect((await snapshot(a, roundId)).phase).toBe("reveal");
  });
});

describe("private ballots, scoring, and public leaderboard", () => {
  test("requires two distinct other seats, locks the ballot, and keeps it private", async () => {
    const t = init();
    const { people: [a, b, c], roundId } = await room(t);
    await advance(t, a, roundId);
    const voting = await advance(t, a, roundId);
    const valid = guesses(voting);
    const invalidBallots: BackendGuess[][] = [
      [valid[0], valid[0]],
      [{ participantId: voting.selfId as Id<"members">, label: "human" }, valid[0]],
      [valid[0]],
    ];
    for (const votes of invalidBallots) {
      expect(await a.client.mutation(api.game.submitVotes, {
        roundId, input: { ...command(), votes },
      })).toMatchObject({ ok: false, error: { code: "INVALID_INPUT" } });
    }
    const input = { ...command(), votes: valid };
    const submitted = must(await a.client.mutation(api.game.submitVotes, { roundId, input }));
    const repeated = must(await a.client.mutation(api.game.submitVotes, { roundId, input }));
    expect(repeated.phase).toBe("voting");
    if (submitted.phase !== "voting" || repeated.phase !== "voting") throw new Error("Expected voting");
    expect(repeated.ownBallot).toEqual(submitted.ownBallot);
    expect(await a.client.mutation(api.game.submitVotes, {
      roundId, input: { ...command(), votes: guesses(voting, ["ai", "ai"]) },
    })).toMatchObject({ ok: false, error: { code: "VOTES_LOCKED" } });
    const otherView = await snapshot(b, roundId);
    expect(otherView.phase).toBe("voting");
    if (otherView.phase !== "voting") throw new Error("Expected voting");
    expect(otherView.ownBallot).toEqual({ status: "open" });
    assertPrivateFieldsAbsent(otherView);
    for (const person of [b, c]) {
      must(await person.client.mutation(api.game.submitVotes, { roundId, input: { ...command(), votes: guesses(await snapshot(person, roundId)) } }));
    }
    expect((await snapshot(a, roundId)).phase).toBe("voting");
  });

  test("all-human truth produces 200/100/0 points, recognition, and one finalization", async () => {
    const t = init();
    const { people: [a, b, c], roundId } = await room(t);
    await advance(t, a, roundId);
    await advance(t, a, roundId);
    const aView = await snapshot(a, roundId);
    const bView = await snapshot(b, roundId);
    must(await a.client.mutation(api.game.submitVotes, { roundId, input: { ...command(), votes: guesses(aView) } }));
    const bVotes = guesses(bView).map<BackendGuess>((guess) => ({ ...guess, label: guess.participantId === aView.selfId ? "human" : "ai" }));
    must(await b.client.mutation(api.game.submitVotes, { roundId, input: { ...command(), votes: bVotes } }));
    await advance(t, a, roundId);
    const revealed = await Promise.all([a, b, c].map((person) => snapshot(person, roundId)));
    for (const value of revealed) {
      expect(value.phase).toBe("reveal");
      if (value.phase !== "reveal") throw new Error("Expected reveal");
      expect(value.participants.every((seat) => seat.kind === "human")).toBe(true);
    }
    const [aResult, bResult, cResult] = revealed.map((value) => {
      if (value.phase !== "reveal") throw new Error("Expected reveal");
      return value.yourResult;
    });
    expect([aResult.guessingPointsEarned, bResult.guessingPointsEarned, cResult.guessingPointsEarned]).toEqual([200, 100, 0]);
    expect(aResult.streak).toBe(1);
    expect(cResult.ballotStatus).toBe("not_submitted");
    expect(cResult.votes).toBeNull();
    expect(aResult.recognition).toEqual({ humanVotesReceived: 1, humanVotesRecognisingYou: 1, fraction: 1 });
    expect(cResult.recognition).toEqual({ humanVotesReceived: 2, humanVotesRecognisingYou: 1, fraction: .5 });
    await t.mutation(internal.lifecycle.advance, { roundId });
    expect(must(await a.client.query(api.game.getSession, {})).totalGuessingPoints).toBe(200);
    const leaderboard = must(await t.query(api.game.getLeaderboard, {}));
    expect(leaderboard.entries.map((entry) => entry.guessingPoints)).toEqual([200, 100, 0]);
    expect(leaderboard.entries.map((entry) => entry.rank)).toEqual([1, 2, 3]);
    expect(leaderboard.entries.every((entry) => entry.roundsPlayed === 1)).toBe(true);
    for (const entry of leaderboard.entries) {
      expect(entry).not.toHaveProperty("userId");
      expect(entry).not.toHaveProperty("trainingOptIn");
      expect(entry).not.toHaveProperty("authSessionId");
    }
  });
});

describe("leave, block, and safe rematching", () => {
  test("leaving at the voting deadline settles earned points instead of cancelling them", async () => {
    const t = init();
    const { people: [a, b], roundId } = await room(t);
    await advance(t, a, roundId);
    const voting = await advance(t, a, roundId);
    if (voting.phase !== "voting") throw new Error("Expected voting");
    must(await a.client.mutation(api.game.submitVotes, {
      roundId, input: { ...command(), votes: guesses(voting) },
    }));
    // Simulate a delayed scheduler: wall-clock voting has ended, but the stored
    // phase remains voting until this late leave command processes the deadline.
    vi.setSystemTime(Date.parse(voting.votingEndsAt));
    must(await b.client.mutation(api.game.leaveRound, { roundId, input: command() }));
    const revealed = await snapshot(a, roundId);
    expect(revealed.phase).toBe("reveal");
    if (revealed.phase !== "reveal") throw new Error("Expected reveal");
    expect(revealed.yourResult.guessingPointsEarned).toBe(200);
    expect(revealed.yourResult.totalGuessingPoints).toBe(200);
    await t.mutation(internal.lifecycle.advance, { roundId });
    expect(must(await a.client.query(api.game.getSession, {})).totalGuessingPoints).toBe(200);
  });

  test("an offline participant cancels the room without awarding points", async () => {
    const t = init();
    const { people: [a, b, c], roundId } = await room(t);
    // No subscription heartbeats: the server's grace period expires.
    await vi.advanceTimersByTimeAsync(31_000);
    await t.finishInProgressScheduledFunctions();
    expect(await snapshot(a, roundId)).toMatchObject({ phase: "cancelled", reason: "connection_lost" });
    for (const person of [a, b, c]) expect(must(await person.client.query(api.game.getSession, {})).totalGuessingPoints).toBe(0);
  });

  test("an abandoned queue entry expires rather than matching a departed player", async () => {
    const t = init();
    const a = await player(t);
    const ticket = must(await a.client.mutation(api.game.joinQueue, { input: command() }));
    await vi.advanceTimersByTimeAsync(31_000);
    await t.finishInProgressScheduledFunctions();
    expect(await a.client.query(api.game.getQueue, { queueId: ticket.queueId })).toMatchObject({ ok: false, error: { code: "QUEUE_CLOSED" } });
    const session = must(await a.client.query(api.game.getSession, {}));
    expect(session).not.toHaveProperty("activeQueueId");
  });

  test("leaving cancels the room and awards no points", async () => {
    const t = init();
    const { people: [a, b, c], roundId } = await room(t);
    await advance(t, a, roundId);
    await advance(t, a, roundId);
    must(await a.client.mutation(api.game.submitVotes, {
      roundId, input: { ...command(), votes: guesses(await snapshot(a, roundId)) },
    }));
    must(await b.client.mutation(api.game.leaveRound, { roundId, input: command() }));
    expect((await snapshot(c, roundId)).phase).toBe("cancelled");
    await t.mutation(internal.lifecycle.advance, { roundId });
    for (const person of [a, b, c]) expect(must(await person.client.query(api.game.getSession, {})).totalGuessingPoints).toBe(0);
  });

  test("blocking cancels the room and the pair cannot be matched together again", async () => {
    const t = init();
    const { people: [a, b, c], roundId } = await room(t);
    const bSeat = (await snapshot(b, roundId)).selfId as Id<"members">;
    must(await a.client.mutation(api.game.blockParticipant, { roundId, input: { ...command(), participantId: bSeat } }));
    expect((await snapshot(c, roundId)).phase).toBe("cancelled");
    const tickets: QueueTicket[] = [];
    for (const person of [a, b, c]) tickets.push(must(await person.client.mutation(api.game.joinQueue, { input: command() })));
    const before = await Promise.all([a, b, c].map((person, i) => person.client.query(api.game.getQueue, { queueId: tickets[i].queueId as Id<"queue"> })));
    expect(before.every((ticket) => must(ticket).status === "waiting")).toBe(true);
    const d = await player(t);
    must(await d.client.mutation(api.game.joinQueue, { input: command() }));
    const [aTicket, bTicket] = await Promise.all([a, b].map((person, i) => person.client.query(api.game.getQueue, { queueId: tickets[i].queueId as Id<"queue"> })));
    const aQueue = must(aTicket); const bQueue = must(bTicket);
    expect(!(aQueue.status === "assigned" && bQueue.status === "assigned" && aQueue.roundId === bQueue.roundId)).toBe(true);
    for (const person of [a, b, c]) expect(must(await person.client.query(api.game.getSession, {})).totalGuessingPoints).toBe(0);
  });
});
