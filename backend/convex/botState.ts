import { listMessages, saveMessage } from "@convex-dev/agent";
import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { components, internal } from "./_generated/api";
import { cancelRound } from "./lifecycle";
import { messageAllowed } from "./lib";
import { MAX_LOBBY, botTypingDelayMs } from "./botlogic";
import { BOT_MIN_TYPING_MS, BOT_TURN_BUDGET_MS, BOT_WATCHDOG_MS } from "./botTiming";
import { recentLessons } from "./ratings";

export const MAX_BOT_TURNS = 10;
export async function scheduleBotTurn(ctx: MutationCtx, round: Doc<"rounds">, turn: number, immediate = false) {
  // Two-seat replies start generating on human input; publication supplies the
  // typing delay. Larger rooms retain their existing gap between bot turns.
  const wait = immediate ? 0 : 7000 + Math.floor(Math.random() * 4000);
  if (turn < MAX_BOT_TURNS && Date.now() + wait + BOT_TURN_BUDGET_MS + BOT_MIN_TYPING_MS < round.chatEndsAt) {
    await ctx.scheduler.runAfter(wait, internal.bots.takeTurn, { roundId: round._id, turn });
  }
}

const turnArgs = { roundId: v.id("rounds"), turn: v.number() };
export const botContextV = v.object({
  memberId: v.id("members"), alias: v.string(), persona: v.number(), difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")),
  threadId: v.string(), topic: v.string(), aliases: v.array(v.string()),
  transcript: v.array(v.object({ alias: v.string(), text: v.string() })),
  lessons: v.object({ passed: v.array(v.string()), caught: v.array(v.string()) }),
});

export const claim = internalMutation({
  args: turnArgs, returns: v.union(v.null(), botContextV),
  handler: async (ctx, { roundId, turn }) => {
    const round = await ctx.db.get(roundId);
    const now = Date.now();
    if (!round || round.phase !== "chat" || now < round.chatStartsAt || now + BOT_TURN_BUDGET_MS + BOT_MIN_TYPING_MS >= round.chatEndsAt
      || !Number.isInteger(turn) || turn < 0 || turn >= MAX_BOT_TURNS
      || (round.botTurn ?? 0) !== turn || round.botPending !== undefined || round.messageCount >= 240) return null;
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(MAX_LOBBY + 3);
    const bots = members.filter(member => member.kind === "ai");
    if (!bots.length) return null;
    const bot = bots[turn % bots.length];
    const stored = await listMessages(ctx, components.agent, {
      threadId: round.threadId, paginationOpts: { cursor: null, numItems: 20 }, excludeToolMessages: true, statuses: ["success"],
    });
    const duel = members.length === 2;
    const human = members.find(member => member.kind === "human");
    const latestHumanId = stored.page.find(message => message.userId === human?._id)?._id ?? null;
    // A two-seat bot may open once, then needs human text absent from its last
    // claimed context. This also rejects duplicate or already-scheduled jobs.
    // Legacy rooms without the marker pause if the bot spoke last.
    if (duel && turn > 0 && (latestHumanId === null || latestHumanId === round.botLastHumanMessageId
      || (round.botLastHumanMessageId === undefined && stored.page[0]?.userId === bot._id))) return null;
    const transcript = stored.page.reverse().flatMap(message => {
      const sender = members.find(member => member._id === message.userId);
      return sender && message.text ? [{ alias: sender.alias, text: message.text }] : [];
    });
    // Reserve before the action calls Mubit. Duplicate scheduled deliveries
    // cannot issue another paid request for this turn.
    await ctx.db.patch(roundId, { botTurn: turn + 1, botPending: turn, ...(duel ? { botLastHumanMessageId: latestHumanId } : {}) });
    await ctx.scheduler.runAfter(BOT_WATCHDOG_MS, internal.botState.fail, { roundId, turn });
    const lessons = await recentLessons(ctx);
    return { memberId: bot._id, alias: bot.alias, persona: bot.persona, difficulty: bot.difficulty, threadId: round.threadId, topic: round.topic.text, aliases: members.map(m => m.alias), transcript, lessons };
  },
});

export const prepareReply = internalMutation({
  args: { ...turnArgs, text: v.string(), mubitRequestId: v.optional(v.string()), lessonCount: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, { roundId, turn, text, mubitRequestId, lessonCount }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.botPending !== turn) return null;
    const now = Date.now();
    if (round.phase !== "chat" || now >= round.chatEndsAt || now < round.chatStartsAt || round.messageCount >= 240) {
      await ctx.db.patch(roundId, { botPending: undefined });
      return null;
    }
    const trimmed = text.trim();
    if (!trimmed || [...trimmed].length > 400 || !messageAllowed(trimmed)) {
      await cancelRound(ctx, round, "service_unavailable");
      await ctx.db.patch(roundId, { botPending: undefined });
      return null;
    }
    const delay = botTypingDelayMs(trimmed);
    if (now + delay >= round.chatEndsAt) {
      // Never rush a reply or publish it into voting to beat the deadline.
      await ctx.db.patch(roundId, { botPending: undefined });
      return null;
    }
    // Keep the claim reserved through typing. The durable callback rechecks
    // membership, moderation and phase before exposing text to the transcript.
    await ctx.scheduler.runAfter(delay, internal.botState.commit, { roundId, turn, text: trimmed, mubitRequestId, lessonCount });
    return null;
  },
});

export const commit = internalMutation({
  args: { ...turnArgs, text: v.string(), mubitRequestId: v.optional(v.string()), lessonCount: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, { roundId, turn, text, mubitRequestId, lessonCount }) => {
    const round = await ctx.db.get(roundId);
    if (!round || round.botPending !== turn) return null;
    await ctx.db.patch(roundId, { botPending: undefined });
    const now = Date.now();
    if (round.phase !== "chat" || now >= round.chatEndsAt || now < round.chatStartsAt || round.messageCount >= 240) return null;
    const trimmed = text.trim();
    if (!trimmed || [...trimmed].length > 400 || !messageAllowed(trimmed)) {
      await cancelRound(ctx, round, "service_unavailable"); return null;
    }
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(MAX_LOBBY + 3);
    const bots = members.filter(member => member.kind === "ai");
    if (!bots.length) return null;
    const bot = bots[turn % bots.length];
    let continueTurns = members.length > 2;
    if (!continueTurns) {
      const stored = await listMessages(ctx, components.agent, {
        threadId: round.threadId, paginationOpts: { cursor: null, numItems: 20 }, excludeToolMessages: true, statuses: ["success"],
      });
      const human = members.find(member => member.kind === "human");
      const latestHumanId = stored.page.find(message => message.userId === human?._id)?._id ?? null;
      // Human text can arrive while generation is in flight. Queue that reply
      // here so it is not lost when the current bot message is published.
      continueTurns = latestHumanId !== null && latestHumanId !== round.botLastHumanMessageId;
    }
    await saveMessage(ctx, components.agent, {
      threadId: round.threadId, userId: bot._id, order: "next", message: { role: "assistant", content: trimmed },
    });
    await ctx.db.insert("botCalls", { roundId, memberId: bot._id, text: trimmed, createdAt: now, lessonCount: lessonCount ?? 0, mubitRequestId });
    await ctx.db.patch(roundId, { messageCount: round.messageCount + 1, revision: round.revision + 1, updatedAt: now });
    if (continueTurns) await scheduleBotTurn(ctx, round, turn + 1, members.length === 2);
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
