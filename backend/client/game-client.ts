import type { ConvexClient } from "convex/browser";
import type { ConvexReactClient } from "convex/react";
import { makeFunctionReference, type FunctionReference } from "convex/server";
import type {
  ApiErrorCode, ApiResult, ChatTrainingConsentInput, BlockInput, ChatMessage, CommandInput, CreateSessionInput,
  GameClient, LeaderboardView, LeftResult, QueueTicket, RecordedResult, ReportInput,
  RoundSnapshot, SendMessageInput, SessionView, SubmitVotesInput, TrainingConsentInput,
} from "../../shared/game-contract";

type Empty = Record<string, never>;
type Listener<T> = (result: ApiResult<T>) => void;
type Sdk = Pick<ConvexClient, "query" | "mutation" | "action" | "onUpdate">
  | Pick<ConvexReactClient, "query" | "mutation" | "action" | "watchQuery">;
type Query<Args extends Record<string, unknown>, T> = FunctionReference<"query", "public", Args, ApiResult<T>>;

const refs = {
  session: makeFunctionReference<"query", Empty, ApiResult<SessionView>>("game:getSession"),
  queue: makeFunctionReference<"query", { queueId: string }, ApiResult<QueueTicket>>("game:getQueue"),
  round: makeFunctionReference<"query", { roundId: string }, ApiResult<RoundSnapshot>>("game:getRound"),
  leaderboard: makeFunctionReference<"query", Empty, ApiResult<LeaderboardView>>("game:getLeaderboard"),
  createSession: makeFunctionReference<"mutation", { input: CreateSessionInput }, ApiResult<SessionView>>("game:createSession"),
  consent: makeFunctionReference<"mutation", { input: TrainingConsentInput }, ApiResult<SessionView>>("game:setTrainingConsent"),
  chatConsent: makeFunctionReference<"mutation", { input: ChatTrainingConsentInput }, ApiResult<SessionView>>("game:setChatTrainingConsent"),
  joinQueue: makeFunctionReference<"mutation", { input: CommandInput }, ApiResult<QueueTicket>>("game:joinQueue"),
  leaveQueue: makeFunctionReference<"mutation", { queueId: string; input: CommandInput }, ApiResult<LeftResult>>("game:leaveQueue"),
  setTyping: makeFunctionReference<"mutation", { roundId: string; typing: boolean }, ApiResult<null>>("game:setTyping"),
  sendMessage: makeFunctionReference<"mutation", { roundId: string; input: SendMessageInput }, ApiResult<ChatMessage>>("game:sendMessage"),
  submitVotes: makeFunctionReference<"mutation", { roundId: string; input: SubmitVotesInput }, ApiResult<RoundSnapshot>>("game:submitVotes"),
  leaveRound: makeFunctionReference<"mutation", { roundId: string; input: CommandInput }, ApiResult<LeftResult>>("game:leaveRound"),
  report: makeFunctionReference<"mutation", { roundId: string; input: ReportInput }, ApiResult<RecordedResult>>("game:reportParticipant"),
  block: makeFunctionReference<"mutation", { roundId: string; input: BlockInput }, ApiResult<LeftResult>>("game:blockParticipant"),
  heartbeat: makeFunctionReference<"mutation", { sessionId: string }, ApiResult<null>>("game:heartbeat"),
  clock: makeFunctionReference<"action", Empty, string>("game:clockNow"),
};

const errorCodes = new Set<ApiErrorCode>([
  "UNAUTHENTICATED", "NOT_FOUND", "NOT_PARTICIPANT", "INVALID_INPUT", "RATE_LIMITED",
  "ALREADY_IN_ROUND", "QUEUE_CLOSED", "ROUND_CLOSED", "VOTES_LOCKED", "MESSAGE_BLOCKED",
  "SERVICE_UNAVAILABLE",
]);

function unavailable<T>(): ApiResult<T> {
  return { ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "The game service is unavailable. Please try again." } };
}

