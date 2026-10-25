import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { roundTrainingAllowed } from "./learningConsent";

/** Admin-only, single-round proof. No cookie, global capture switch or public API. */
export const authorizeRound = internalMutation({
  args: { roundId: v.id("rounds"), expectedPlayerId: v.id("players") },
  returns: v.object({ turn: v.number(), expiresAt: v.number() }),
  handler: async (ctx, { roundId, expectedPlayerId }) => {
    const round = await ctx.db.get(roundId);
    const now = Date.now();
    if (!round || round.phase !== "countdown" || now >= round.chatStartsAt || round.reviewCapture) {
      throw new Error("Capture must be authorized once, before the test round starts.");
    }
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(8);
    const humans = members.filter(member => member.kind === "human");
    if (members.length !== 2 || humans.length !== 1 || humans[0].playerId !== expectedPlayerId
      || !members.some(member => member.kind === "ai")) throw new Error("Expected the named test player and one bot.");
    if (!roundTrainingAllowed(round, [await ctx.db.get(expectedPlayerId)])) throw new Error("Pre-round chat-training permission is required.");
    // Only the first turn, at most two HTTP attempts under the existing retry cap.
    const grant = { turn: 0, expiresAt: Math.min(round.chatEndsAt, now + 90_000) };
    await ctx.db.patch(roundId, { reviewCapture: grant });
    return grant;
  },
});

export const revokeRound = internalMutation({
  args: { roundId: v.id("rounds") }, returns: v.null(),
  handler: async (ctx, { roundId }) => {
    const round = await ctx.db.get(roundId);
    // Retain the grant as an audit marker; expiry zero prevents reauthorization.
    if (round?.reviewCapture) await ctx.db.patch(roundId, { reviewCapture: { ...round.reviewCapture, expiresAt: 0 } });
    return null;
  },
});
