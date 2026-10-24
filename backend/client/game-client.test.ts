import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { getFunctionName, type FunctionReference } from "convex/server";
import { createConvexGameClient } from "./game-client";
import type { ApiResult, LeaderboardView, QueueTicket } from "../../shared/game-contract";

type Sdk = Parameters<typeof createConvexGameClient>[0];
type AnyRef = FunctionReference<"query" | "mutation" | "action">;
type Subscription = {
  name: string;
  args: unknown;
  emit(value: unknown): void;
  fail(): void;
  unsubscribe: ReturnType<typeof vi.fn>;
};
const unsafeError = () => new Error("private-stack-and-provider-detail");
const unavailable = {
  ok: false,
  error: { code: "SERVICE_UNAVAILABLE", message: "The game service is unavailable. Please try again." },
};
const waiting: ApiResult<QueueTicket> = {
  ok: true, data: { queueId: "queue-one", status: "waiting", joinedAt: "2026-10-24T00:00:00.000Z", serverNow: "2000-01-01T00:00:00.000Z" },
};
const leaderboard: ApiResult<LeaderboardView> = {
  ok: true, data: { generatedAt: "2026-10-24T00:00:00.000Z", entries: [] },
};

/** Stubs implement only the official SDK surfaces used by the adapter. */
function commonSdk() {
  return {
    query: vi.fn(async (_ref: AnyRef, _args: unknown): Promise<unknown> => waiting),
    mutation: vi.fn(async (_ref: AnyRef, _args: unknown): Promise<unknown> => ({ ok: true, data: null })),
    action: vi.fn(async (_ref: AnyRef, _args: unknown): Promise<string> => new Date(Date.now() + 5_000).toISOString()),
  };
}

function nativeSdk(cached?: unknown) {
  const common = commonSdk();
  const subscriptions: Subscription[] = [];
  const onUpdate = vi.fn((ref: AnyRef, args: unknown, updated: (value: unknown) => void, failed: (error: Error) => void) => {
    const unsubscribe = vi.fn();
    subscriptions.push({ name: getFunctionName(ref), args, emit: updated, fail: () => failed(unsafeError()), unsubscribe });
    // ConvexClient itself delivers cached values to a new onUpdate listener.
    if (cached !== undefined) void Promise.resolve().then(() => updated(cached));
    return unsubscribe;
  });
  return { sdk: { ...common, onUpdate } as unknown as Sdk, ...common, onUpdate, subscriptions };
}

function reactSdk(cached?: unknown) {
  const common = commonSdk();
  const subscriptions: Subscription[] = [];
  const watchQuery = vi.fn((ref: AnyRef, args: unknown) => {
    let current = cached;
    let readError = false;
    let changed: (() => void) | undefined;
    const unsubscribe = vi.fn();
    subscriptions.push({
      name: getFunctionName(ref), args, unsubscribe,
      emit(value) { readError = false; current = value; changed?.(); },
      fail() { readError = true; changed?.(); },
    });
    return {
      onUpdate(callback: () => void) { changed = callback; return unsubscribe; },
      localQueryResult() { if (readError) throw unsafeError(); return current; },
    };
  });
  return { sdk: { ...common, watchQuery } as unknown as Sdk, ...common, watchQuery, subscriptions };
}

async function flush(): Promise<void> { await vi.advanceTimersByTimeAsync(0); }
const heartbeatCalls = (mutation: ReturnType<typeof commonSdk>["mutation"]) => mutation.mock.calls.filter(([ref]) => getFunctionName(ref) === "game:heartbeat");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T04:00:00.000Z"));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("native ConvexClient transport", () => {
  test("delivers cached and updated values with a fresh clock, and stops cleanly", async () => {
    const sdk = nativeSdk(waiting);
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const listener = vi.fn();
    const stop = game.watchQueue("queue-one", listener);
    await flush();
    expect(sdk.subscriptions[0]).toMatchObject({ name: "game:getQueue", args: { queueId: "queue-one" } });
    expect(listener).toHaveBeenCalledWith({ ...waiting, data: { ...waiting.data, serverNow: "2026-10-24T04:00:05.000Z" } });
    sdk.subscriptions[0].emit({ ok: true, data: { ...waiting.data, status: "assigned", roundId: "round-one" } });
    expect(listener.mock.lastCall?.[0]).toMatchObject({ ok: true, data: { status: "assigned", roundId: "round-one" } });
    const calls = listener.mock.calls.length;
    stop();
    expect(sdk.subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
    sdk.subscriptions[0].emit(waiting);
    sdk.subscriptions[0].fail();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(heartbeatCalls(sdk.mutation)).toHaveLength(1);
    expect(sdk.action).toHaveBeenCalledTimes(1);
  });

  test("sanitizes SDK errors and rejects unrecognized error payloads", async () => {
    const sdk = nativeSdk();
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const listener = vi.fn();
    const stop = game.watchLeaderboard(listener);
    sdk.subscriptions[0].fail();
    expect(listener).toHaveBeenLastCalledWith(unavailable);
    sdk.subscriptions[0].emit({ ok: false, error: { code: "INTERNAL_ERROR", message: "private-stack-and-provider-detail" } });
    expect(listener).toHaveBeenLastCalledWith(unavailable);
    sdk.subscriptions[0].emit({ ok: false, error: { code: "RATE_LIMITED", message: "Please wait.", retryAfterMs: 200 } });
    expect(listener).toHaveBeenLastCalledWith({ ok: false, error: { code: "RATE_LIMITED", message: "Please wait.", retryAfterMs: 200 } });
    stop();
  });
});

