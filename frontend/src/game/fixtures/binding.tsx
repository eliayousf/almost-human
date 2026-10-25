import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ApiResult, LeaderboardView, QueueTicket, RoundSnapshot, SessionView } from "@game/game-contract";
import type { AdapterModule, Connection, GameBinding } from "../binding";
import { FixtureGameClient } from "./client";
import { FixturePanel } from "./FixturePanel";

const FixtureContext = createContext<{ connection: Connection; client: FixtureGameClient } | null>(null);

function useFixture() {
  const value = useContext(FixtureContext);
  if (!value) throw new Error("Fixture adapter missing");
  return value;
}

type Subscribe<T> = (listener: (result: ApiResult<T>) => void) => () => void;
/** Same loading semantics as the shared hooks: undefined until the first snapshot. */
function useLive<T>(enabled: boolean, subscribe: Subscribe<T>): ApiResult<T> | undefined {
  const [value, setValue] = useState<{ source: Subscribe<T>; result: ApiResult<T> }>();
  useEffect(() => {
    if (!enabled) return;
    return subscribe(result => setValue({ source: subscribe, result }));
  }, [enabled, subscribe]);
  return enabled && value?.source === subscribe ? value.result : undefined;
}

export const binding: GameBinding = {
  mode: "fixtures",
  useConnection: () => useFixture().connection,
  useSession() {
    const { client } = useFixture();
    const subscribe = useCallback<Subscribe<SessionView>>(listener => client.watchSession(listener), [client]);
    return useLive(true, subscribe);
  },
  useQueue(queueId) {
    const { client } = useFixture();
    const subscribe = useCallback<Subscribe<QueueTicket>>(listener => client.watchQueue(queueId!, listener), [client, queueId]);
    return useLive(Boolean(queueId), subscribe);
  },
  useRound(roundId) {
    const { client } = useFixture();
    const subscribe = useCallback<Subscribe<RoundSnapshot>>(listener => client.watchRound(roundId!, listener), [client, roundId]);
    return useLive(Boolean(roundId), subscribe);
  },
  useLeaderboard() {
    const { client } = useFixture();
    const subscribe = useCallback<Subscribe<LeaderboardView>>(listener => client.watchLeaderboard(listener), [client]);
    return useLive(true, subscribe);
  },
  useRoundSeconds(round) {
    const { client } = useFixture();
    const deadline = round?.phase === "countdown" ? round.chatStartsAt
      : round?.phase === "chat" ? round.chatEndsAt
        : round?.phase === "voting" ? round.votingEndsAt : null;
    const [clock, setClock] = useState<{ deadline: string; now: number }>();
    useEffect(() => {
      if (!deadline) return;
      const tick = () => setClock({ deadline, now: Date.parse(client.estimatedServerNow()) });
      tick();
      const interval = setInterval(tick, 250);
      return () => clearInterval(interval);
    }, [client, deadline]);
    return deadline && clock?.deadline === deadline
      ? Math.max(0, Math.ceil((Date.parse(deadline) - clock.now) / 1000)) : null;
  },
};

export function Root({ children }: { children: ReactNode }) {
  const [client] = useState(() => new FixtureGameClient());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // A brief, visible "connecting" state so that screen is exercised too.
    const timer = setTimeout(() => setReady(true), 350);
    return () => clearTimeout(timer);
  }, []);
  const value = useMemo(() => ({
    client,
    connection: { status: ready ? "ready" : "connecting", game: ready ? client : null, error: null, retry: () => {} } satisfies Connection,
  }), [client, ready]);
  return <FixtureContext.Provider value={value}>
    <div className="fixture-shell">
      <FixturePanel client={client} />
      <div className="fixture-shell__app">{children}</div>
    </div>
  </FixtureContext.Provider>;
}

export default { binding, Root } satisfies AdapterModule;
