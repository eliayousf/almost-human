import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { recognition } from "./lib";
import { MAX_LOBBY } from "./botlogic";
import type { Infer } from "convex/values";
import { roundResultV } from "./validators";
import { judgeBots } from "./ratings";

export async function cancelRound(ctx: MutationCtx, round: Doc<"rounds">, reason: NonNullable<Doc<"rounds">["cancelReason"]>) {
  // A delayed scheduler must not let a late Leave erase an already-finished
  // round. Apply the authoritative deadlines before considering cancellation.
  await advanceRound(ctx, round._id);
  round = (await ctx.db.get(round._id))!;
  if (round.phase === "reveal" || round.phase === "cancelled") return;
  const now = Date.now();
  await ctx.db.patch(round._id, { phase: "cancelled", cancelReason: reason, revision: round.revision + 1, updatedAt: now });
  const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", round._id)).take(MAX_LOBBY + 3);
  for (const member of members) {
    if (member.kind !== "human") continue;
    const player = await ctx.db.get(member.playerId);
    if (player?.activeRoundId === round._id) await ctx.db.patch(player._id, { activeRoundId: undefined, activeQueueId: undefined, updatedAt: now });
  }
}

async function settle(ctx: MutationCtx, round: Doc<"rounds">) {
  if (round.settled || round.phase === "cancelled") return;
  const now = Date.now();
  const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", round._id)).take(MAX_LOBBY + 3);
  const ballots = await ctx.db.query("ballots").withIndex("by_roundId", q => q.eq("roundId", round._id)).take(MAX_LOBBY + 3);
  for (const member of members) {
    if (member.kind !== "human") continue;
    const player = await ctx.db.get(member.playerId);
    if (!player) throw new Error("Round participant missing");
    const ballot = ballots.find(b => b.playerId === member.playerId);
    const correct = ballot?.votes.filter(vote => members.find(m => m._id === vote.participantId)?.kind === vote.label).length ?? 0;
    const received = ballots.flatMap(b => b.votes).filter(vote => vote.participantId === member._id);
    const recognised = received.filter(vote => vote.label === "human").length;
    const points = correct * 100;
    const streak = correct === members.length - 1 ? player.streak + 1 : 0;
    const data: Infer<typeof roundResultV> = {
      ballotStatus: ballot ? "submitted" : "not_submitted", votes: ballot?.votes ?? null,
      correctGuessCount: correct, guessingPointsEarned: points,
      totalGuessingPoints: player.guessingPoints + points, streak,
      recognition: recognition(received.length, recognised),
    };
    await ctx.db.insert("results", { roundId: round._id, playerId: player._id, data });
    await ctx.db.patch(player._id, {
      guessingPoints: data.totalGuessingPoints, roundsPlayed: player.roundsPlayed + 1,
      guessesSubmitted: player.guessesSubmitted + (ballot ? ballot.votes.length : 0), correctGuesses: player.correctGuesses + correct,
      humanVotesReceived: player.humanVotesReceived + received.length,
      humanVotesRecognisingYou: player.humanVotesRecognisingYou + recognised,
      streak, updatedAt: now,
      ...(player.activeRoundId === round._id ? { activeRoundId: undefined, activeQueueId: undefined } : {}),
    });
  }
  await judgeBots(ctx, round, members, ballots);
  await ctx.db.patch(round._id, { phase: "reveal", settled: true, revision: round.revision + 1, updatedAt: now });
}

export async function advanceRound(ctx: MutationCtx, roundId: Id<"rounds">) {
  const round = await ctx.db.get(roundId);
  if (!round || round.phase === "reveal" || round.phase === "cancelled") return;
  const now = Date.now();
  if (now >= round.votingEndsAt) { await settle(ctx, round); return; }
  if (now >= round.chatEndsAt && round.phase !== "voting") {
    await ctx.db.patch(roundId, { phase: "voting", revision: round.revision + 1, updatedAt: now });
    await ctx.scheduler.runAt(round.votingEndsAt, internal.lifecycle.advance, { roundId });
  } else if (now >= round.chatStartsAt && round.phase === "countdown") {
    await ctx.db.patch(roundId, { phase: "chat", revision: round.revision + 1, updatedAt: now });
    await ctx.scheduler.runAt(round.chatEndsAt, internal.lifecycle.advance, { roundId });
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(MAX_LOBBY + 3);
    if (members.some(member => member.kind === "ai")) {
      await ctx.scheduler.runAfter(2000 + Math.floor(Math.random() * 2000), internal.bots.takeTurn, { roundId, turn: 0 });
    }
  }
}

export const advance = internalMutation({ args: { roundId: v.id("rounds") }, returns: v.null(), handler: async (ctx, args) => { await advanceRound(ctx, args.roundId); return null; } });
