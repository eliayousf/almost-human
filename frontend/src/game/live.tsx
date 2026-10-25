import { ConvexReactClient } from "convex/react";
import { useMemo, type ReactNode } from "react";
import {
  AlmostHumanProvider, useAlmostHuman, useGameLeaderboard, useGameQueue,
  useGameRound, useGameSession, useRoundSeconds,
} from "@game/react-game";
import type { CommandInput } from "@game/game-contract";
import type { AdapterModule, Connection, GameBinding, PlayClient } from "./binding";
import { ConfigError } from "../screens/ConfigError";

// Live adapter: the shared provider and hooks from CASH_HANDOFF.md, unmodified.
// Heartbeat, clockNow calibration, and anonymous auth are owned by that client.
const url = import.meta.env.VITE_CONVEX_URL;
const independentTabs = import.meta.env.VITE_INDEPENDENT_PLAYTEST_TABS === "true";
const convex = url ? new ConvexReactClient(url) : null;

/**
 * STRICT PAIR GATE. The deployed backend's validator rejects this field, so it
 * is sent only when VITE_STRICT_PAIR=true, which may be set only after the
 * strict backend is deployed and integration is permitted. Default: absent,
 * and joinQueue receives the plain CommandInput. The shape below is the
 * not-yet-deployed proposal's source and is not in shared/game-contract.ts.
 */
interface JoinQueueInput extends CommandInput { strictPair?: boolean }
const strictPair = import.meta.env.VITE_STRICT_PAIR === "true";

function withStrictPair(game: PlayClient): PlayClient {
  return {
    ...game,
    joinQueue: (input: CommandInput) => {
      const strict: JoinQueueInput = { ...input, strictPair: true };
      return game.joinQueue(strict);
    },
  };
}

function useConnection(): Connection {
  const connection = useAlmostHuman();
  const game = useMemo(
    () => (strictPair && connection.game ? withStrictPair(connection.game) : connection.game),
    [connection.game],
  );
  return useMemo(() => ({ ...connection, game }), [connection, game]);
}

export const binding: GameBinding = {
  mode: "live",
  useConnection,
  useSession: useGameSession,
  useQueue: useGameQueue,
  useRound: useGameRound,
  useLeaderboard: useGameLeaderboard,
  useRoundSeconds,
};

export function Root({ children }: { children: ReactNode }) {
  if (!convex) return <ConfigError />;
  return <AlmostHumanProvider client={convex} storage={independentTabs ? window.sessionStorage : undefined}>
    {children}
  </AlmostHumanProvider>;
}

export default { binding, Root } satisfies AdapterModule;
