import { v, type Infer } from "convex/values";
import { saveMessage, listMessages } from "@convex-dev/agent";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { action, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { playerMutation, playerQuery, unauthenticated, ok, fail, iso, memberFor, sessionView, queueView, idempotent, recognition, messageAllowed, SEAT_NAMES, shuffled, POLICY_VERSION, validRequestId } from "./lib";
import { advanceRound, cancelRound } from "./lifecycle";
import { presence } from "./connections";
import { matchWaiting } from "./matchmaking";
import { BOT_FALLBACK_WAIT_MS, LOBBY_ACCUMULATE_WAIT_MS, MAX_LOBBY } from "./botlogic";
import { resultV, sessionV, queueV, roundV, messageV, leaderboardV, commandV, createSessionV, consentV, sendMessageV, submitVotesV, reportV, blockV } from "./validators";

const limiter = new RateLimiter(components.rateLimiter, {
  chat: { kind: "token bucket", rate: 45, period: MINUTE, capacity: 3 },
  queue: { kind: "token bucket", rate: 12, period: MINUTE, capacity: 5 },
  report: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 3 },
});
const leftV = resultV(v.object({ left: v.literal(true) }));
const recordedV = resultV(v.object({ recorded: v.literal(true) }));

async function roundView(ctx: QueryCtx | MutationCtx, playerId: Id<"players">, roundId: Id<"rounds">): Promise<Infer<ReturnType<typeof resultV<typeof roundV>>>> {
  const self = await memberFor(ctx, playerId, roundId);
  if (!self) return fail("NOT_PARTICIPANT", "You are not a participant in this round.");
  const round = await ctx.db.get(roundId);
  if (!round) return fail("NOT_FOUND", "This round could not be found.");
  const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(MAX_LOBBY + 3);
  const base = { roundId, revision: round.revision, serverNow: iso(round.updatedAt), selfId: self._id, participants: members.map(m => ({ id: m._id, alias: m.alias })) };
  if (round.phase === "countdown") return ok({ ...base, phase: "countdown" as const, chatStartsAt: iso(round.chatStartsAt), chatEndsAt: iso(round.chatEndsAt) });
  if (round.phase === "cancelled") return ok({ ...base, phase: "cancelled" as const, reason: round.cancelReason ?? "room_closed", message: "This round ended early. No points were awarded." });
  const stored = await listMessages(ctx, components.agent, { threadId: round.threadId, paginationOpts: { cursor: null, numItems: 240 }, excludeToolMessages: true, statuses: ["success"] });
  const messages = stored.page.reverse().flatMap(m => {
    const sender = members.find(seat => seat._id === m.userId);
    return sender ? [{ id: m._id, senderId: sender._id, text: m.text ?? "", sentAt: iso(m._creationTime) }] : [];
  });
  if (round.phase === "chat") return ok({ ...base, phase: "chat" as const, topic: round.topic, messages, chatEndsAt: iso(round.chatEndsAt) });
  if (round.phase === "voting") {
    const ballot = await ctx.db.query("ballots").withIndex("by_roundId_and_playerId", q => q.eq("roundId", roundId).eq("playerId", playerId)).unique();
    return ok({ ...base, phase: "voting" as const, topic: round.topic, messages, votingEndsAt: iso(round.votingEndsAt), ownBallot: ballot ? { status: "submitted" as const, votes: ballot.votes, submittedAt: iso(ballot.submittedAt) } : { status: "open" as const } });
  }
  const result = await ctx.db.query("results").withIndex("by_roundId_and_playerId", q => q.eq("roundId", roundId).eq("playerId", playerId)).unique();
  if (!result) return fail("SERVICE_UNAVAILABLE", "The result is still being prepared.");
  return ok({ ...base, phase: "reveal" as const, topic: round.topic, messages, participants: members.map(m => ({ id: m._id, alias: m.alias, kind: m.kind })), yourResult: result.data });
}