describe("ConvexReactClient transport", () => {
  test("reads an existing cache without requiring an update event, then follows updates", () => {
    const sdk = reactSdk(leaderboard);
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const listener = vi.fn();
    const stop = game.watchLeaderboard(listener);
    expect(sdk.subscriptions[0]).toMatchObject({ name: "game:getLeaderboard", args: {} });
    expect(listener).toHaveBeenCalledExactlyOnceWith(leaderboard);
    const newer = { ...leaderboard, data: { ...leaderboard.data, generatedAt: "2026-10-24T04:01:00.000Z" } };
    sdk.subscriptions[0].emit(newer);
    expect(listener).toHaveBeenLastCalledWith(newer);
    stop();
    expect(sdk.subscriptions[0].unsubscribe).toHaveBeenCalledOnce();
    const calls = listener.mock.calls.length;
    sdk.subscriptions[0].emit(leaderboard);
    sdk.subscriptions[0].fail();
    expect(listener).toHaveBeenCalledTimes(calls);
    expect(sdk.mutation).not.toHaveBeenCalled();
  });

  test("waits for an uncached query, sanitizes read errors, and can recover", async () => {
    const sdk = reactSdk();
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const listener = vi.fn();
    const stop = game.watchQueue("queue-one", listener);
    await flush();
    expect(listener).not.toHaveBeenCalled();
    sdk.subscriptions[0].emit(waiting);
    expect(listener.mock.lastCall?.[0]).toMatchObject({ ok: true, data: { queueId: "queue-one", serverNow: "2026-10-24T04:00:05.000Z" } });
    sdk.subscriptions[0].fail();
    expect(listener).toHaveBeenLastCalledWith(unavailable);
    sdk.subscriptions[0].emit(waiting);
    expect(listener.mock.lastCall?.[0]).toMatchObject({ ok: true, data: { status: "waiting" } });
    stop();
  });
});

describe.each(["native", "react"] as const)("%s SDK lifecycle and failures", (kind) => {
  const makeSdk = () => kind === "native" ? nativeSdk() : reactSdk();

  test("an immediate unsubscribe prevents a pending clock request from attaching a listener", async () => {
    const sdk = makeSdk();
    let resolveClock!: (value: string) => void;
    sdk.action.mockImplementation(() => new Promise<string>((resolve) => { resolveClock = resolve; }));
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const listener = vi.fn();
    const stop = game.watchQueue("queue-one", listener);
    stop();
    resolveClock("2026-10-24T04:00:00.000Z");
    await flush();
    expect(sdk.subscriptions).toHaveLength(0);
    expect(listener).not.toHaveBeenCalled();
    expect(sdk.mutation).not.toHaveBeenCalled();
  });

  test("a failed clock still allows a native subscription, while call exceptions remain safe", async () => {
    const sdk = makeSdk();
    sdk.action.mockRejectedValue(unsafeError());
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const listener = vi.fn();
    const stop = game.watchQueue("queue-one", listener);
    await flush();
    expect(sdk.subscriptions).toHaveLength(1);
    sdk.subscriptions[0].emit(waiting);
    expect(listener).toHaveBeenLastCalledWith(waiting);
    expect(await game.getSession()).toEqual(waiting); // A clock failure does not fail a healthy query.
    sdk.query.mockRejectedValue(unsafeError());
    expect(await game.getLeaderboard()).toEqual(unavailable);
    stop();
  });

  test("shares presence heartbeats across queue and round watches and stops after both leave", async () => {
    const sdk = makeSdk();
    const game = createConvexGameClient(sdk.sdk, async () => {});
    const stopQueue = game.watchQueue("queue-one", () => {});
    const stopRound = game.watchRound("round-one", () => {});
    await flush();
    expect(heartbeatCalls(sdk.mutation)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(heartbeatCalls(sdk.mutation)).toHaveLength(2);
    stopQueue();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(heartbeatCalls(sdk.mutation)).toHaveLength(3);
    stopRound();
    await vi.advanceTimersByTimeAsync(30_000);
    const beats = heartbeatCalls(sdk.mutation);
    expect(beats).toHaveLength(3);
    expect(new Set(beats.map(([, args]) => (args as { sessionId: string }).sessionId)).size).toBe(1);
    expect(sdk.subscriptions.every((subscription) => subscription.unsubscribe.mock.calls.length === 1)).toBe(true);
  });
});
