/** Public game API v1. Implemented by the backend-owned Convex adapter. */
export const GAME_DEFAULTS = {
  /** Lobby size bounds: matchmaking seats 2-5 participants, at least one human. */
  minParticipants: 2,
  maxParticipants: 5,
  countdownMs: 3_000,
  chatMs: 60_000,
  votingMs: 10_000,
  activePollMs: 1_000,
  maxMessageCharacters: 400,
  guessPoints: 100,
  leaderboardLimit: 50,
} as const;

export type IsoDate = string;
export type ParticipantId = string; // Round-scoped public seat ID, never a session ID.
export type HumanOrAi = "human" | "ai";
/** @deprecated Lobbies seat 2-5 participants; use plain arrays. Kept for older fixtures. */
export type Three<T> = readonly [T, T, T];
/** @deprecated See Three. */
export type Two<T> = readonly [T, T];

export interface Seat {
  id: ParticipantId;
  alias: string;
  /** Stable, role-independent cast identity (1-25), when supplied by the backend. */
  faceId?: number;
}

export interface RevealedSeat extends Seat {
  kind: HumanOrAi;
}

export interface Topic {
  id: string;
  text: string;
}

export interface ChatMessage {
  id: string;
  senderId: ParticipantId;
  text: string;
  sentAt: IsoDate;
}

export interface Guess {
  participantId: ParticipantId;
  label: HumanOrAi;
}

export type OwnBallot =
  | { status: "open" }
  | { status: "submitted"; votes: readonly Guess[]; submittedAt: IsoDate };

interface RoundBase {
  roundId: string;
  revision: number;
  serverNow: IsoDate;
  selfId: ParticipantId;
  /** 2-5 seats; composition and kinds stay hidden until the reveal. */
  participants: readonly Seat[];
}

export interface CountdownRound extends RoundBase {
  phase: "countdown";
  chatStartsAt: IsoDate;
  chatEndsAt: IsoDate;
}

export interface ChatRound extends RoundBase {
  phase: "chat";
  topic: Topic;
  messages: readonly ChatMessage[];
  chatEndsAt: IsoDate;
}

export interface VotingRound extends RoundBase {
  phase: "voting";
  topic: Topic;
  messages: readonly ChatMessage[];
  votingEndsAt: IsoDate;
  ownBallot: OwnBallot;
}

export interface Recognition {
  humanVotesReceived: number;
  humanVotesRecognisingYou: number;
  fraction: number | null; // 0..1; null when no human votes were received.
}

export interface YourRoundResult {
  ballotStatus: "submitted" | "not_submitted";
  votes: Two<Guess> | null;
  correctGuessCount: number;
  guessingPointsEarned: number; // 100 per correct classification; computed by the server.
  totalGuessingPoints: number;
  streak: number;
  recognition: Recognition;
}

export interface RevealRound extends RoundBase {
  phase: "reveal";
  participants: readonly RevealedSeat[];
  topic: Topic;
  messages: readonly ChatMessage[];
  yourResult: YourRoundResult;
}

export interface CancelledRound extends RoundBase {
  phase: "cancelled";
  reason: "participant_left" | "connection_lost" | "service_unavailable" | "room_closed";
  message: string;
}

export type RoundSnapshot = CountdownRound | ChatRound | VotingRound | RevealRound | CancelledRound;

export interface SessionView {
  serverNow: IsoDate;
  leaderboardEntryId: string; // Public score ID; not an authentication credential.
  leaderboardAlias: string;
  totalGuessingPoints: number;
  /** Legacy field name: vote/bot-reply feedback eligibility, not human-chat training permission. */
  trainingOptIn: boolean;
  /** Accepted terms version; older deployed clients may omit this field. */
  policyVersion?: string;
  /** Optional resume pointers for this player only. */
  activeRoundId?: string;
  activeQueueId?: string;
}

