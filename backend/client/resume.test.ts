// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createConvexGameClient } from "./game-client";
import { chatFixture } from "../../shared/fixtures";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function sdk() {
  return {
    query: vi.fn(async () => ({ ok: true, data: chatFixture })),
    mutation: vi.fn<() => Promise<unknown>>(async () => ({ ok: true, data: null })),
    action: vi.fn<() => Promise<string>>(async () => new Date().toISOString()),
    onUpdate: vi.fn((_ref: unknown, _args: unknown, update: (value: unknown) => void) => {
      update({ ok: true, data: chatFixture }); return vi.fn();
    }),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("a stalled or failed clock does not delay a round, lose its snapshot, or stop presence", async () => {
  const transport = sdk();
  let rejectClock!: (error: Error) => void;
  transport.action.mockImplementation(() => new Promise<string>((_resolve, reject) => { rejectClock = reject; }));
  const game = createConvexGameClient(transport as unknown as Parameters<typeof createConvexGameClient>[0], async () => {});
  const listener = vi.fn();
  const stop = game.watchRound(chatFixture.roundId, listener);
  try {
    await flush();
    expect(transport.onUpdate).toHaveBeenCalledOnce();
    expect(transport.mutation).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith({ ok: true, data: chatFixture });
    expect(await game.getRound(chatFixture.roundId)).toEqual({ ok: true, data: chatFixture });
    rejectClock(new Error("private clock failure")); await flush();
    transport.action.mockRejectedValue(new Error("private clock failure"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(listener).toHaveBeenLastCalledWith({ ok: true, data: chatFixture });
    expect(transport.mutation).toHaveBeenCalledTimes(4);
  } finally { stop(); }
});

test("mobile resume and reconnect send an immediate heartbeat, and unsubscribe removes the wake listeners", async () => {
  const transport = sdk();
  const game = createConvexGameClient(transport as unknown as Parameters<typeof createConvexGameClient>[0], async () => {});
  const stop = game.watchRound(chatFixture.roundId, () => {});
  await flush();
  for (const [target, event] of [[window, "pageshow"], [window, "online"], [document, "visibilitychange"]] as const) {
    target.dispatchEvent(new Event(event)); await flush();
  }
  expect(transport.mutation).toHaveBeenCalledTimes(4);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  document.dispatchEvent(new Event("visibilitychange")); await flush();
  expect(transport.mutation).toHaveBeenCalledTimes(4);
  stop();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("online"));
  document.dispatchEvent(new Event("visibilitychange"));
  await vi.advanceTimersByTimeAsync(10_000);
  expect(transport.mutation).toHaveBeenCalledTimes(4);
});

test("an offline SDK has at most one heartbeat in flight and resumes without a queued burst", async () => {
  const transport = sdk();
  let finishHeartbeat!: (value: unknown) => void;
  transport.mutation.mockImplementationOnce(() => new Promise(resolve => { finishHeartbeat = resolve; }));
  const game = createConvexGameClient(transport as unknown as Parameters<typeof createConvexGameClient>[0], async () => {});
  const stop = game.watchRound(chatFixture.roundId, () => {});
  try {
    await flush(); await vi.advanceTimersByTimeAsync(35_000);
    window.dispatchEvent(new Event("online")); await flush();
    expect(transport.mutation).toHaveBeenCalledOnce();
    finishHeartbeat({ ok: true, data: null }); await flush();
    window.dispatchEvent(new Event("pageshow")); await flush();
    expect(transport.mutation).toHaveBeenCalledTimes(2);
  } finally { stop(); }
});
