"use client";

import { ConvexAuthProvider, useAuthActions, type TokenStorage } from "@convex-dev/auth/react";
import { useConvex, useConvexAuth, type ConvexReactClient } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createConvexGameClient, type RealtimeGameClient } from "./game-client";
import type { ApiResult, LeaderboardView, QueueTicket, RoundSnapshot, SessionView } from "../../shared/game-contract";

type Connection = {
  status: "connecting" | "ready" | "error";
  game: RealtimeGameClient | null;
  error: string | null;
  retry: () => void;
};
const Context = createContext<Connection | null>(null);

/** Mount once above Cash's screens, with one stable SDK client. Auth stays official. */
export function AlmostHumanProvider({ client, storage, storageNamespace, children }: {
  client: ConvexReactClient;
  storage?: TokenStorage;
  storageNamespace?: string;
  children: ReactNode;
}) {
  return <ConvexAuthProvider client={client} storage={storage} storageNamespace={storageNamespace}>
    <ConnectionProvider>{children}</ConnectionProvider>
  </ConvexAuthProvider>;
}

function ConnectionProvider({ children }: { children: ReactNode }) {
  const convex = useConvex();
  // This hook is from convex/react: ready means the server acknowledged the JWT,
  // rather than merely that the Auth library has received a token.
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{ attempt: number; promise: Promise<unknown> } | null>(null);
  const previouslyAuthenticated = useRef(false);

  const retry = useCallback(() => {
    previouslyAuthenticated.current = false;
    setError(null);
    setAttempt(value => value + 1);
  }, []);

  useEffect(() => {
    if (isAuthenticated) { previouslyAuthenticated.current = true; return; }
    if (isLoading || error) return;
    if (previouslyAuthenticated.current) {
      setError("Your anonymous session ended. Retry may start a new player if this session cannot be restored.");
      return;
    }
    // One startup request per attempt, including React StrictMode's effect replay.
    if (!pending.current || pending.current.attempt !== attempt) {
      pending.current = { attempt, promise: signIn("anonymous") };
    }
    let active = true;
    void pending.current.promise.catch(() => {
      if (active) setError("Could not connect to the game. Check your connection and retry.");
    });
    return () => { active = false; };
  }, [isAuthenticated, isLoading, signIn, attempt, error]);

  useEffect(() => {
    if (isAuthenticated || error) return;
    const timeout = setTimeout(() => setError("Connecting took too long. Check your connection and retry."), 20_000);
    return () => clearTimeout(timeout);
  }, [isAuthenticated, attempt, error]);

  // No game method is exposed until the same SDK client is authenticated.
  // Its identity remains stable across ordinary renders and token refreshes.
  const game = useMemo(() => isAuthenticated
    ? createConvexGameClient(convex, async () => {}) : null, [convex, isAuthenticated]);
  const value = useMemo<Connection>(() => ({
    status: game ? "ready" : error ? "error" : "connecting",
    game, error: game ? null : error, retry,
  }), [game, error, retry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAlmostHuman(): Connection {
  const value = useContext(Context);
  if (!value) throw new Error("Wrap your screens in AlmostHumanProvider first.");
  return value;
}

type Subscribe<T> = (listener: (result: ApiResult<T>) => void) => () => void;
function useLive<T>(enabled: boolean, subscribe: Subscribe<T>): ApiResult<T> | undefined {
  const [value, setValue] = useState<{ source: Subscribe<T>; result: ApiResult<T> }>();
  useEffect(() => {
    if (!enabled) return;
    return subscribe(result => setValue({ source: subscribe, result }));
  }, [enabled, subscribe]);
  // Do not show a previous room/player's snapshot while a new watch connects.
  return enabled && value?.source === subscribe ? value.result : undefined;
}

/** Undefined means loading; ok:false is an explicit error, never mock fallback. */
export function useGameSession(): ApiResult<SessionView> | undefined {
  const { game } = useAlmostHuman();
  const subscribe = useCallback<Subscribe<SessionView>>(listener => game!.watchSession(listener), [game]);
  return useLive(Boolean(game), subscribe);
}
export function useGameQueue(queueId: string | null): ApiResult<QueueTicket> | undefined {
  const { game } = useAlmostHuman();
  const subscribe = useCallback<Subscribe<QueueTicket>>(listener => game!.watchQueue(queueId!, listener), [game, queueId]);
  return useLive(Boolean(game && queueId), subscribe);
}
export function useGameRound(roundId: string | null): ApiResult<RoundSnapshot> | undefined {
  const { game } = useAlmostHuman();
  const subscribe = useCallback<Subscribe<RoundSnapshot>>(listener => game!.watchRound(roundId!, listener), [game, roundId]);
  return useLive(Boolean(game && roundId), subscribe);
}
export function useGameLeaderboard(): ApiResult<LeaderboardView> | undefined {
  const { game } = useAlmostHuman();
  const subscribe = useCallback<Subscribe<LeaderboardView>>(listener => game!.watchLeaderboard(listener), [game]);
  return useLive(Boolean(game), subscribe);
}

/** Display only: reaching zero never submits votes or advances the round. */
export function useRoundSeconds(round: RoundSnapshot | undefined): number | null {
  const { game } = useAlmostHuman();
  const deadline = round?.phase === "countdown" ? round.chatStartsAt
    : round?.phase === "chat" ? round.chatEndsAt
      : round?.phase === "voting" ? round.votingEndsAt : null;
  const [clock, setClock] = useState<{ deadline: string; now: number }>();
  useEffect(() => {
    if (!game || !deadline) return;
    const tick = () => setClock({ deadline, now: Date.parse(game.estimatedServerNow()) });
    tick();
    const interval = setInterval(tick, 250);
    return () => clearInterval(interval);
  }, [game, deadline]);
  return deadline && clock?.deadline === deadline
    ? Math.max(0, Math.ceil((Date.parse(deadline) - clock.now) / 1000)) : null;
}