/** Never expose an SDK exception, stack trace, or server internals to the UI. */
function safeResult<T>(value: ApiResult<T>): ApiResult<T> {
  if (value?.ok === true) return value;
  if (value?.ok === false && errorCodes.has(value.error?.code) && typeof value.error.message === "string") {
    return {
      ok: false,
      error: {
        code: value.error.code,
        message: value.error.message,
        ...(typeof value.error.retryAfterMs === "number" && value.error.retryAfterMs >= 0
          ? { retryAfterMs: value.error.retryAfterMs } : {}),
      },
    };
  }
  return unavailable();
}

export interface RealtimeGameClient extends GameClient {
  watchSession(listener: Listener<SessionView>): () => void;
  watchRound(roundId: string, listener: Listener<RoundSnapshot>): () => void;
  watchQueue(queueId: string, listener: Listener<QueueTicket>): () => void;
  watchLeaderboard(listener: Listener<LeaderboardView>): () => void;
  /** A fresh action avoids treating a cached reactive query's Date.now as live time. */
  refreshClock(): Promise<void>;
  estimatedServerNow(): string;
}

/**
 * Browser-safe, framework-neutral transport. The application's official Convex
 * Auth integration owns authentication and token refresh. This adapter stores no
 * credential and does not create its own session/authentication mechanism.
 */
