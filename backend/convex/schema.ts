import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";
import { cancelReasonV, guessV, phaseV, reportReasonV, roundResultV, topicV } from "./validators";

export default defineSchema({
  ...authTables,
  players: defineTable({
    userId: v.id("users"), alias: v.string(), trainingOptIn: v.boolean(), policyVersion: v.string(),
    // Versioned terms acceptance and prospective vote eligibility; no bulk opt-in migration.
    chatTrainingConsentRevision: v.optional(v.number()), chatTrainingOptIn: v.optional(v.boolean()), chatTrainingPolicyVersion: v.optional(v.string()), chatTrainingAcceptedAt: v.optional(v.number()),
    termsAcceptedAt: v.optional(v.number()), voteFeedbackSince: v.optional(v.number()),
    recentTopicIds: v.optional(v.array(v.string())),
    guessingPoints: v.number(), roundsPlayed: v.number(), guessesSubmitted: v.number(), correctGuesses: v.number(),
    humanVotesReceived: v.number(), humanVotesRecognisingYou: v.number(), streak: v.number(), updatedAt: v.number(),
    activeRoundId: v.optional(v.id("rounds")), activeQueueId: v.optional(v.id("queue")),
  }).index("by_userId", ["userId"]).index("by_guessingPoints", ["guessingPoints"]),
  queue: defineTable({ playerId: v.id("players"), status: v.union(v.literal("waiting"), v.literal("assigned"), v.literal("closed")), joinedAt: v.number(), updatedAt: v.number(), roundId: v.optional(v.id("rounds")), strictPair: v.optional(v.boolean()) })
    .index("by_status_and_joinedAt", ["status", "joinedAt"]).index("by_playerId_and_status", ["playerId", "status"]),
  rounds: defineTable({
    phase: phaseV, revision: v.number(), createdAt: v.number(), updatedAt: v.number(), chatStartsAt: v.number(), chatEndsAt: v.number(), votingEndsAt: v.number(),
    topic: topicV, threadId: v.string(), messageCount: v.number(), settled: v.boolean(), cancelReason: v.optional(cancelReasonV),
    typingRoomToken: v.optional(v.string()),
    chatTrainingAllowed: v.optional(v.boolean()), chatTrainingConsents: v.optional(v.array(v.object({ playerId: v.id("players"), revision: v.number() }))),
    botTurn: v.optional(v.number()), botPending: v.optional(v.number()),
    // Latest human message included in a claimed two-seat turn; null for an opener.
    botLastHumanMessageId: v.optional(v.union(v.string(), v.null())),
  }).index("by_phase_and_createdAt", ["phase", "createdAt"]),
  members: defineTable(v.union(
    v.object({ roundId: v.id("rounds"), playerId: v.id("players"), alias: v.string(), kind: v.literal("human") }),
    v.object({ roundId: v.id("rounds"), alias: v.string(), kind: v.literal("ai"), persona: v.number(), difficulty: v.union(v.literal("easy"), v.literal("medium"), v.literal("hard")) }),
  ))
    .index("by_roundId", ["roundId"]).index("by_playerId_and_roundId", ["playerId", "roundId"]),
  // One row per published bot line: its Mubit call, the room's verdict on the
  // seat (training-opted-in votes only) and what Mubit reported about the call.
  botCalls: defineTable({
    roundId: v.id("rounds"), memberId: v.id("members"), text: v.string(), createdAt: v.number(), lessonCount: v.number(),
    trainingEligible: v.optional(v.boolean()),
    mubitRequestId: v.optional(v.string()),
    judgedAt: v.optional(v.number()), judgedHuman: v.optional(v.number()), judgedAi: v.optional(v.number()),
    verdict: v.optional(v.union(v.literal("passed"), v.literal("caught"))),
    mubitRating: v.optional(v.union(v.literal("sent"), v.literal("failed"), v.literal("not_found"))),
    servedBy: v.optional(v.string()),
  }).index("by_roundId", ["roundId"]).index("by_verdict_and_judgedAt", ["verdict", "judgedAt"]).index("by_judgedAt", ["judgedAt"]),
  ballots: defineTable({ roundId: v.id("rounds"), playerId: v.id("players"), votes: v.array(guessV), submittedAt: v.number(), feedbackEligible: v.optional(v.boolean()) })
    .index("by_roundId", ["roundId"]).index("by_roundId_and_playerId", ["roundId", "playerId"]),
  results: defineTable({ roundId: v.id("rounds"), playerId: v.id("players"), data: roundResultV })
    .index("by_roundId_and_playerId", ["roundId", "playerId"]),
  commands: defineTable({ playerId: v.id("players"), scope: v.string(), requestId: v.string(), fingerprint: v.string(), responseJson: v.string(), createdAt: v.number() })
    .index("by_playerId_and_scope_and_requestId", ["playerId", "scope", "requestId"]),
  blocks: defineTable({ blockerId: v.id("players"), blockedId: v.id("players"), createdAt: v.number() })
    .index("by_blockerId_and_blockedId", ["blockerId", "blockedId"]).index("by_blockerId", ["blockerId"]),
  reports: defineTable({ reporterId: v.id("players"), targetPlayerId: v.optional(v.id("players")), targetMemberId: v.optional(v.id("members")), roundId: v.id("rounds"), reason: reportReasonV, messageId: v.optional(v.string()), detail: v.optional(v.string()), createdAt: v.number(), status: v.union(v.literal("open"), v.literal("closed")) })
    .index("by_status_and_createdAt", ["status", "createdAt"]),
});
