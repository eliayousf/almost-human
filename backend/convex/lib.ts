import { getAuthUserId } from "@convex-dev/auth/server";
import { customCtx, customMutation, customQuery } from "convex-helpers/server/customFunctions";
import { query, mutation, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { ApiErrorCode } from "../../shared/game-contract";

export const POLICY_VERSION = "playtest-v1";
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
  return { serverNow: iso(player.updatedAt), leaderboardEntryId: player._id, leaderboardAlias: player.alias, totalGuessingPoints: player.guessingPoints, trainingOptIn: player.trainingOptIn,
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
  { id: "restaurant", text: "Invent a terrible name for a very good restaurant." },
  { id: "talking-object", text: "What ordinary object would be terrifying if it could talk?" },
  { id: "tiny-superpower", text: "What completely useless superpower would you still enjoy having?" },
  { id: "moon-shop", text: "You are opening the first shop on the Moon. What do you sell?" },
  { id: "animal-mayor", text: "Which animal would make the worst mayor, and why?" },
  { id: "new-holiday", text: "Invent a new holiday that deserves a day off." },
];
export const SEAT_NAMES = ["Mango", "Pebble", "Orbit", "Kiwi", "Moss", "Comet", "Otter", "Clover", "Plum", "Lemon", "Robin", "Fern"];
export function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
