import { createThread } from "@convex-dev/agent";
import { v } from "convex/values";
import { env, internalMutation, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { isOnline } from "./connections";
import { SEAT_NAMES, TOPICS, shuffled } from "./lib";

export function humanTargetForQueue(): 1 | 2 | 3 {
  // Existing all-human deployments remain usable until the server key is set.
  if (!env.MUBIT_API_KEY || env.MUBIT_BOTS_ENABLED === "false") return 3;
  return (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
}

export async function matchWaiting(ctx: MutationCtx): Promise<void> {
  const waiting = await ctx.db.query("queue").withIndex("by_status_and_joinedAt", q => q.eq("status", "waiting")).take(30);
  const candidates: Doc<"queue">[] = [];
  for (const ticket of waiting) {
    const player = await ctx.db.get(ticket.playerId);
    if (player?.activeQueueId === ticket._id && !player.activeRoundId && await isOnline(ctx, player._id)) candidates.push(ticket);
  }
  const compatibility = new Map<string, boolean>();
  async function incompatible(a: Id<"players">, b: Id<"players">) {
    const key = [a, b].sort().join(":");
    if (!compatibility.has(key)) compatibility.set(key, Boolean(
      await ctx.db.query("blocks").withIndex("by_blockerId_and_blockedId", q => q.eq("blockerId", a).eq("blockedId", b)).unique()
      || await ctx.db.query("blocks").withIndex("by_blockerId_and_blockedId", q => q.eq("blockerId", b).eq("blockedId", a)).unique(),
    ));
    return compatibility.get(key)!;
  }
  let group: Doc<"queue">[] | undefined;
  // Draw once per ticket, then wait for the chosen number of humans. Do not
  // quietly turn every low-traffic room into a two-bot room or reroll on retry.
  for (const anchor of candidates) {
    const target = anchor.humanTarget ?? 3;
    if (target < 3 && (!env.MUBIT_API_KEY || env.MUBIT_BOTS_ENABLED === "false")) continue;
    // Reserve arrivals for the oldest room's draw. Otherwise a later solo
    // ticket can repeatedly bypass a room that legitimately needs three humans.
    if (candidates.length < target) return;
    if (target === 1) { group = [anchor]; break; }
    const others = candidates.filter(ticket => ticket._id !== anchor._id);
    for (let b = 0; b < others.length && !group; b++) {
      if (await incompatible(anchor.playerId, others[b].playerId)) continue;
      if (target === 2) { group = [anchor, others[b]]; break; }
      for (let c = b + 1; c < others.length; c++) {
        if (!await incompatible(anchor.playerId, others[c].playerId) && !await incompatible(others[b].playerId, others[c].playerId)) {
          group = [anchor, others[b], others[c]]; break;
        }
      }
    }
    if (group) break;
  }
  if (!group) return;
  const now = Date.now();
  const threadId = await createThread(ctx, components.agent, {});
  const roundId = await ctx.db.insert("rounds", {
    phase: "countdown", revision: 1, createdAt: now, updatedAt: now,
    chatStartsAt: now + 3000, chatEndsAt: now + 123000, votingEndsAt: now + 138000,
    topic: shuffled(TOPICS)[0], threadId, messageCount: 0, settled: false, botTurn: 0,
  });
  const seats = shuffled([
    ...group.map(ticket => ({ kind: "human" as const, ticket })),
    ...Array.from({ length: 3 - group.length }, (_, persona) => ({ kind: "ai" as const, persona })),
  ]);
  const aliases = shuffled(SEAT_NAMES);
  for (const [index, seat] of seats.entries()) {
    if (seat.kind === "ai") {
      await ctx.db.insert("members", { roundId, alias: aliases[index], kind: "ai", persona: seat.persona });
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

export const match = internalMutation({ args: {}, returns: v.null(), handler: async ctx => { await matchWaiting(ctx); return null; } });
