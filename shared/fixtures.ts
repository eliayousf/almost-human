/** Entirely synthetic screen-preview data. Never real matchmaking or training evidence. */
import type {
  ApiResult, CancelledRound, ChatRound, CountdownRound, LeaderboardView,
  QueueTicket, RevealRound, SessionView, Three, Seat, Topic, VotingRound,
} from "./game-contract.js";

const participants: Three<Seat> = [
  { id: "demo-seat-1", alias: "Mango" },
  { id: "demo-seat-2", alias: "Orbit" },
  { id: "demo-seat-3", alias: "Pebble" },
];
const topic: Topic = { id: "demo-topic-1", text: "Invent a terrible name for a very good restaurant." };
const base = {
  roundId: "demo-round-1",
  selfId: "demo-seat-1",
  participants,
};
const messages = [
  { id: "demo-msg-1", senderId: "demo-seat-1", text: "Mild Food Poisoning. Five-star tasting menu, terrible branding.", sentAt: "2026-10-24T12:00:09.000Z" },
  { id: "demo-msg-2", senderId: "demo-seat-2", text: "The Unreasonably Long Wait. Everything arrives immediately.", sentAt: "2026-10-24T12:00:13.000Z" },
  { id: "demo-msg-3", senderId: "demo-seat-3", text: "Is the dessert called Sorry About That?", sentAt: "2026-10-24T12:00:18.000Z" },
];

export const sessionFixture: SessionView = {
  serverNow: "2026-10-24T11:59:55.000Z",
  leaderboardEntryId: "demo-score-1",
  leaderboardAlias: "Quiet Comet",
  totalGuessingPoints: 1_000,
  trainingOptIn: false,
};

export const waitingFixture: QueueTicket = {
  queueId: "demo-queue-1", joinedAt: "2026-10-24T11:59:57.000Z",
  serverNow: "2026-10-24T11:59:58.000Z", status: "waiting",
};
export const assignedFixture: QueueTicket = {
  ...waitingFixture, serverNow: "2026-10-24T12:00:00.000Z",
  status: "assigned", roundId: base.roundId,
};

export const countdownFixture: CountdownRound = {
  ...base, phase: "countdown", revision: 1, serverNow: "2026-10-24T12:00:00.000Z",
  chatStartsAt: "2026-10-24T12:00:03.000Z", chatEndsAt: "2026-10-24T12:02:03.000Z",
};
export const chatFixture: ChatRound = {
  ...base, phase: "chat", revision: 2, serverNow: "2026-10-24T12:00:30.000Z",
  topic, messages, chatEndsAt: "2026-10-24T12:02:03.000Z",
};
export const votingFixture: VotingRound = {
  ...base, phase: "voting", revision: 3, serverNow: "2026-10-24T12:02:03.000Z",
  topic, messages, votingEndsAt: "2026-10-24T12:02:18.000Z", ownBallot: { status: "open" },
};
export const submittedFixture: VotingRound = {
  ...votingFixture, revision: 4, serverNow: "2026-10-24T12:02:10.000Z",
  ownBallot: {
    status: "submitted", submittedAt: "2026-10-24T12:02:10.000Z",
    votes: [
      { participantId: "demo-seat-2", label: "ai" },
      { participantId: "demo-seat-3", label: "human" },
    ],
  },
};
export const revealFixture: RevealRound = {
  ...base, phase: "reveal", revision: 5, serverNow: "2026-10-24T12:02:18.000Z",
  participants: [
    { ...participants[0], kind: "human" },
    { ...participants[1], kind: "ai" },
    { ...participants[2], kind: "human" },
  ],
  topic, messages,
  yourResult: {
    ballotStatus: "submitted",
    votes: [
      { participantId: "demo-seat-2", label: "ai" },
      { participantId: "demo-seat-3", label: "human" },
    ],
    correctGuessCount: 2, guessingPointsEarned: 200, totalGuessingPoints: 1_200, streak: 1,
    recognition: { humanVotesReceived: 1, humanVotesRecognisingYou: 1, fraction: 1 },
  },
};
export const cancelledFixture: CancelledRound = {
  ...base, phase: "cancelled", revision: 3, serverNow: "2026-10-24T12:00:40.000Z",
  reason: "connection_lost", message: "This round ended. No points were awarded; join another room.",
};

/** Alternate reveal previews; pre-reveal payloads never identify these compositions. */
export const allHumanRevealFixture: RevealRound = {
  ...revealFixture,
  participants: [
    { ...participants[0], kind: "human" },
    { ...participants[1], kind: "human" },
    { ...participants[2], kind: "human" },
  ],
  yourResult: {
    ...revealFixture.yourResult,
    correctGuessCount: 1, guessingPointsEarned: 100, totalGuessingPoints: 1_100, streak: 0,
    recognition: { humanVotesReceived: 2, humanVotesRecognisingYou: 1, fraction: 0.5 },
  },
};
export const twoBotRevealFixture: RevealRound = {
  ...revealFixture,
  participants: [
    { ...participants[0], kind: "human" },
    { ...participants[1], kind: "ai" },
    { ...participants[2], kind: "ai" },
  ],
  yourResult: {
    ...revealFixture.yourResult,
    correctGuessCount: 1, guessingPointsEarned: 100, totalGuessingPoints: 1_100, streak: 0,
    recognition: { humanVotesReceived: 0, humanVotesRecognisingYou: 0, fraction: null },
  },
};
export const missedVoteRevealFixture: RevealRound = {
  ...revealFixture,
  yourResult: {
    ...revealFixture.yourResult, ballotStatus: "not_submitted", votes: null,
    correctGuessCount: 0, guessingPointsEarned: 0, totalGuessingPoints: 1_000, streak: 0,
  },
};
export const leaderboardFixture: LeaderboardView = {
  generatedAt: "2026-10-24T12:02:20.000Z",
  entries: [
    { entryId: "demo-score-2", rank: 1, alias: "Silver Otter", guessingPoints: 1_400,
      roundsPlayed: 9, guessAccuracy: 14 / 18,
      recognition: { humanVotesReceived: 5, humanVotesRecognisingYou: 3, fraction: 3 / 5 } },
    { entryId: "demo-score-1", rank: 2, alias: "Quiet Comet", guessingPoints: 1_200,
      roundsPlayed: 8, guessAccuracy: 12 / 16,
      recognition: { humanVotesReceived: 6, humanVotesRecognisingYou: 5, fraction: 5 / 6 } },
    { entryId: "demo-score-3", rank: 3, alias: "Velvet Kiwi", guessingPoints: 1_000,
      roundsPlayed: 6, guessAccuracy: 10 / 12,
      recognition: { humanVotesReceived: 0, humanVotesRecognisingYou: 0, fraction: null } },
  ],
};

export const blockedMessageFixture: ApiResult<never> = {
  ok: false, error: { code: "MESSAGE_BLOCKED", message: "Please rephrase that message." },
};
export const rateLimitFixture: ApiResult<never> = {
  ok: false, error: { code: "RATE_LIMITED", message: "Please wait a moment before trying again.", retryAfterMs: 2_000 },
};
export const unavailableFixture: ApiResult<never> = {
  ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "The game is temporarily unavailable. Please try again shortly." },
};
