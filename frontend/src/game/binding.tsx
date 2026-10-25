import { createContext, useContext, type ReactNode } from "react";
import type {
  ApiResult, GameClient, LeaderboardView, QueueTicket, RoundSnapshot, SessionView,
} from "@game/game-contract";

/** The subset of the shared RealtimeGameClient the screens call directly. */
export interface PlayClient extends GameClient {
  estimatedServerNow(): string;
}

export interface Connection {
  status: "connecting" | "ready" | "error";
  game: PlayClient | null;
  error: string | null;
  retry: () => void;
}

/**
 * One adapter is chosen at build time (`--mode fixtures` or `--mode live`).
 * The live binding is the shared provider's hooks verbatim; the fixture binding
 * mirrors their loading/ApiResult semantics over synthetic data.
 */
export interface GameBinding {
  mode: "fixtures" | "live";
  useConnection(): Connection;
  useSession(): ApiResult<SessionView> | undefined;
  useQueue(queueId: string | null): ApiResult<QueueTicket> | undefined;
  useRound(roundId: string | null): ApiResult<RoundSnapshot> | undefined;
  useLeaderboard(): ApiResult<LeaderboardView> | undefined;
  useRoundSeconds(round: RoundSnapshot | undefined): number | null;
}

export interface AdapterModule {
  binding: GameBinding;
  /** Mounted once above the app; owns the transport/provider. */
  Root: (props: { children: ReactNode }) => ReactNode;
}

const BindingContext = createContext<GameBinding | null>(null);
export const BindingProvider = BindingContext.Provider;

export function useBinding(): GameBinding {
  const binding = useContext(BindingContext);
  if (!binding) throw new Error("Game binding missing");
  return binding;
}

export const command = () => ({ clientRequestId: crypto.randomUUID() });