export type QueueTicket = {
  queueId: string;
  joinedAt: IsoDate;
  serverNow: IsoDate;
} & ({ status: "waiting" } | { status: "assigned"; roundId: string });

export interface LeaderboardEntry {
  entryId: string;
  rank: number;
  alias: string;
  guessingPoints: number;
  roundsPlayed: number;
  guessAccuracy: number | null; // 0..1 over submitted classifications.
  recognition: Recognition;
}

export interface LeaderboardView {
  generatedAt: IsoDate;
  entries: readonly LeaderboardEntry[];
}

export type ApiErrorCode =
  | "UNAUTHENTICATED" | "NOT_FOUND" | "NOT_PARTICIPANT" | "INVALID_INPUT"
  | "RATE_LIMITED" | "ALREADY_IN_ROUND" | "QUEUE_CLOSED" | "ROUND_CLOSED"
  | "VOTES_LOCKED" | "MESSAGE_BLOCKED" | "SERVICE_UNAVAILABLE";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  retryAfterMs?: number;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export interface CommandInput { clientRequestId: string }
export interface LeftResult { left: true }
export interface RecordedResult { recorded: true }

export interface CreateSessionInput extends CommandInput {
  adultConfirmed: true;
  rulesAccepted: true;
  policyVersion: string;
  trainingOptIn: boolean;
}

export interface TrainingConsentInput extends CommandInput {
  policyVersion: string;
  trainingOptIn: boolean;
}

export interface SendMessageInput extends CommandInput { text: string }
/** One guess for each of the other seats (1-4 votes depending on lobby size). */
export interface SubmitVotesInput extends CommandInput { votes: readonly Guess[] }
export type ReportReason = "harassment" | "personal_information" | "unsafe_content" | "spam" | "other";
export interface ReportInput extends CommandInput {
  participantId: ParticipantId;
  reason: ReportReason;
  messageId?: string;
  detail?: string;
}
export interface BlockInput extends CommandInput { participantId: ParticipantId }

/**
 * Opt-in strict 1v1: when strictPair is true the ticket seats exactly two
 * participants - a waiting strict pair together, otherwise one human with one
 * bot after a short grace window. Omitted/false keeps the default 2-5 lobby.
 * If no strict partner is waiting and bots are unavailable, the ticket waits
 * honestly: getQueue keeps returning status "waiting" while the player stays
 * online (no implied instant match, no timeout); if the player disconnects or
 * leaves, the ticket closes and getQueue then returns QUEUE_CLOSED.
 */
export interface JoinQueueInput extends CommandInput { strictPair?: boolean }

/** Use a mock or the shared Convex adapter; never import LLM SDKs into UI code. */
export interface GameClient {
  getSession(): Promise<ApiResult<SessionView>>;
  createSession(input: CreateSessionInput): Promise<ApiResult<SessionView>>;
  setTrainingConsent(input: TrainingConsentInput): Promise<ApiResult<SessionView>>;
  joinQueue(input: JoinQueueInput): Promise<ApiResult<QueueTicket>>;
  getQueue(queueId: string): Promise<ApiResult<QueueTicket>>;
  leaveQueue(queueId: string, input: CommandInput): Promise<ApiResult<LeftResult>>;
  getRound(roundId: string): Promise<ApiResult<RoundSnapshot>>;
  sendMessage(roundId: string, input: SendMessageInput): Promise<ApiResult<ChatMessage>>;
  submitVotes(roundId: string, input: SubmitVotesInput): Promise<ApiResult<RoundSnapshot>>;
  leaveRound(roundId: string, input: CommandInput): Promise<ApiResult<LeftResult>>;
  reportParticipant(roundId: string, input: ReportInput): Promise<ApiResult<RecordedResult>>;
  blockParticipant(roundId: string, input: BlockInput): Promise<ApiResult<LeftResult>>;
  getLeaderboard(): Promise<ApiResult<LeaderboardView>>;
}
