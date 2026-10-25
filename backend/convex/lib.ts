import { chatTrainingAllowed } from "./learningConsent";
import { getAuthUserId } from "@convex-dev/auth/server";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { ApiErrorCode } from "../../shared/game-contract";
import { VOTE_FEEDBACK_TERMS_VERSION } from "../../shared/playtest-policy";

export const POLICY_VERSION = VOTE_FEEDBACK_TERMS_VERSION;
export const iso = (time: number) => new Date(time).toISOString();
export const ok = <T>(data: T) => ({ ok: true as const, data });
export const fail = (code: ApiErrorCode, message: string, retryAfterMs?: number) => ({ ok: false as const, error: { code, message, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) } });
export type Failure = ReturnType<typeof fail>;
export const unauthenticated = () => fail("UNAUTHENTICATED", "Please join the game to continue.");

async function viewer(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  const player = userId ? await ctx.db.query("players").withIndex("by_userId", q => q.eq("userId", userId)).unique() : null;
  return { userId, player };
}
export const playerQuery = customQuery(query, customCtx(viewer));
export const playerMutation = customMutation(mutation, customCtx(viewer));

export function validRequestId(id: string) { return /^[a-zA-Z0-9_-]{8,128}$/.test(id); }
export async function memberFor(ctx: QueryCtx | MutationCtx, playerId: Id<"players">, roundId: Id<"rounds">) {
  return ctx.db.query("members").withIndex("by_playerId_and_roundId", q => q.eq("playerId", playerId).eq("roundId", roundId)).unique();
}
export const recognition = (received: number, recognised: number) => ({ humanVotesReceived: received, humanVotesRecognisingYou: recognised, fraction: received === 0 ? null : recognised / received });
export function sessionView(player: Doc<"players">) {
  return { serverNow: iso(player.updatedAt), leaderboardEntryId: player._id, leaderboardAlias: player.alias, totalGuessingPoints: player.guessingPoints, trainingOptIn: player.trainingOptIn, chatTrainingOptIn: chatTrainingAllowed(player), policyVersion: player.policyVersion,
    ...(player.activeRoundId ? { activeRoundId: player.activeRoundId } : {}), ...(player.activeQueueId ? { activeQueueId: player.activeQueueId } : {}) };
}
export function queueView(ticket: Doc<"queue">) {
  const base = { queueId: ticket._id, joinedAt: iso(ticket.joinedAt), serverNow: iso(ticket.updatedAt) };
  if (ticket.status === "assigned" && ticket.roundId) return { ...base, status: "assigned" as const, roundId: ticket.roundId };
  return { ...base, status: "waiting" as const };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function idempotent<T>(ctx: MutationCtx, playerId: Id<"players">, scope: string, input: { clientRequestId: string }, run: () => Promise<T>): Promise<T | Failure> {
  if (!validRequestId(input.clientRequestId)) return fail("INVALID_INPUT", "The request identifier is invalid.");
  const fingerprint = canonical(input);
  const previous = await ctx.db.query("commands").withIndex("by_playerId_and_scope_and_requestId", q => q.eq("playerId", playerId).eq("scope", scope).eq("requestId", input.clientRequestId)).unique();
  if (previous) return previous.fingerprint === fingerprint ? JSON.parse(previous.responseJson) as T : fail("INVALID_INPUT", "This request was already used for a different action.");
  const result = await run();
  // Cache successful operations; temporary errors may be retried with the same ID.
  if ((result as { ok?: boolean }).ok === true) await ctx.db.insert("commands", { playerId, scope, requestId: input.clientRequestId, fingerprint, responseJson: JSON.stringify(result), createdAt: Date.now() });
  return result;
}

export function messageAllowed(text: string): boolean {
  // Baseline local-playtest filters, not comprehensive public-launch moderation.
  const contact = /https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b[a-z0-9-]+\.(?:com|net|org|io|gg|co\.uk)\b|(?:\+?\d[\d ()-]{6,}\d)/i;
  const abuse = /\b(?:kill yourself|kys|i will kill you|i'll kill you)\b/i;
  return !contact.test(text) && !abuse.test(text) && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
}

export const TOPICS = [
  { id: "favourite-cuisine", text: "What's your favourite cuisine and why?" },
  { id: "favourite-country", text: "What's your favourite country to travel to?" },
  { id: "proud-achievements", text: "Do you have any achievements you're proud of?" },
  { id: "sports", text: "Do you do any sports?" },
  { id: "switch-off", text: "What do you do to switch off after a long week?" },
  { id: "best-meal", text: "What's the best meal you've ever had?" },
  { id: "move-anywhere", text: "If you could move anywhere tomorrow, where would you go?" },
  { id: "best-trip", text: "What's the best trip you've ever been on?" },
  { id: "talk-for-hours", text: "What's something you could talk about for hours?" },
  { id: "age-ten-dream", text: "What did you want to be when you were 10?" },
  { id: "most-spontaneous", text: "What's the most spontaneous thing you've ever done?" },
  { id: "sunday-spending", text: "What's your favourite way to spend a Sunday?" },
  { id: "interesting-person", text: "Who's the most interesting person you've ever met?" },
  { id: "bucket-list", text: "What's something on your bucket list?" },
  { id: "best-concert-match", text: "What's the best concert or match you've ever been to?" },
  { id: "known-for", text: "What would your friends say you're known for?" },
  { id: "laugh-out-loud", text: "What's the last thing that made you laugh out loud?" },
  { id: "dinner-with-anyone", text: "If you could have dinner with anyone alive, who and why?" },
  { id: "weirdly-good", text: "What's something you're weirdly good at?" },
  { id: "best-advice", text: "What's the best advice anyone's ever given you?" },
  { id: "lottery-win", text: "How would you spend a lottery win?" },
  { id: "new-hobby", text: "What's a hobby you'd love to pick up?" },
  { id: "hated-as-kid", text: "What's a food you hated as a kid but love now?" },
  { id: "exceeded-expectations", text: "What's a place that completely exceeded your expectations?" },
  { id: "weirdest-job", text: "What's the weirdest job you've ever had?" },
  { id: "childhood-memory", text: "What's your favourite childhood memory?" },
  { id: "instant-skill", text: "If you could learn any skill instantly, what would it be?" },
  { id: "food-journey", text: "What's the longest journey you've ever done for food?" },
  { id: "kid-belief", text: "What's something you believed as a kid that turned out to be wrong?" },
  { id: "best-this-year", text: "What's the best thing that's happened to you this year?" },
  { id: "hard-way-skill", text: "What's a skill you learned the hard way?" },
  { id: "perfect-saturday", text: "What would your perfect Saturday look like?" },
  { id: "changed-mind", text: "What's something you've changed your mind about recently?" },
];
export const SEAT_NAMES = ["Mango", "Pebble", "Orbit", "Kiwi", "Moss", "Comet", "Otter", "Clover", "Plum", "Lemon", "Robin", "Fern"];
export function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
