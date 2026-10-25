/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import agentTest from '@convex-dev/agent/test';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import presenceTest from '@convex-dev/presence/test';
import schema from './schema';
import { roundTrainingAllowed } from './learningConsent';
import type { Id } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import { CHAT_TRAINING_POLICY_VERSION } from '../../shared/playtest-policy';
import { createMubitModel } from './mubitModel';
import type { ApiResult } from '../../shared/game-contract';

const modules = import.meta.glob('./**/*.ts');
const command = () => ({ clientRequestId: crypto.randomUUID() });
function must<T>(result: ApiResult<T>): T { if (!result.ok) throw Error(result.error.code); return result.data; }
function init() {
  const t = convexTest(schema, modules);
  agentTest.register(t); rateLimiterTest.register(t); presenceTest.register(t);
  return t;
}
type Backend = ReturnType<typeof init>;
async function player(t: Backend, allowed = false) {
  const userId = await t.run(ctx => ctx.db.insert('users', { isAnonymous: true }));
  const client = t.withIdentity({ subject: `${userId}|synthetic-session` });
  const session = must(await client.mutation(api.game.createSession, { input: { ...command(), adultConfirmed: true, rulesAccepted: true, policyVersion: 'playtest-v2-vote-feedback', trainingOptIn: true } }));
  expect(session.chatTrainingOptIn).toBe(false);
  if (allowed) must(await client.mutation(api.game.setChatTrainingConsent, { input: { ...command(), allowed: true, policyVersion: CHAT_TRAINING_POLICY_VERSION } }));
  return { client, playerId: session.leaderboardEntryId };
}
async function solo(t: Backend, allowed: boolean) {
  const person = await player(t, allowed);
  const ticket = must(await person.client.mutation(api.game.joinQueue, { input: { ...command(), strictPair: true } }));
  await t.run(ctx => ctx.db.patch(ticket.queueId, { joinedAt: Date.now() - 9_000 }));
  await t.mutation(internal.matchmaking.match, {});
  const queue = must(await person.client.query(api.game.getQueue, { queueId: ticket.queueId }));
  if (queue.status !== 'assigned') throw Error('Not assigned');
  const round = await t.run(ctx => ctx.db.get(queue.roundId));
  vi.setSystemTime(round!.chatStartsAt);
  await t.mutation(internal.lifecycle.advance, { roundId: queue.roundId });
  return { ...person, roundId: queue.roundId };
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  vi.stubEnv('MUBIT_API_KEY', 'synthetic-key'); vi.stubEnv('MUBIT_BOTS_ENABLED', 'true');
  vi.stubEnv('MUBIT_RATINGS_ENABLED', 'true'); vi.stubEnv('MUBIT_PROJECT', 'synthetic-project');
  vi.stubEnv('MUBIT_CONSOLE_COOKIE', '__client=synthetic-cookie');
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

test('standard vote terms do not grant chat-training permission', async () => {
  const t = init(); const r = await solo(t, false);
  expect((await t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 }))?.trainingEligible).toBe(false);
  const enabling = await r.client.mutation(api.game.setChatTrainingConsent, { input: { ...command(), allowed: true, policyVersion: CHAT_TRAINING_POLICY_VERSION } });
  expect(enabling.ok).toBe(false);
  if (!enabling.ok) expect(enabling.error.code).toBe('ALREADY_IN_ROUND');
});
test('explicit consent before matching permits training, with no metadata leaked into the round', async () => {
  const t = init(); const r = await solo(t, true);
  expect((await t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 }))?.trainingEligible).toBe(true);
  const snapshot = must(await r.client.query(api.game.getRound, { roundId: r.roundId }));
  expect(JSON.stringify(snapshot)).not.toMatch(/trainingEligible|chatTraining|MUBIT|consoleConfigured/);
});
test('withdrawal blocks subsequent capture and external rating without preventing play', async () => {
  const t = init(); const r = await solo(t, true);
  const withdrawn = must(await r.client.mutation(api.game.setChatTrainingConsent, { input: { ...command(), allowed: false, policyVersion: CHAT_TRAINING_POLICY_VERSION } }));
  expect(withdrawn.chatTrainingOptIn).toBe(false);
  expect((await t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 }))?.trainingEligible).toBe(false);
  expect(await t.query(internal.ratings.pending, { roundId: r.roundId })).toEqual([]);
});
test('one nonconsenting human blocks full recording for the entire room', async () => {
  const t = init(); const r = await solo(t, true); const other = await player(t, false);
  await t.run(ctx => ctx.db.insert('members', { roundId: r.roundId, playerId: other.playerId as Id<'players'>, alias: 'Synthetic other', kind: 'human' }));
  expect((await t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 }))?.trainingEligible).toBe(false);
});
test('missing explicit project keeps recording in metadata mode', async () => {
  const t = init(); const r = await solo(t, true); vi.stubEnv('MUBIT_PROJECT', '');
  expect((await t.mutation(internal.botState.claim, { roundId: r.roundId, turn: 0 }))?.trainingEligible).toBe(false);
});
test('the gateway defaults to metadata and groups eligible calls by explicit session', async () => {
  const provider = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => Response.json({ choices: [{ message: { content: 'A synthetic answer.' }, finish_reason: 'stop' }] }));
  vi.stubGlobal('fetch', provider);
  const prompt = [{ role: 'user' as const, content: [{ type: 'text' as const, text: 'An invented question' }] }];
  await createMubitModel('synthetic-key').doGenerate({ prompt });
  expect(provider.mock.calls[0][1]?.headers).toMatchObject({ 'x-middleware-record': 'metadata' });
  await createMubitModel('synthetic-key', undefined, { mode: 'full', sessionId: 'synthetic-round' }).doGenerate({ prompt });
  const request = provider.mock.calls[1][1]!;
  expect(request.headers).toMatchObject({ 'x-middleware-record': 'full' });
  expect(JSON.parse(String(request.body)).metadata).toEqual({ session_id: 'synthetic-round' });
});

