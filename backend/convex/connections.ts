import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { cancelRound } from "./lifecycle";

export const presence = new Presence(components.presence);
export async function isOnline(ctx: MutationCtx, playerId: Id<"players">) {
  return (await presence.listUser(ctx, playerId, true, 2)).some(room => room.online);
}

export const expireQueue = internalMutation({ args: { queueId: v.id("queue") }, returns: v.null(), handler: async (ctx, { queueId }) => {
  const ticket = await ctx.db.get(queueId);
  if (!ticket || ticket.status !== "waiting") return null;
  if (await isOnline(ctx, ticket.playerId)) {
    await ctx.scheduler.runAfter(30000, internal.connections.expireQueue, { queueId });
    return null;
  }
  const player = await ctx.db.get(ticket.playerId);
  await ctx.db.patch(queueId, { status: "closed", updatedAt: Date.now() });
  if (player?.activeQueueId === queueId) await ctx.db.patch(player._id, { activeQueueId: undefined, updatedAt: Date.now() });
  return null;
} });

export const checkRound = internalMutation({ args: { roundId: v.id("rounds") }, returns: v.null(), handler: async (ctx, { roundId }) => {
  const round = await ctx.db.get(roundId);
  if (!round || round.phase === "reveal" || round.phase === "cancelled") return null;
  const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(3);
  for (const member of members) {
    if (!await isOnline(ctx, member.playerId)) { await cancelRound(ctx, round, "connection_lost"); return null; }
  }
  await ctx.scheduler.runAfter(30000, internal.connections.checkRound, { roundId });
  return null;
} });
