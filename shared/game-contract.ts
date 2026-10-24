/** Proposed public API v1. No backend implementation exists yet. */
export const GAME_DEFAULTS = {
  participants: 3,
  countdownMs: 3_000,
  chatMs: 120_000,
  votingMs: 15_000,
  activePollMs: 1_000,
  maxMessageCharacters: 400,
  guessPoints: 100,
  leaderboardLimit: 50,
} as const;

export type IsoDate = string;
export type ParticipantId = string; // Round-scoped public seat ID, never a session ID.
export type HumanOrAi = "human" | "ai";
export type Three<T> = readonly [T, T, T];
export type Two<T> = readonly [T, T];

export interface Seat {
  id: ParticipantId;
  alias: string;
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
  | { status: "submitted"; votes: Two<Guess>; submittedAt: IsoDate };

interface RoundBase {
  roundId: string;
  revision: number;
  serverNow: IsoDate;
  selfId: ParticipantId;
  participants: Three<Seat>;
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
  correctGuessCount: 0 | 1 | 2;
  guessingPointsEarned: number; // 0, 100, or 200; computed by the server.
  totalGuessingPoints: number;
  streak: number;
  recognition: Recognition;
}

export interface RevealRound extends RoundBase {
  phase: "reveal";
  participants: Three<RevealedSeat>;
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
  trainingOptIn: boolean;
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
export interface SubmitVotesInput extends CommandInput { votes: Two<Guess> }
export type ReportReason = "harassment" | "personal_information" | "unsafe_content" | "spam" | "other";
export interface ReportInput extends CommandInput {
  participantId: ParticipantId;
  reason: ReportReason;
  messageId?: string;
  detail?: string;
}
export interface BlockInput extends CommandInput { participantId: ParticipantId }

/** Implement with local mock data or HTTP; never import provider SDKs into UI code. */
export interface GameClient {
  getSession(): Promise<ApiResult<SessionView>>;
  createSession(input: CreateSessionInput): Promise<ApiResult<SessionView>>;
  setTrainingConsent(input: TrainingConsentInput): Promise<ApiResult<SessionView>>;
  joinQueue(input: CommandInput): Promise<ApiResult<QueueTicket>>;
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