test('withdrawal and a later grant never revive training permission for an earlier room', async () => {
  const t = init(); const r = await solo(t, true);
  const round = await t.run(ctx => ctx.db.get(r.roundId));
  must(await r.client.mutation(api.game.setChatTrainingConsent, { input: { ...command(), allowed: false, policyVersion: CHAT_TRAINING_POLICY_VERSION } }));
  must(await r.client.mutation(api.game.leaveRound, { roundId: r.roundId, input: command() }));
  must(await r.client.mutation(api.game.setChatTrainingConsent, { input: { ...command(), allowed: true, policyVersion: CHAT_TRAINING_POLICY_VERSION } }));
  const current = await t.run(ctx => ctx.db.get(r.playerId as Id<'players'>));
  expect(current!.chatTrainingConsentRevision).toBe(3);
  expect(roundTrainingAllowed(round!, [current])).toBe(false);
});

test('an incompatible notice cannot enable training and replay does not reset a valid grant', async () => {
  const t = init(); const p = await player(t);
  const invalid = await p.client.mutation(api.game.setChatTrainingConsent, { input: { ...command(), allowed: true, policyVersion: 'unsupported-notice' } });
  expect(invalid.ok).toBe(false);
  expect(must(await p.client.query(api.game.getSession, {})).chatTrainingOptIn).toBe(false);
  const input = { ...command(), allowed: true, policyVersion: CHAT_TRAINING_POLICY_VERSION };
  must(await p.client.mutation(api.game.setChatTrainingConsent, { input }));
  const original = await t.run(ctx => ctx.db.get(p.playerId as Id<'players'>));
  vi.setSystemTime(Date.now() + 1_000);
  must(await p.client.mutation(api.game.setChatTrainingConsent, { input }));
  const replayed = await t.run(ctx => ctx.db.get(p.playerId as Id<'players'>));
  expect(replayed!.chatTrainingConsentRevision).toBe(original!.chatTrainingConsentRevision);
  expect(replayed!.chatTrainingAcceptedAt).toBe(original!.chatTrainingAcceptedAt);
});