export const getSession = playerQuery({ args: {}, returns: resultV(sessionV), handler: async ctx => ctx.player ? ok(sessionView(ctx.player)) : unauthenticated() });
export const createSession = playerMutation({ args: { input: createSessionV }, returns: resultV(sessionV), handler: async (ctx, { input }) => {
  if (!ctx.userId) return unauthenticated();
  if (!validRequestId(input.clientRequestId) || input.policyVersion !== POLICY_VERSION) return fail("INVALID_INPUT", "Please accept the current game rules.");
  if (ctx.player) return ok(sessionView(ctx.player));
  const now = Date.now();
  const playerId = await ctx.db.insert("players", { userId: ctx.userId, alias: `${shuffled(SEAT_NAMES)[0]}-${Math.floor(Math.random() * 90000 + 10000)}`, trainingOptIn: input.trainingOptIn, policyVersion: input.policyVersion, guessingPoints: 0, roundsPlayed: 0, guessesSubmitted: 0, correctGuesses: 0, humanVotesReceived: 0, humanVotesRecognisingYou: 0, streak: 0, updatedAt: now });
  return ok(sessionView((await ctx.db.get(playerId))!));
} });
export const setTrainingConsent = playerMutation({ args: { input: consentV }, returns: resultV(sessionV), handler: async (ctx, { input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  return idempotent(ctx, player._id, "consent", input, async () => {
    if (input.policyVersion !== POLICY_VERSION) return fail("INVALID_INPUT", "Please review the current data notice.");
    await ctx.db.patch(player._id, { trainingOptIn: input.trainingOptIn, policyVersion: input.policyVersion, updatedAt: Date.now() });
    return ok(sessionView((await ctx.db.get(player._id))!));
  });
} });
export const heartbeat = playerMutation({ args: { sessionId: v.string() }, returns: resultV(v.null()), handler: async (ctx, { sessionId }) => {
  if (!ctx.player) return unauthenticated();
  if (!validRequestId(sessionId)) return fail("INVALID_INPUT", "Invalid connection identifier.");
  await presence.heartbeat(ctx, "lobby", ctx.player._id, sessionId, 10000);
  return ok(null);
} });
export const joinQueue = playerMutation({ args: { input: commandV }, returns: resultV(queueV), handler: async (ctx, { input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  return idempotent(ctx, player._id, "joinQueue", input, async () => {
    if (player.activeRoundId) return fail("ALREADY_IN_ROUND", "Finish or leave your current round first.");
    if (player.activeQueueId) {
      const ticket = await ctx.db.get(player.activeQueueId);
      if (ticket && ticket.status === "waiting") return ok(queueView(ticket));
    }
    const rate = await limiter.limit(ctx, "queue", { key: player._id });
    if (!rate.ok) return fail("RATE_LIMITED", "Please wait before joining again.", rate.retryAfter);
    const now = Date.now();
    const queueId = await ctx.db.insert("queue", { playerId: player._id, status: "waiting", joinedAt: now, updatedAt: now });
    await ctx.db.patch(player._id, { activeQueueId: queueId, updatedAt: now });
    await presence.heartbeat(ctx, "lobby", player._id, `queue-${queueId}`, 10000);
    await ctx.scheduler.runAfter(30000, internal.connections.expireQueue, { queueId });
    await ctx.scheduler.runAfter(LOBBY_ACCUMULATE_WAIT_MS, internal.matchmaking.match, {});
    await ctx.scheduler.runAfter(BOT_FALLBACK_WAIT_MS, internal.matchmaking.match, {});
    await matchWaiting(ctx);
    return ok(queueView((await ctx.db.get(queueId))!));
  });
} });
export const getQueue = playerQuery({ args: { queueId: v.id("queue") }, returns: resultV(queueV), handler: async (ctx, { queueId }) => {
  if (!ctx.player) return unauthenticated();
  const ticket = await ctx.db.get(queueId);
  if (!ticket || ticket.playerId !== ctx.player._id) return fail("NOT_FOUND", "This queue entry could not be found.");
  if (ticket.status === "closed") return fail("QUEUE_CLOSED", "You have left the queue.");
  return ok(queueView(ticket));
} });
export const leaveQueue = playerMutation({ args: { queueId: v.id("queue"), input: commandV }, returns: leftV, handler: async (ctx, { queueId, input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  return idempotent(ctx, player._id, `leaveQueue:${queueId}`, input, async () => {
    const ticket = await ctx.db.get(queueId);
    if (!ticket || ticket.playerId !== player._id) return fail("NOT_FOUND", "This queue entry could not be found.");
    if (ticket.roundId) {
      const round = await ctx.db.get(ticket.roundId);
      if (round) await cancelRound(ctx, round, "participant_left");
    }
    await ctx.db.patch(queueId, { status: "closed", updatedAt: Date.now() });
    if (player.activeQueueId === queueId) await ctx.db.patch(player._id, { activeQueueId: undefined, updatedAt: Date.now() });
    return ok({ left: true as const });
  });
} });
export const getRound = playerQuery({ args: { roundId: v.id("rounds") }, returns: resultV(roundV), handler: async (ctx, { roundId }) => ctx.player ? roundView(ctx, ctx.player._id, roundId) : unauthenticated() });
export const sendMessage = playerMutation({ args: { roundId: v.id("rounds"), input: sendMessageV }, returns: resultV(messageV), handler: async (ctx, { roundId, input }) => {
  if (!ctx.player) return unauthenticated();
  const self = await memberFor(ctx, ctx.player._id, roundId);
  if (!self || self.kind !== "human") return fail("NOT_PARTICIPANT", "You are not a participant in this round.");
  return idempotent(ctx, ctx.player._id, `sendMessage:${roundId}`, input, async () => {
    const round = await ctx.db.get(roundId);
    const now = Date.now();
    if (!round || round.phase !== "chat" || now < round.chatStartsAt || now >= round.chatEndsAt) return fail("ROUND_CLOSED", "Chat is closed for this round.");
    const text = input.text.trim();
    if (!text || [...text].length > 400) return fail("INVALID_INPUT", "Messages must contain 1 to 400 characters.");
    if (!messageAllowed(text)) return fail("MESSAGE_BLOCKED", "Keep contact details, links, and harmful content out of the chat.");
    if (round.messageCount >= 240) return fail("RATE_LIMITED", "This round has reached its message limit.");
    const rate = await limiter.limit(ctx, "chat", { key: self.playerId });
    if (!rate.ok) return fail("RATE_LIMITED", "Please slow down a little.", rate.retryAfter);
    const { messageId } = await saveMessage(ctx, components.agent, { threadId: round.threadId, userId: self._id, message: { role: "user", content: text } });
    await ctx.db.patch(roundId, { messageCount: round.messageCount + 1, revision: round.revision + 1, updatedAt: now });
    return ok({ id: messageId, senderId: self._id, text, sentAt: iso(now) });
  });
} });
export const submitVotes = playerMutation({ args: { roundId: v.id("rounds"), input: submitVotesV }, returns: resultV(roundV), handler: async (ctx, { roundId, input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  const self = await memberFor(ctx, player._id, roundId);
  if (!self) return fail("NOT_PARTICIPANT", "You are not a participant in this round.");
  return idempotent(ctx, player._id, `submitVotes:${roundId}`, input, async () => {
    await advanceRound(ctx, roundId);
    const round = await ctx.db.get(roundId);
    if (!round || round.phase !== "voting" || Date.now() >= round.votingEndsAt) return fail("ROUND_CLOSED", "Voting is closed for this round.");
    const members = await ctx.db.query("members").withIndex("by_roundId", q => q.eq("roundId", roundId)).take(MAX_LOBBY + 3);
    const others = members.filter(m => m._id !== self._id);
    if (input.votes.length !== others.length || new Set(input.votes.map(vote => vote.participantId)).size !== others.length || input.votes.some(vote => !others.some(m => m._id === vote.participantId))) return fail("INVALID_INPUT", "Guess once for each of the other players.");
    const existing = await ctx.db.query("ballots").withIndex("by_roundId_and_playerId", q => q.eq("roundId", roundId).eq("playerId", player._id)).unique();
    if (existing) return fail("VOTES_LOCKED", "Your guesses are already locked in.");
    const now = Date.now();
    await ctx.db.insert("ballots", { roundId, playerId: player._id, votes: input.votes, submittedAt: now });
    await ctx.db.patch(roundId, { revision: round.revision + 1, updatedAt: now });
    return roundView(ctx, player._id, roundId);
  });
} });
export const leaveRound = playerMutation({ args: { roundId: v.id("rounds"), input: commandV }, returns: leftV, handler: async (ctx, { roundId, input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  if (!await memberFor(ctx, player._id, roundId)) return fail("NOT_PARTICIPANT", "You are not a participant in this round.");
  return idempotent(ctx, player._id, `leaveRound:${roundId}`, input, async () => { const round = await ctx.db.get(roundId); if (round) await cancelRound(ctx, round, "participant_left"); return ok({ left: true as const }); });
} });
export const reportParticipant = playerMutation({ args: { roundId: v.id("rounds"), input: reportV }, returns: recordedV, handler: async (ctx, { roundId, input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  if (!await memberFor(ctx, player._id, roundId)) return fail("NOT_PARTICIPANT", "You are not a participant in this round.");
  return idempotent(ctx, player._id, `report:${roundId}`, input, async () => {
    const target = await ctx.db.get(input.participantId);
    if (!target || target.roundId !== roundId || (target.kind === "human" && target.playerId === player._id) || (input.detail?.length ?? 0) > 500 || (input.messageId?.length ?? 0) > 200) return fail("INVALID_INPUT", "Please select another player in this round.");
    const rate = await limiter.limit(ctx, "report", { key: player._id });
    if (!rate.ok) return fail("RATE_LIMITED", "Please wait before reporting again.", rate.retryAfter);
    await ctx.db.insert("reports", { reporterId: player._id, targetMemberId: target._id, ...(target.kind === "human" ? { targetPlayerId: target.playerId } : {}), roundId, reason: input.reason, ...(input.messageId ? { messageId: input.messageId } : {}), ...(input.detail ? { detail: input.detail } : {}), createdAt: Date.now(), status: "open" });
    return ok({ recorded: true as const });
  });
} });
export const blockParticipant = playerMutation({ args: { roundId: v.id("rounds"), input: blockV }, returns: leftV, handler: async (ctx, { roundId, input }) => {
  if (!ctx.player) return unauthenticated();
  const player = ctx.player;
  if (!await memberFor(ctx, player._id, roundId)) return fail("NOT_PARTICIPANT", "You are not a participant in this round.");
  return idempotent(ctx, player._id, `block:${roundId}`, input, async () => {
    const target = await ctx.db.get(input.participantId);
    if (!target || target.roundId !== roundId || (target.kind === "human" && target.playerId === player._id)) return fail("INVALID_INPUT", "Please select another player in this round.");
    if (target.kind === "human") {
      const existing = await ctx.db.query("blocks").withIndex("by_blockerId_and_blockedId", q => q.eq("blockerId", player._id).eq("blockedId", target.playerId)).unique();
      if (!existing) await ctx.db.insert("blocks", { blockerId: player._id, blockedId: target.playerId, createdAt: Date.now() });
    }
    const round = await ctx.db.get(roundId); if (round) await cancelRound(ctx, round, "participant_left");
    return ok({ left: true as const });
  });
} });
export const getLeaderboard = query({ args: {}, returns: resultV(leaderboardV), handler: async ctx => {
  const players = await ctx.db.query("players").withIndex("by_guessingPoints").order("desc").take(50);
  return ok({ generatedAt: iso(players.reduce((n, p) => Math.max(n, p.updatedAt), 0)), entries: players.map((p, index) => ({ entryId: p._id, rank: index + 1, alias: p.alias, guessingPoints: p.guessingPoints, roundsPlayed: p.roundsPlayed, guessAccuracy: p.guessesSubmitted ? p.correctGuesses / p.guessesSubmitted : null, recognition: recognition(p.humanVotesReceived, p.humanVotesRecognisingYou) })) });
} });
export const clockNow = action({ args: {}, returns: v.string(), handler: async () => iso(Date.now()) });
