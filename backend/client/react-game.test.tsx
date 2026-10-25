// @vitest-environment happy-dom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { AlmostHumanProvider, useAlmostHuman, useGameSession } from "./react-game";

const controls = vi.hoisted(() => ({
  auth: { isLoading: false, isAuthenticated: false },
  listeners: new Set<() => void>(), signIn: vi.fn(), sdk: {} as unknown,
}));
vi.mock("convex/react", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useConvex: () => controls.sdk,
    useConvexAuth: () => useSyncExternalStore(callback => { controls.listeners.add(callback); return () => controls.listeners.delete(callback); }, () => controls.auth),
  };
});
vi.mock("@convex-dev/auth/react", () => ({
  ConvexAuthProvider: ({ children }: { children: unknown }) => children,
  useAuthActions: () => ({ signIn: controls.signIn }),
}));

let root: Root;
let host: HTMLDivElement;
let connection: ReturnType<typeof useAlmostHuman>;
let session: ReturnType<typeof useGameSession>;
let sdk: ReturnType<typeof makeSdk>;
function makeSdk() {
  let current: unknown = undefined;
  let emit: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const watched: string[] = [];
  return {
    query: vi.fn(), mutation: vi.fn(async () => ({ ok: true, data: null })),
    action: vi.fn(async () => new Date().toISOString()),
    watchQuery: vi.fn((ref: Parameters<typeof getFunctionName>[0]) => {
      watched.push(getFunctionName(ref));
      return { onUpdate: (callback: () => void) => { emit = callback; return unsubscribe; }, localQueryResult: () => current };
    }),
    update(value: unknown) { current = value; emit?.(); }, unsubscribe, watched,
  };
}
function Probe() {
  connection = useAlmostHuman();
  session = useGameSession();
  return <p>{connection.status}</p>;
}
async function mount() {
  await act(async () => {
    root.render(<StrictMode><AlmostHumanProvider client={controls.sdk as ConvexReactClient}><Probe /></AlmostHumanProvider></StrictMode>);
  });
}
async function auth(isAuthenticated: boolean, isLoading = false) {
  await act(async () => {
    controls.auth = { isAuthenticated, isLoading };
    controls.listeners.forEach(listener => listener());
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  controls.auth = { isLoading: false, isAuthenticated: false };
  controls.listeners.clear();
  controls.signIn.mockReset().mockResolvedValue({ signingIn: true });
  sdk = makeSdk(); controls.sdk = sdk;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
});

describe("Cash's React integration", () => {
  test("StrictMode starts one anonymous sign-in and exposes no game before the server acknowledges auth", async () => {
    await mount();
    expect(controls.signIn).toHaveBeenCalledExactlyOnceWith("anonymous");
    expect(connection.status).toBe("connecting");
    expect(connection.game).toBeNull();
    expect(sdk.watched).toEqual([]);
    await auth(true);
    expect(connection.status).toBe("ready");
    expect(connection.game).not.toBeNull();
    expect(sdk.watched).toContain("game:getSession");
  });

  test("restores existing auth without creating a new player and streams updated scores", async () => {
    controls.auth = { isLoading: false, isAuthenticated: true };
    await mount();
    expect(controls.signIn).not.toHaveBeenCalled();
    const game = connection.game;
    const base = { serverNow: new Date().toISOString(), leaderboardEntryId: "synthetic-player", leaderboardAlias: "Otter", totalGuessingPoints: 0, trainingOptIn: false };
    await act(async () => sdk.update({ ok: true, data: base }));
    expect(session).toEqual({ ok: true, data: base });
    await act(async () => sdk.update({ ok: true, data: { ...base, totalGuessingPoints: 200 } }));
    expect(session).toMatchObject({ ok: true, data: { totalGuessingPoints: 200 } });
    expect(connection.game).toBe(game);
    expect(sdk.mutation).not.toHaveBeenCalled(); // Session watching has no room heartbeat.
  });

  test("sanitizes sign-in failure and lets the user retry", async () => {
    controls.signIn.mockRejectedValueOnce(new Error("private-provider-error"));
    await mount();
    expect(connection.status).toBe("error");
    expect(connection.error).not.toContain("private-provider-error");
    await act(async () => connection.retry());
    expect(controls.signIn).toHaveBeenCalledTimes(2);
    await auth(true);
    expect(connection.status).toBe("ready");
    expect(connection.error).toBeNull();
  });

  test("waits for stored auth to load and does not silently replace an expired identity", async () => {
    controls.auth = { isLoading: true, isAuthenticated: false };
    await mount();
    expect(controls.signIn).not.toHaveBeenCalled();
    await auth(true);
    await auth(false);
    expect(connection.status).toBe("error");
    expect(connection.game).toBeNull();
    expect(connection.error).toContain("session ended");
    expect(controls.signIn).not.toHaveBeenCalled();
    expect(sdk.unsubscribe).toHaveBeenCalled();
    expect(session).toBeUndefined();
  });
});
