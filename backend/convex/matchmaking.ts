import { createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isOnline } from "./connections";
import { SEAT_NAMES, TOPICS, shuffled } from "./lib";
import { BOT_DIFFICULTIES, BOT_FALLBACK_WAIT_MS, BOT_PERSONAS, MAX_LOBBY, chooseLobby } from "./botlogic";

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

export async function matchWaiting(ctx: MutationCtx): Promise<void> {
  const waiting = await ctx.db.query("queue").withIndex("by_status_and_joinedAt", q => q.eq("status", "waiting")).take(MAX_LOBBY * 3);
  const candidates: Doc<"queue">[] = [];
  for (const ticket of waiting) {
    const player = await ctx.db.get(ticket.playerId);
    if (player?.activeQueueId === ticket._id && !player.activeRoundId && await isOnline(ctx, player._id)) candidates.push(ticket);
  }
  if (!candidates.length) return;
  const now = Date.now();
  const oldestWaitMs = now - Math.min(...candidates.map(ticket => ticket.joinedAt));
  // Lobbies seat 2-5 participants with zero, one, or two bots chosen at
  // random. A short queue waits honestly instead of silently becoming a bot
  // room; see chooseLobby. Without a server key, rooms stay all-human.
  const sized = chooseLobby(candidates.length, oldestWaitMs, Math.random());
  if (sized === null) return;
  const lobby = botsEnabled() ? sized : { humans: Math.min(candidates.length, MAX_LOBBY), bots: 0 };
  const group = await findGroup(ctx, candidates, lobby.humans);
  if (!group) return;
  const threadId = await createThread(ctx, components.agent, {});
  const roundId = await ctx.db.insert("rounds", {
    phase: "countdown", revision: 1, createdAt: now, updatedAt: now,
    chatStartsAt: now + 3000, chatEndsAt: now + 123000, votingEndsAt: now + 138000,
    topic: shuffled(TOPICS)[0], threadId, messageCount: 0, settled: false, botTurn: 0,
  });
  const seats = shuffled([
    ...group.map(ticket => ({ kind: "human" as const, ticket })),
    ...Array.from({ length: lobby.bots }, () => ({
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
      await ctx.db.patch(seat.ticket.playerId, { activeRoundId: roundId, activeQueueId: seat.ticket._id, updatedAt: now });
    }
  }
  await ctx.scheduler.runAt(now + 3000, internal.lifecycle.advance, { roundId });
  await ctx.scheduler.runAt(now + 30000, internal.connections.checkRound, { roundId });
  if (candidates.length > group.length) await ctx.scheduler.runAfter(0, internal.matchmaking.match, {});
}

// Retried matchmaking for waiting humans whose honest wait has elapsed.
// Reschedules itself while anyone is still waiting.
export const match = internalMutation({ args: {}, returns: v.null(), handler: async ctx => {
  await matchWaiting(ctx);
  const stillWaiting = await ctx.db.query("queue").withIndex("by_status_and_joinedAt", q => q.eq("status", "waiting")).take(1);
  if (stillWaiting.length) await ctx.scheduler.runAfter(BOT_FALLBACK_WAIT_MS, internal.matchmaking.match, {});
  return null;
} });
