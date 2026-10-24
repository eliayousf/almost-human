import { Agent } from "@convex-dev/agent";
import { v, type Infer } from "convex/values";
import { env, internalAction, internalQuery } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { botContextV } from "./botState";
import { createMubitModel } from "./mubitModel";
import { BOT_PERSONAS, MAX_LOBBY, buildBotMessages } from "./botlogic";

export const takeTurn = internalAction({
  args: { roundId: v.id("rounds"), turn: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const context: Infer<typeof botContextV> | null = await ctx.runMutation(internal.botState.claim, args);
    if (!context) return null;
    try {
      if (!env.MUBIT_API_KEY || env.MUBIT_BOTS_ENABLED === "false") throw new Error("Bot service unavailable");
      const persona = BOT_PERSONAS[context.persona % BOT_PERSONAS.length];
      const [system, user] = buildBotMessages({
        topic: { id: "round", text: context.topic },
        selfAlias: context.alias,
        persona,
        difficulty: context.difficulty,
        participantAliases: context.aliases,
        transcript: context.transcript.map(m => ({ senderAlias: m.alias, text: m.text })),
      });
      const agent = new Agent<object, Record<string, never>>(components.agent, {
        name: "almost-human-bot", languageModel: createMubitModel(env.MUBIT_API_KEY),
        instructions: system.content,
      });
      const result = await agent.generateText(ctx, { threadId: context.threadId }, {
        prompt: user.content,
        maxOutputTokens: 384, maxRetries: 0,
      }, { contextOptions: { recentMessages: 0, searchOtherThreads: false }, storageOptions: { saveMessages: "none" } });
      // Only the transactional commit can publish a moderated reply, and only
      // while the claimed turn still belongs to an active chat window.
      await ctx.runMutation(internal.botState.commit, { ...args, text: result.text });
    } catch {
      await ctx.runMutation(internal.botState.fail, args);
    }
    return null;
  },
});

// Detection analytics, derived entirely from stored ballots and member rows:
// for each bot persona and difficulty, how often humans judged it Human.
// Internal operator view only - never part of the public API (PLAN.md keeps
// model details out of player screens).
export const performance = internalQuery({
  args: {},
  handler: async (ctx) => {
    const rounds = await ctx.db.query("rounds").order("desc").take(500);
    const settled = rounds.filter((r) => r.settled);
    const rows = new Map<string, { personaId: string; difficulty: string; votesReceived: number; judgedHuman: number; judgedAi: number; rooms: number }>();
    for (const round of settled) {
      const members = await ctx.db.query("members").withIndex("by_roundId", (q) => q.eq("roundId", round._id)).take(MAX_LOBBY + 3);
      const bots = members.filter((m) => m.kind === "ai");
      if (!bots.length) continue;
      const ballots = await ctx.db.query("ballots").withIndex("by_roundId", (q) => q.eq("roundId", round._id)).take(MAX_LOBBY + 3);
      for (const bot of bots) {
        if (bot.kind !== "ai") continue;
        const personaId = BOT_PERSONAS[bot.persona % BOT_PERSONAS.length].id;
        const key = `${personaId}:${bot.difficulty}`;
        const row = rows.get(key) ?? { personaId, difficulty: bot.difficulty, votesReceived: 0, judgedHuman: 0, judgedAi: 0, rooms: 0 };
        row.rooms += 1;
        for (const ballot of ballots) {
          for (const vote of ballot.votes) {
            if (vote.participantId !== bot._id) continue;
            row.votesReceived += 1;
            if (vote.label === "human") row.judgedHuman += 1; else row.judgedAi += 1;
          }
        }
        rows.set(key, row);
      }
    }
    return [...rows.values()].map((row) => ({ ...row, fooledRate: row.votesReceived === 0 ? null : row.judgedHuman / row.votesReceived }));
  },
});
