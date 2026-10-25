import { roundTrainingAllowed } from "./learningConsent";
import { v } from "convex/values";
import { env, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { LESSONS_PER_KIND, type BotLessons } from "./botlogic";

// Round verdicts are the learning signal for two loops:
// - fast: recent passed and caught bot lines go into the next bot prompts;
// - slow: mubitConsole sends the same verdicts to Mubit as Good/Bad ratings,
//   which decide what its adapter training learns from.
// Only eligible new votes count: legacy choices or accepted standard-feedback terms.

const LESSON_CHARS = 200;
const RATING_DELAY_MS = 5000; // Mubit lists a call a few seconds after it ends.

export async function recentLessons(ctx: MutationCtx): Promise<BotLessons> {
  if (env.BOT_LESSONS_ENABLED === "false") return { passed: [], caught: [] };
  const lines = async (verdict: "passed" | "caught") => {
    const rows = await ctx.db.query("botCalls").withIndex("by_verdict_and_judgedAt", q => q.eq("verdict", verdict)).order("desc").take(LESSONS_PER_KIND * 3);
    return [...new Set(rows.map(row => row.text.slice(0, LESSON_CHARS)))].slice(0, LESSONS_PER_KIND);
  };
  return { passed: await lines("passed"), caught: await lines("caught") };
}

/** Settles each bot seat as passed (most eligible votes said human), caught
 * (most said AI) or undecided, and queues the Mubit ratings when enabled. */
export async function judgeBots(ctx: MutationCtx, round: Doc<"rounds">, members: Doc<"members">[], ballots: Doc<"ballots">[]) {
  const calls = await ctx.db.query("botCalls").withIndex("by_roundId", q => q.eq("roundId", round._id)).take(50);
  if (!calls.length) return;
  const eligibleSince = new Map<Id<"players">, number>();
  for (const member of members) {
    if (member.kind !== "human") continue;
    const player = await ctx.db.get(member.playerId);
    if (player?.trainingOptIn) eligibleSince.set(player._id, player.voteFeedbackSince ?? -Infinity);
  }
  const votes = ballots.filter(ballot => {
    const since = eligibleSince.get(ballot.playerId);
    // Snapshot eligibility at submission: acceptance later in the same millisecond
    // must never turn an earlier opted-out ballot into feedback. Historical rows
    // lack that snapshot, so use a conservative, strictly-after cutoff for them.
    return since !== undefined && (ballot.feedbackEligible ?? ballot.submittedAt > since);
  }).flatMap(ballot => ballot.votes);
  const now = Date.now();
  let toRate = 0;
  for (const bot of members) {
    if (bot.kind !== "ai") continue;
    const received = votes.filter(vote => vote.participantId === bot._id);
    if (!received.length) continue;
    const judgedHuman = received.filter(vote => vote.label === "human").length;
    const judgedAi = received.length - judgedHuman;
    const verdict = judgedHuman > judgedAi ? "passed" as const : judgedAi > judgedHuman ? "caught" as const : undefined;
    for (const call of calls) {
      if (call.memberId !== bot._id) continue;
      await ctx.db.patch(call._id, { judgedAt: now, judgedHuman, judgedAi, verdict });
      if (verdict && call.mubitRequestId && call.trainingEligible === true) toRate += 1;
    }
  }
  if (toRate && env.MUBIT_RATINGS_ENABLED === "true") {
    await ctx.scheduler.runAfter(RATING_DELAY_MS, internal.mubitConsole.rateRound, { roundId: round._id, attempt: 0 });
  }
}

export const pending = internalQuery({
  args: { roundId: v.id("rounds") },
  returns: v.array(v.object({ id: v.id("botCalls"), requestId: v.string(), rating: v.union(v.literal("up"), v.literal("down")), comment: v.string() })),
  handler: async (ctx, { roundId }) => {
    const round = await ctx.db.get(roundId);
    if (round?.chatTrainingAllowed !== true) return [];
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(8);
    const humans = members.filter(member => member.kind === "human");
    if (!humans.length || !roundTrainingAllowed(round, await Promise.all(humans.map(member => ctx.db.get(member.playerId))))) return [];
    const calls = await ctx.db.query("botCalls").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(50);
    return calls.flatMap(call => {
      if (call.trainingEligible !== true || !call.verdict || !call.mubitRequestId || call.mubitRating === "sent") return [];
      const total = (call.judgedHuman ?? 0) + (call.judgedAi ?? 0);
      const comment = call.verdict === "passed"
        ? `Passed as human: ${call.judgedHuman} of ${total} players voted human.`
        : `Found out: ${call.judgedAi} of ${total} players voted AI.`;
      return [{ id: call._id, requestId: call.mubitRequestId, rating: call.verdict === "passed" ? "up" as const : "down" as const, comment }];
    });
  },
});

export const record = internalMutation({
  args: { results: v.array(v.object({ id: v.id("botCalls"), status: v.union(v.literal("sent"), v.literal("failed"), v.literal("not_found")), servedBy: v.optional(v.string()) })) },
  returns: v.null(),
  handler: async (ctx, { results }) => {
    for (const { id, status, servedBy } of results) await ctx.db.patch(id, { mubitRating: status, ...(servedBy ? { servedBy } : {}) });
    return null;
  },
});

// Is the bot getting more human? Fooled rate = share of eligible votes on bot
// seats that said "human", over time, per serving model (provider vs Mubit
// adapter) and with vs without lessons. Run: npx convex run ratings:progress
const statV = v.object({ seats: v.number(), votes: v.number(), fooledRate: v.union(v.number(), v.null()) });
export const progress = internalQuery({
  args: { seats: v.optional(v.number()), bucket: v.optional(v.number()) },
  returns: v.object({
    configuration: v.object({ ratingsEnabled: v.boolean(), projectConfigured: v.boolean(), consoleConfigured: v.boolean() }),
    trainingEligibility: v.object({ eligible: v.number(), withheld: v.number() }),
    overall: statV,
    trend: v.array(v.object({ from: v.number(), to: v.number(), ...statV.fields })),
    byServedBy: v.array(v.object({ servedBy: v.string(), ...statV.fields })),
    byLessons: v.array(v.object({ lessons: v.string(), ...statV.fields })),
    mubitRatings: v.object({ sent: v.number(), failed: v.number(), notFound: v.number(), notSent: v.number() }),
  }),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("botCalls").withIndex("by_judgedAt", q => q.gt("judgedAt", 0)).order("desc").take(Math.min(args.seats ?? 200, 500) * 10);
    // A seat's votes are copied onto each of its lines; count each seat once.
    const seats = new Map<Id<"members">, { at: number; human: number; ai: number; servedBy: string; lessons: boolean }>();
    const ratings = { sent: 0, failed: 0, notFound: 0, notSent: 0 };
    for (const row of rows) {
      if (row.mubitRating === "sent") ratings.sent += 1;
      else if (row.mubitRating === "failed") ratings.failed += 1;
      else if (row.mubitRating === "not_found") ratings.notFound += 1;
      else if (row.verdict) ratings.notSent += 1;
      const seat = seats.get(row.memberId) ?? { at: row.judgedAt!, human: row.judgedHuman ?? 0, ai: row.judgedAi ?? 0, servedBy: "unknown", lessons: false };
      if (row.servedBy && (seat.servedBy === "unknown" || row.servedBy !== "provider")) seat.servedBy = row.servedBy;
      seat.lessons ||= row.lessonCount > 0;
      seats.set(row.memberId, seat);
    }
    const all = [...seats.values()].reverse(); // oldest first
    const stat = (group: typeof all) => {
      const human = group.reduce((sum, seat) => sum + seat.human, 0);
      const votes = group.reduce((sum, seat) => sum + seat.human + seat.ai, 0);
      return { seats: group.length, votes, fooledRate: votes ? human / votes : null };
    };
    const size = Math.max(1, args.bucket ?? 10);
    const trend = [];
    for (let i = 0; i < all.length; i += size) {
      const group = all.slice(i, i + size);
      trend.push({ from: group[0].at, to: group.at(-1)!.at, ...stat(group) });
    }
    const groupBy = (key: (seat: (typeof all)[number]) => string) => {
      const groups = new Map<string, typeof all>();
      for (const seat of all) groups.set(key(seat), [...(groups.get(key(seat)) ?? []), seat]);
      return [...groups.entries()];
    };
    return {
      configuration: { ratingsEnabled: env.MUBIT_RATINGS_ENABLED === "true", projectConfigured: Boolean(env.MUBIT_PROJECT?.trim()), consoleConfigured: Boolean(env.MUBIT_CONSOLE_COOKIE) },
      trainingEligibility: { eligible: rows.filter(row => row.trainingEligible === true).length, withheld: rows.filter(row => row.trainingEligible !== true).length },
      overall: stat(all),
      trend,
      byServedBy: groupBy(seat => seat.servedBy).map(([servedBy, group]) => ({ servedBy, ...stat(group) })),
      byLessons: groupBy(seat => seat.lessons ? "with" : "without").map(([lessons, group]) => ({ lessons, ...stat(group) })),
      mubitRatings: ratings,
    };
  },
});
