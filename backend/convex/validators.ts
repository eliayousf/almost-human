import { v, type GenericValidator } from "convex/values";

export const labelV = v.union(v.literal("human"), v.literal("ai"));
export const phaseV = v.union(v.literal("countdown"), v.literal("chat"), v.literal("voting"), v.literal("reveal"), v.literal("cancelled"));
export const cancelReasonV = v.union(v.literal("participant_left"), v.literal("connection_lost"), v.literal("service_unavailable"), v.literal("room_closed"));
export const reportReasonV = v.union(v.literal("harassment"), v.literal("personal_information"), v.literal("unsafe_content"), v.literal("spam"), v.literal("other"));
export const commandV = v.object({ clientRequestId: v.string() });
// Opt-in strict 1v1: strictPair seats the ticket in a two-seat round only.
// Omitted/false keeps the default 2-5 participant lobby rules unchanged.
export const joinQueueV = v.object({ clientRequestId: v.string(), strictPair: v.optional(v.boolean()) });
export const createSessionV = v.object({ clientRequestId: v.string(), adultConfirmed: v.literal(true), rulesAccepted: v.literal(true), policyVersion: v.string(), trainingOptIn: v.boolean() });
export const consentV = v.object({ clientRequestId: v.string(), policyVersion: v.string(), trainingOptIn: v.boolean() });
export const chatTrainingConsentV = v.object({ clientRequestId: v.string(), allowed: v.boolean(), policyVersion: v.string() });
export const guessV = v.object({ participantId: v.id("members"), label: labelV });
export const sendMessageV = v.object({ clientRequestId: v.string(), text: v.string() });
export const submitVotesV = v.object({ clientRequestId: v.string(), votes: v.array(guessV) });
export const reportV = v.object({ clientRequestId: v.string(), participantId: v.id("members"), reason: reportReasonV, messageId: v.optional(v.string()), detail: v.optional(v.string()) });
export const blockV = v.object({ clientRequestId: v.string(), participantId: v.id("members") });

export const recognitionV = v.object({ humanVotesReceived: v.number(), humanVotesRecognisingYou: v.number(), fraction: v.union(v.number(), v.null()) });
export const seatV = v.object({ id: v.id("members"), alias: v.string(), faceId: v.optional(v.number()) });
export const topicV = v.object({ id: v.string(), text: v.string() });
export const messageV = v.object({ id: v.string(), senderId: v.id("members"), text: v.string(), sentAt: v.string() });
export const ballotV = v.union(v.object({ status: v.literal("open") }), v.object({ status: v.literal("submitted"), votes: v.array(guessV), submittedAt: v.string() }));
export const roundResultV = v.object({
  ballotStatus: v.union(v.literal("submitted"), v.literal("not_submitted")),
  votes: v.union(v.array(guessV), v.null()), correctGuessCount: v.number(),
  guessingPointsEarned: v.number(), totalGuessingPoints: v.number(), streak: v.number(), recognition: recognitionV,
});
const base = { roundId: v.id("rounds"), revision: v.number(), serverNow: v.string(), selfId: v.id("members"), participants: v.array(seatV) };
export const roundV = v.union(
  v.object({ ...base, phase: v.literal("countdown"), chatStartsAt: v.string(), chatEndsAt: v.string() }),
  v.object({ ...base, phase: v.literal("chat"), topic: topicV, messages: v.array(messageV), chatEndsAt: v.string() }),
  v.object({ ...base, phase: v.literal("voting"), topic: topicV, messages: v.array(messageV), votingEndsAt: v.string(), ownBallot: ballotV }),
  v.object({ ...base, participants: v.array(v.object({ ...seatV.fields, kind: labelV })), phase: v.literal("reveal"), topic: topicV, messages: v.array(messageV), yourResult: roundResultV }),
  v.object({ ...base, phase: v.literal("cancelled"), reason: cancelReasonV, message: v.string() }),
);
export const sessionV = v.object({
  serverNow: v.string(), leaderboardEntryId: v.id("players"), leaderboardAlias: v.string(), totalGuessingPoints: v.number(), trainingOptIn: v.boolean(), policyVersion: v.optional(v.string()), chatTrainingOptIn: v.optional(v.boolean()),
  activeRoundId: v.optional(v.id("rounds")), activeQueueId: v.optional(v.id("queue")),
});
export const queueV = v.union(
  v.object({ queueId: v.id("queue"), joinedAt: v.string(), serverNow: v.string(), status: v.literal("waiting") }),
  v.object({ queueId: v.id("queue"), joinedAt: v.string(), serverNow: v.string(), status: v.literal("assigned"), roundId: v.id("rounds") }),
);
export const leaderboardV = v.object({ generatedAt: v.string(), entries: v.array(v.object({ entryId: v.id("players"), rank: v.number(), alias: v.string(), guessingPoints: v.number(), roundsPlayed: v.number(), guessAccuracy: v.union(v.number(), v.null()), recognition: recognitionV })) });
export const errorCodeV = v.union(...(["UNAUTHENTICATED", "NOT_FOUND", "NOT_PARTICIPANT", "INVALID_INPUT", "RATE_LIMITED", "ALREADY_IN_ROUND", "QUEUE_CLOSED", "ROUND_CLOSED", "VOTES_LOCKED", "MESSAGE_BLOCKED", "SERVICE_UNAVAILABLE"] as const).map(code => v.literal(code)));
export const errorResultV = v.object({ ok: v.literal(false), error: v.object({ code: errorCodeV, message: v.string(), retryAfterMs: v.optional(v.number()) }) });
export const resultV = <T extends GenericValidator>(data: T) => v.union(v.object({ ok: v.literal(true), data }), errorResultV);