export function createConvexGameClient(
  convex: Sdk,
  ensureAnonymous: () => Promise<void>,
): RealtimeGameClient {
  let clockOffsetMs = 0;
  let hasClock = false;
  let clockInFlight: Promise<void> | undefined;
  const heartbeatSessionId = crypto.randomUUID();
  let heartbeatWatchers = 0;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let heartbeatInFlight: Promise<void> | undefined;

  function heartbeat(): Promise<void> {
    // The SDK queues mutations while offline. Keep one outstanding beat rather
    // than accumulating a burst during a mobile suspension or reconnect.
    return heartbeatInFlight ??= (async () => {
      try { await convex.mutation(refs.heartbeat, { sessionId: heartbeatSessionId }); }
      catch { /* Native subscriptions expose connection errors; the next beat retries. */ }
    })().finally(() => { heartbeatInFlight = undefined; });
  }

  function resumePresence(): void {
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    void heartbeat();
    void refreshClock().catch(() => undefined);
  }

  function keepPresent(): () => void {
    heartbeatWatchers++;
    if (heartbeatWatchers === 1) {
      void heartbeat();
      heartbeatTimer = setInterval(() => { void heartbeat(); }, 10_000);
      if (typeof window !== "undefined" && typeof document !== "undefined") {
        window.addEventListener("online", resumePresence);
        window.addEventListener("pageshow", resumePresence);
        document.addEventListener("visibilitychange", resumePresence);
      }
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      heartbeatWatchers--;
      if (heartbeatWatchers === 0 && heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;
        if (typeof window !== "undefined" && typeof document !== "undefined") {
          window.removeEventListener("online", resumePresence);
          window.removeEventListener("pageshow", resumePresence);
          document.removeEventListener("visibilitychange", resumePresence);
        }
      }
    };
  }

  function refreshClock(): Promise<void> {
    if (clockInFlight) return clockInFlight;
    const startedAt = Date.now();
    clockInFlight = (async () => {
      const serverTime = Date.parse(await convex.action(refs.clock, {}));
      const completedAt = Date.now();
      if (!Number.isFinite(serverTime)) throw new Error("Invalid server clock");
      clockOffsetMs = serverTime - (startedAt + completedAt) / 2;
      hasClock = true;
    })().finally(() => { clockInFlight = undefined; });
    return clockInFlight;
  }

  function estimatedServerNow(): string {
    return new Date(Date.now() + clockOffsetMs).toISOString();
  }

  function stamp<T>(result: ApiResult<T>): ApiResult<T> {
    const safe = safeResult(result);
    if (safe.ok && hasClock && typeof safe.data === "object" && safe.data !== null && "serverNow" in safe.data) {
      return { ok: true, data: { ...safe.data, serverNow: estimatedServerNow() } };
    }
    return safe;
  }

  async function call<T>(work: () => Promise<ApiResult<T>>, syncClock = false): Promise<ApiResult<T>> {
    try {
      if (syncClock) void refreshClock().catch(() => undefined);
      return stamp(await work());
    } catch {
      return unavailable();
    }
  }

  function watch<Args extends Record<string, unknown>, T>(
    ref: Query<Args, T>, args: Args, listener: Listener<T>, syncClock: boolean,
  ): () => void {
    let active = true;
    let stopQuery: (() => void) | undefined;
    let stopPresence: (() => void) | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let latest: ApiResult<T> | undefined;
    void (async () => {
      try {
        // Calibration can stall during reconnects. It must not hold up the
        // subscription or presence, or replace the current round on failure.
        if (syncClock) {
          void refreshClock().then(() => {
            if (active && latest) listener(stamp(latest));
          }).catch(() => undefined);
          await Promise.resolve(); // Allow immediate unsubscribe before setup.
        }
        if (!active) return;
        if (syncClock) stopPresence = keepPresent();
        const updated = (result: ApiResult<T>) => {
          latest = result;
          if (active) listener(stamp(result));
        };
        const failed = () => { if (active) listener(unavailable()); };
        if ("onUpdate" in convex) {
          stopQuery = convex.onUpdate(ref, args, updated, failed);
        } else {
          // Convex Auth's React provider owns a ConvexReactClient. Its native
          // watch API differs from the framework-neutral ConvexClient API.
          const queryWatch = convex.watchQuery(
            ref as Query<Record<string, unknown>, T>, args,
          );
          const read = () => {
            try { const result = queryWatch.localQueryResult(); if (result !== undefined) updated(result); }
            catch { failed(); }
          };
          stopQuery = queryWatch.onUpdate(read);
          read(); // A cached result need not trigger a new update callback.
        }
        if (syncClock) {
          timer = setInterval(() => {
            void refreshClock().then(() => {
              if (active && latest) listener(stamp(latest));
            }).catch(() => undefined);
          }, 30_000);
        }
      } catch {
        stopPresence?.();
        stopPresence = undefined;
        if (active) listener(unavailable());
      }
    })();
    return () => {
      active = false;
      stopQuery?.();
      stopPresence?.();
      if (timer) clearInterval(timer);
    };
  }

  return {
    getSession: () => call(() => convex.query(refs.session, {}), true),
    createSession: (input) => call(async () => {
      await ensureAnonymous();
      void refreshClock().catch(() => undefined);
      const result = await convex.mutation(refs.createSession, { input });
      if (result.ok) await heartbeat();
      return result;
    }),
    setChatTrainingConsent: (input) => call(() => convex.mutation(refs.chatConsent, { input })),
    setTrainingConsent: (input) => call(() => convex.mutation(refs.consent, { input })),
    joinQueue: (input) => call(() => convex.mutation(refs.joinQueue, { input })),
    getQueue: (queueId) => call(() => convex.query(refs.queue, { queueId }), true),
    leaveQueue: (queueId, input) => call(() => convex.mutation(refs.leaveQueue, { queueId, input })),
    getRound: (roundId) => call(() => convex.query(refs.round, { roundId }), true),
    setTyping: (roundId, typing) => call(() => convex.mutation(refs.setTyping, { roundId, typing })),
    sendMessage: (roundId, input) => call(() => convex.mutation(refs.sendMessage, { roundId, input })),
    submitVotes: (roundId, input) => call(() => convex.mutation(refs.submitVotes, { roundId, input })),
    leaveRound: (roundId, input) => call(() => convex.mutation(refs.leaveRound, { roundId, input })),
    reportParticipant: (roundId, input) => call(() => convex.mutation(refs.report, { roundId, input })),
    blockParticipant: (roundId, input) => call(() => convex.mutation(refs.block, { roundId, input })),
    getLeaderboard: () => call(() => convex.query(refs.leaderboard, {})),
    watchSession: (listener) => watch(refs.session, {}, listener, false),
    watchRound: (roundId, listener) => watch(refs.round, { roundId }, listener, true),
    watchQueue: (queueId, listener) => watch(refs.queue, { queueId }, listener, true),
    watchLeaderboard: (listener) => watch(refs.leaderboard, {}, listener, false),
    refreshClock,
    estimatedServerNow,
  };
}
