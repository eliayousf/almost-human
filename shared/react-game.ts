"use client";
/** Optional React integration; server code and LLM credentials are never imported. */
export {
  AlmostHumanProvider, useAlmostHuman, useGameSession, useGameQueue,
  useGameRound, useGameLeaderboard, useRoundSeconds,
} from "../backend/client/react-game";
