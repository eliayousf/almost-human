import { listMessages, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { cancelRound } from "./lifecycle";
import { messageAllowed } from "./lib";

export const MAX_BOT_TURNS = 10;
const turnArgs = { roundId: v.id("rounds"), turn: v.number() };
export const botContextV = v.object({
  memberId: v.id("members"), alias: v.string(), persona: v.number(), threadId: v.string(), topic: v.string(),
  transcript: v.array(v.object({ alias: v.string(), text: v.string() })),
});

export const claim = internalMutation({
  args: turnArgs, returns: v.union(v.null(), botContextV),
  handler: async (ctx, { roundId, turn }) => {
    const round = await ctx.db.get(roundId);
    const now = Date.now();
    if (!round || round.phase !== "chat" || now < round.chatStartsAt || now + 12_000 >= round.chatEndsAt
      || !Number.isInteger(turn) || turn < 0 || turn >= MAX_BOT_TURNS
      || (round.botTurn ?? 0) !== turn || round.botPending !== undefined || round.messageCount >= 240) return null;
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(3);
    const bots = members.filter(member => member.kind === "ai");
    if (!bots.length) return null;
    const bot = bots[turn % bots.length];
    const stored = await listMessages(ctx, components.agent, {
      threadId: round.threadId, paginationOpts: { cursor: null, numItems: 20 }, excludeToolMessages: true, statuses: ["success"],
    });
    const transcript = stored.page.reverse().flatMap(message => {
      const sender = members.find(member => member._id === message.userId);
      return sender && message.text ? [{ alias: sender.alias, text: message.text }] : [];
    });
    // Reserve before the action calls Mubit. Duplicate scheduled deliveries
    // cannot issue another paid request for this turn.
    await ctx.db.patch(roundId, { botTurn: turn + 1, botPending: turn });
    await ctx.scheduler.runAfter(18_000, internal.botState.fail, { roundId, turn });
    return { memberId: bot._id, alias: bot.alias, persona: bot.persona, threadId: round.threadId, topic: round.topic.text, transcript };
  },
});

export const commit = internalMutation({
  args: { ...turnArgs, text: v.string() }, returns: v.null(),
  handler: async (ctx, { roundId, turn, text }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.botPending !== turn) return null;
    await ctx.db.patch(roundId, { botPending: undefined });
    const now = Date.now();
    if (round.phase !== "chat" || now >= round.chatEndsAt || now < round.chatStartsAt || round.messageCount >= 240) return null;
    const trimmed = text.trim();
    if (!trimmed || [...trimmed].length > 400 || !messageAllowed(trimmed)) {
      await cancelRound(ctx, round, "service_unavailable"); return null;
    }
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(3);
    const bots = members.filter(member => member.kind === "ai");
    if (!bots.length) return null;
    const bot = bots[turn % bots.length];
    await saveMessage(ctx, components.agent, {
      threadId: round.threadId, userId: bot._id, order: "next", message: { role: "assistant", content: trimmed },
    });
    await ctx.db.patch(roundId, { messageCount: round.messageCount + 1, revision: round.revision + 1, updatedAt: now });
    if (turn + 1 < MAX_BOT_TURNS && now + 23_000 < round.chatEndsAt) {
      await ctx.scheduler.runAfter(7000 + Math.floor(Math.random() * 4000), internal.bots.takeTurn, { roundId, turn: turn + 1 });
    }
    return null;
  },
});

export const fail = internalMutation({
  args: turnArgs, returns: v.null(),
  handler: async (ctx, { roundId, turn }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.botPending !== turn) return null;
    await ctx.db.patch(roundId, { botPending: undefined });
    if (round.phase === "chat" && Date.now() < round.chatEndsAt) await cancelRound(ctx, round, "service_unavailable");
    return null;
  },
});
