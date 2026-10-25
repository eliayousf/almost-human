import { createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isOnline } from "./connections";
import { SEAT_NAMES, shuffled } from "./lib";
import { chooseQuestion, RECENT_TOPIC_LIMIT } from "./topics";
import { BOT_DIFFICULTIES, BOT_FALLBACK_WAIT_MS, BOT_PERSONAS, LOBBY_ACCUMULATE_WAIT_MS, MAX_LOBBY, chooseLobby } from "./botlogic";
import { GAME_DEFAULTS } from "../../shared/game-contract";

function botsEnabled(): boolean {
  return Boolean(process.env.MUBIT_API_KEY) && process.env.MUBIT_BOTS_ENABLED !== "false";
}

// Smallest compatible group of waiting humans of the requested size,
// honouring blocks in both directions. Bounded so a blocked pair at the
// front cannot stall everyone.
async function findGroup(ctx: MutationCtx, candidates: Doc<"queue">[], size: number): Promise<Doc<"queue">[] | undefined> {
  const compatibility = new Map<string, boolean>();
  async function incompatible(a: Id<"players">, b: Id<"players">) {
    const key = [a, b].sort().join(":");
    if (!compatibility.has(key)) compatibility.set(key, Boolean(
      await ctx.db.query("blocks").withIndex("by_blockerId_and_blockedId", q => q.eq("blockerId", a).eq("blockedId", b)).unique()
      || await ctx.db.query("blocks").withIndex("by_blockerId_and_blockedId", q => q.eq("blockerId", b).eq("blockedId", a)).unique(),
    ));
    return compatibility.get(key)!;
  }
  const chosen: Doc<"queue">[] = [];
  async function search(start: number): Promise<boolean> {
    if (chosen.length === size) return true;
    for (let i = start; i < candidates.length; i++) {
      let fits = true;
      for (const member of chosen) {
        if (await incompatible(member.playerId, candidates[i].playerId)) { fits = false; break; }
      }
      if (!fits) continue;
      chosen.push(candidates[i]);
      if (await search(i + 1)) return true;
      chosen.pop();
    }
    return false;
  }
  return (await search(0)) ? [...chosen] : undefined;
}

// Seats one lobby: creates the round and its members and schedules the
// lifecycle. Returns the number of humans seated.
async function seatLobby(ctx: MutationCtx, now: number, group: Doc<"queue">[], bots: number): Promise<number> {
  const players = await Promise.all(group.map(ticket => ctx.db.get(ticket.playerId)));
  const topic = chooseQuestion(players.map(player => player?.recentTopicIds ?? []));
  const threadId = await createThread(ctx, components.agent, {});
  const chatStartsAt = now + GAME_DEFAULTS.countdownMs;
  const chatEndsAt = chatStartsAt + GAME_DEFAULTS.chatMs;
  const roundId = await ctx.db.insert("rounds", {
    phase: "countdown", revision: 1, createdAt: now, updatedAt: now,
    chatStartsAt, chatEndsAt, votingEndsAt: chatEndsAt + GAME_DEFAULTS.votingMs,
    topic, threadId, messageCount: 0, settled: false, botTurn: 0,
  });
  const seats = shuffled([
    ...group.map(ticket => ({ kind: "human" as const, ticket })),
    ...Array.from({ length: bots }, () => ({
      kind: "ai" as const,
      persona: Math.floor(Math.random() * BOT_PERSONAS.length),
      difficulty: BOT_DIFFICULTIES[Math.floor(Math.random() * BOT_DIFFICULTIES.length)],
    })),
  ]);
  const aliases = shuffled(SEAT_NAMES);
  for (const [index, seat] of seats.entries()) {
    if (seat.kind === "ai") {
      await ctx.db.insert("members", { roundId, alias: aliases[index], kind: "ai", persona: seat.persona, difficulty: seat.difficulty });
    } else {
      await ctx.db.insert("members", { roundId, playerId: seat.ticket.playerId, alias: aliases[index], kind: "human" });
      await ctx.db.patch(seat.ticket._id, { status: "assigned", roundId, updatedAt: now });
      const player = players.find(player => player?._id === seat.ticket.playerId);
      await ctx.db.patch(seat.ticket.playerId, { activeRoundId: roundId, activeQueueId: seat.ticket._id,
        recentTopicIds: [...(player?.recentTopicIds ?? []), topic.id].slice(-RECENT_TOPIC_LIMIT), updatedAt: now });
    }
  }
  await ctx.scheduler.runAt(chatStartsAt, internal.lifecycle.advance, { roundId });
  await ctx.scheduler.runAt(now + 30000, internal.connections.checkRound, { roundId });
  return group.length;
}

export async function matchWaiting(ctx: MutationCtx): Promise<void> {
  const waiting = await ctx.db.query("queue").withIndex("by_status_and_joinedAt", q => q.eq("status", "waiting")).take(MAX_LOBBY * 3);
  const candidates: Doc<"queue">[] = [];
  for (const ticket of waiting) {
    const player = await ctx.db.get(ticket.playerId);
    if (player?.activeQueueId === ticket._id && !player.activeRoundId && await isOnline(ctx, player._id)) candidates.push(ticket);
  }
  if (!candidates.length) return;
  const now = Date.now();
  // Opt-in strict 1v1: a ticket flagged strictPair always seats exactly two
  // participants - a compatible waiting strict pair together, otherwise one
  // strict human with one bot. Unflagged tickets never mix into strict rooms
  // and keep the default 2-5 participant lobby rules below.
  const strict = candidates.filter(ticket => ticket.strictPair === true);
  const normal = candidates.filter(ticket => ticket.strictPair !== true);
  let seated = 0;
  if (strict.length) {
    const pair = strict.length >= 2 ? await findGroup(ctx, strict, 2) : undefined;
    if (pair) seated += await seatLobby(ctx, now, pair, 0);
    else if (botsEnabled()) {
      // A lone strict human waits one accumulate window for a strict partner
      // before a bot takes the other seat.
      const strictWaitMs = now - Math.min(...strict.map(ticket => ticket.joinedAt));
      if (strictWaitMs >= LOBBY_ACCUMULATE_WAIT_MS) seated += await seatLobby(ctx, now, [strict[0]], 1);
    }
  }
  if (normal.length) {
    const oldestWaitMs = now - Math.min(...normal.map(ticket => ticket.joinedAt));
    // Lobbies seat 2-5 participants with zero, one, or two bots chosen at
    // random. A short queue waits honestly instead of silently becoming a bot
    // room; see chooseLobby. Without a server key, rooms stay all-human.
    const sized = chooseLobby(normal.length, oldestWaitMs, Math.random());
    if (sized !== null) {
      const lobby = botsEnabled() ? sized : { humans: Math.min(normal.length, MAX_LOBBY), bots: 0 };
      const group = await findGroup(ctx, normal, lobby.humans);
      if (group) seated += await seatLobby(ctx, now, group, lobby.bots);
    }
  }
  if (seated > 0 && seated < candidates.length) await ctx.scheduler.runAfter(0, internal.matchmaking.match, {});
}

// Retried matchmaking for waiting humans whose honest wait has elapsed.
// Reschedules itself while anyone is still waiting.
export const match = internalMutation({ args: {}, returns: v.null(), handler: async ctx => {
  await matchWaiting(ctx);
  const stillWaiting = await ctx.db.query("queue").withIndex("by_status_and_joinedAt", q => q.eq("status", "waiting")).take(1);
  if (stillWaiting.length) await ctx.scheduler.runAfter(BOT_FALLBACK_WAIT_MS, internal.matchmaking.match, {});
  return null;
} });
