/**
 * Synthetic fixture adapter. No network, no Convex, no real players. Timings
 * follow GAME_DEFAULTS; the scripted stranger's replies land after a delay,
 * the way server-side bot messages do. Labelled FIXTURE MODE in the UI.
 */
import { GAME_DEFAULTS } from "@game/game-contract";
import type {
  ApiError, ApiResult, ChatTrainingConsentInput, ChatMessage, CommandInput, CreateSessionInput, Guess, HumanOrAi,
  LeaderboardView, QueueTicket, RevealedSeat, RoundSnapshot, SendMessageInput, SessionView,
  SubmitVotesInput, TrainingConsentInput, YourRoundResult,
} from "@game/game-contract";
import { blockedMessageFixture, rateLimitFixture } from "@game/fixtures";
import type { PlayClient } from "../binding";
import {
  fixtureLeaderboard, fixtureSeats, fixtureSelfId, fixtureSession, fixtureStrangerId,
  fixtureStrangerLines, fixtureTopic,
} from "./twoSeat";

type Listener<T> = (result: ApiResult<T>) => void;
export type CounterpartPlan = "alternate" | HumanOrAi;
/** "pair" seats the ticket after a short wait; "wait" never seats it (lone ticket). */
export type QueuePlan = "pair" | "wait";

interface RoundState {
  roundId: string;
  revision: number;
  startedAt: number;
  chatStartsAt: number;
  chatEndsAt: number;
  votingEndsAt: number;
  messages: ChatMessage[];
  ballot: { votes: readonly Guess[]; submittedAt: number } | null;
  counterpartKind: HumanOrAi;
  outcome: RoundSnapshot | null; // reveal or cancelled, frozen once reached
  nextLine: number;
}

const ok = <T,>(data: T): ApiResult<T> => ({ ok: true, data });
const fail = <T,>(code: ApiError["code"], message: string, extra: Partial<ApiError> = {}): ApiResult<T> =>
  ({ ok: false, error: { code, message, ...extra } });
const iso = (ms: number) => new Date(ms).toISOString();
const unauthenticated = <T,>() => fail<T>("UNAUTHENTICATED", "Create a player to start.");

export class FixtureGameClient implements PlayClient {
  private session: SessionView | null = null;
  private streak = 0;
  private queue: { queueId: string; joinedAt: number; roundId?: string } | null = null;
  private round: RoundState | null = null;
  private roundCount = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private seenRequests = new Map<string, unknown>();
  plan: CounterpartPlan = "alternate";
  queuePlan: QueuePlan = "pair";

  private sessionListeners = new Set<Listener<SessionView>>();
  private queueListeners = new Map<Listener<QueueTicket>, string>();
  private roundListeners = new Map<Listener<RoundSnapshot>, string>();
  private boardListeners = new Set<Listener<LeaderboardView>>();

  estimatedServerNow(): string { return iso(Date.now()); }

  // ---- reads -------------------------------------------------------------
  async getSession() { return this.readSession(); }
  async getQueue(queueId: string) { return this.readQueue(queueId); }
  async getRound(roundId: string) { return this.readRound(roundId); }
  async getLeaderboard() { return ok(this.readBoard()); }

  // ---- commands ----------------------------------------------------------
  async createSession(input: CreateSessionInput) {
    return this.once(input, () => {
      if (input.adultConfirmed !== true || input.rulesAccepted !== true) {
        return fail<SessionView>("INVALID_INPUT", "Please accept the current game rules.");
      }
      this.session ??= { ...fixtureSession, totalGuessingPoints: 0, trainingOptIn: input.trainingOptIn };
      this.emit();
      return this.readSession();
    });
  }

  async setTrainingConsent(input: TrainingConsentInput) {
    return this.once(input, () => {
      if (!this.session) return unauthenticated<SessionView>();
      this.session = { ...this.session, trainingOptIn: input.trainingOptIn };
      this.emit();
      return this.readSession();
    });
  }

  async setChatTrainingConsent(input: ChatTrainingConsentInput) {
    return this.once(input, () => {
      if (!this.session) return unauthenticated<SessionView>();
      this.session = { ...this.session, chatTrainingOptIn: input.allowed };
      this.emit();
      return this.readSession();
    });
  }

  async joinQueue(input: CommandInput) {
    return this.once(input, () => {
      if (!this.session) return unauthenticated<QueueTicket>();
      if (this.round && !this.round.outcome) return fail<QueueTicket>("ALREADY_IN_ROUND", "You are already in a round.");
      const queueId = `fixture-queue-${++this.roundCount}`;
      this.queue = { queueId, joinedAt: Date.now() };
      if (this.queuePlan === "pair") this.later(2_200 + Math.random() * 1_200, () => this.seat(queueId));
      this.emit();
      return this.readQueue(queueId);
    });
  }

  async leaveQueue(queueId: string, input: CommandInput) {
    return this.once(input, () => {
      if (this.queue?.queueId !== queueId || this.queue.roundId) return fail<{ left: true }>("QUEUE_CLOSED", "That queue ticket has closed.");
      this.queue = null;
      this.emit();
      return ok({ left: true as const });
    });
  }

  async sendMessage(roundId: string, input: SendMessageInput) {
    return this.once(input, () => {
      const round = this.active(roundId);
      if (!round) return fail<ChatMessage>("ROUND_CLOSED", "This round has closed.");
      const now = Date.now();
      if (now < round.chatStartsAt || now >= round.chatEndsAt) return fail<ChatMessage>("ROUND_CLOSED", "Chat is closed.");
      const text = input.text.trim();
      if (!text || text.length > GAME_DEFAULTS.maxMessageCharacters) {
        return fail<ChatMessage>("INVALID_INPUT", `Messages are 1-${GAME_DEFAULTS.maxMessageCharacters} characters.`);
      }
      // Fixture-only triggers that preview the shared error fixtures.
      if (text === "/blocked") return blockedMessageFixture;
      if (text === "/ratelimit") return rateLimitFixture;
      const message = { id: crypto.randomUUID(), senderId: fixtureSelfId, text, sentAt: iso(now) };
      round.messages.push(message);
      this.bump(round);
      this.scheduleReply(round, 1_600 + Math.min(text.length * 25, 1_500) + Math.random() * 1_200);
      return ok(message);
    });
  }

  async submitVotes(roundId: string, input: SubmitVotesInput) {
    return this.once(input, () => {
      const round = this.active(roundId);
      const now = Date.now();
      if (!round || now < round.chatEndsAt || now >= round.votingEndsAt) return fail<RoundSnapshot>("ROUND_CLOSED", "Voting is closed.");
      if (round.ballot) return fail<RoundSnapshot>("VOTES_LOCKED", "Your guesses are already locked.");
      const others = fixtureSeats.filter(seat => seat.id !== fixtureSelfId).map(seat => seat.id);
      const ids = new Set(input.votes.map(vote => vote.participantId));
      if (input.votes.length !== others.length || ids.size !== others.length || others.some(id => !ids.has(id))) {
        return fail<RoundSnapshot>("INVALID_INPUT", "Guess once for each of the other players.");
      }
      round.ballot = { votes: input.votes, submittedAt: now };
      this.bump(round);
      return this.readRound(roundId);
    });
  }

  async leaveRound(roundId: string, input: CommandInput) {
    return this.once(input, () => this.exit(roundId));
  }

  async reportParticipant(roundId: string, input: CommandInput) {
    return this.once(input, () => this.round?.roundId === roundId
      ? ok({ recorded: true as const }) : fail<{ recorded: true }>("NOT_PARTICIPANT", "That round is no longer available."));
  }

  async blockParticipant(roundId: string, input: CommandInput) {
    return this.once(input, () => this.exit(roundId));
  }

  // ---- fixture controls (FIXTURE MODE panel only) -------------------------
  /** Jump the active round's clock to its next deadline. */
  skipPhase(): void {
    const round = this.round;
    if (!round || round.outcome) return;
    const now = Date.now();
    const shift = now < round.chatStartsAt ? round.chatStartsAt - now
      : now < round.chatEndsAt ? round.chatEndsAt - now
        : round.votingEndsAt - now;
    round.chatStartsAt -= shift; round.chatEndsAt -= shift; round.votingEndsAt -= shift;
    this.tick(round);
  }

  /** Seat a waiting ticket now (used after switching the queue plan back). */
  seatWaiting(): void {
    if (this.queue && !this.queue.roundId) this.seat(this.queue.queueId);
  }

  // ---- watches -----------------------------------------------------------
  watchSession(listener: Listener<SessionView>) {
    this.sessionListeners.add(listener);
    queueMicrotask(() => this.sessionListeners.has(listener) && listener(this.readSession()));
    return () => { this.sessionListeners.delete(listener); };
  }
  watchQueue(queueId: string, listener: Listener<QueueTicket>) {
    this.queueListeners.set(listener, queueId);
    queueMicrotask(() => this.queueListeners.has(listener) && listener(this.readQueue(queueId)));
    return () => { this.queueListeners.delete(listener); };
  }
  watchRound(roundId: string, listener: Listener<RoundSnapshot>) {
    this.roundListeners.set(listener, roundId);
    queueMicrotask(() => this.roundListeners.has(listener) && listener(this.readRound(roundId)));
    return () => { this.roundListeners.delete(listener); };
  }
  watchLeaderboard(listener: Listener<LeaderboardView>) {
    this.boardListeners.add(listener);
    queueMicrotask(() => this.boardListeners.has(listener) && listener(ok(this.readBoard())));
    return () => { this.boardListeners.delete(listener); };
  }

  // ---- internals ---------------------------------------------------------
  private once<T>(input: CommandInput, work: () => ApiResult<T>): Promise<ApiResult<T>> {
    // Same clientRequestId returns the same result, mirroring server idempotency.
    if (this.seenRequests.has(input.clientRequestId)) return Promise.resolve(this.seenRequests.get(input.clientRequestId) as ApiResult<T>);
    const result = work();
    this.seenRequests.set(input.clientRequestId, result);
    return new Promise(resolve => setTimeout(() => resolve(result), 120 + Math.random() * 160));
  }

  private later(ms: number, work: () => void) {
    const timer = setTimeout(() => { this.timers.delete(timer); work(); }, ms);
    this.timers.add(timer);
  }

  private seat(queueId: string) {
    if (this.queue?.queueId !== queueId || !this.session) return;
    const now = Date.now();
    const kind: HumanOrAi = this.plan === "alternate" ? (this.roundCount % 2 === 1 ? "ai" : "human") : this.plan;
    const chatStartsAt = now + GAME_DEFAULTS.countdownMs;
    const chatEndsAt = chatStartsAt + GAME_DEFAULTS.chatMs;
    this.round = {
      roundId: `fixture-round-${this.roundCount}`, revision: 1, startedAt: now,
      chatStartsAt, chatEndsAt, votingEndsAt: chatEndsAt + GAME_DEFAULTS.votingMs,
      messages: [], ballot: null, counterpartKind: kind, outcome: null, nextLine: 0,
    };
    this.queue.roundId = this.round.roundId;
    this.session = { ...this.session, activeRoundId: this.round.roundId, activeQueueId: undefined };
    this.scheduleReply(this.round, GAME_DEFAULTS.countdownMs + 3_500);
    this.tick(this.round);
  }

  private scheduleReply(round: RoundState, delay: number) {
    this.later(delay, () => {
      const now = Date.now();
      if (this.round !== round || round.outcome || now < round.chatStartsAt || now >= round.chatEndsAt) return;
      const text = fixtureStrangerLines[round.nextLine++ % fixtureStrangerLines.length];
      round.messages.push({ id: crypto.randomUUID(), senderId: fixtureStrangerId, text, sentAt: iso(now) });
      this.bump(round);
    });
  }

  /** Advance phases from deadlines, then reschedule at the next one. */
  private tick(round: RoundState) {
    if (this.round !== round || round.outcome) return;
    const now = Date.now();
    if (now >= round.votingEndsAt) { this.settle(round); return; }
    const next = [round.chatStartsAt, round.chatEndsAt, round.votingEndsAt].find(at => at > now)!;
    this.bump(round);
    this.later(next - now + 5, () => this.tick(round));
  }

  private settle(round: RoundState) {
    const session = this.session!;
    const vote = round.ballot?.votes[0];
    const correct = vote && vote.label === round.counterpartKind ? 1 : 0;
    const earned = correct * GAME_DEFAULTS.guessPoints;
    this.streak = round.ballot && correct === 1 ? this.streak + 1 : 0;
    const total = session.totalGuessingPoints + earned;
    // Recognition counts human votes only; an AI counterpart casts none.
    const humanVotes = round.counterpartKind === "human" ? 1 : 0;
    const recognising = humanVotes && this.roundCount % 4 !== 0 ? 1 : 0;
    const yourResult: YourRoundResult = {
      ballotStatus: round.ballot ? "submitted" : "not_submitted",
      // The pinned contract types votes as a 2-tuple; a 2-seat room casts one.
      votes: (round.ballot?.votes ?? null) as YourRoundResult["votes"],
      correctGuessCount: correct,
      guessingPointsEarned: earned,
      totalGuessingPoints: total,
      streak: this.streak,
      recognition: { humanVotesReceived: humanVotes, humanVotesRecognisingYou: recognising, fraction: humanVotes ? recognising / humanVotes : null },
    };
    const participants: RevealedSeat[] = fixtureSeats.map(seat => ({
      ...seat, kind: seat.id === fixtureSelfId ? "human" : round.counterpartKind,
    }));
    round.revision++;
    round.outcome = {
      roundId: round.roundId, revision: round.revision, serverNow: iso(Date.now()), selfId: fixtureSelfId,
      phase: "reveal", participants, topic: fixtureTopic, messages: [...round.messages], yourResult,
    };
    // Settlement clears resume pointers; the app retains the reveal locally.
    this.session = { ...session, totalGuessingPoints: total, activeRoundId: undefined };
    this.emit();
  }

  private exit(roundId: string): ApiResult<{ left: true }> {
    const round = this.active(roundId);
    if (!round) return fail("NOT_PARTICIPANT", "That round is no longer available.");
    round.revision++;
    round.outcome = {
      roundId, revision: round.revision, serverNow: iso(Date.now()), selfId: fixtureSelfId,
      participants: fixtureSeats, phase: "cancelled", reason: "participant_left",
      message: "You left this round. No points were awarded.",
    };
    this.session = { ...this.session!, activeRoundId: undefined };
    this.emit();
    return ok({ left: true as const });
  }

  private active(roundId: string) {
    return this.round?.roundId === roundId && !this.round.outcome ? this.round : null;
  }

  private bump(round: RoundState) { round.revision++; this.emit(); }

  private readSession(): ApiResult<SessionView> {
    if (!this.session) return unauthenticated();
    const activeQueueId = this.queue && !this.queue.roundId ? this.queue.queueId : undefined;
    return ok({ ...this.session, serverNow: iso(Date.now()), activeQueueId });
  }

  private readQueue(queueId: string): ApiResult<QueueTicket> {
    const queue = this.queue;
    if (!queue || queue.queueId !== queueId) return fail("QUEUE_CLOSED", "That queue ticket has closed.");
    const base = { queueId, joinedAt: iso(queue.joinedAt), serverNow: iso(Date.now()) };
    return ok(queue.roundId ? { ...base, status: "assigned", roundId: queue.roundId } : { ...base, status: "waiting" });
  }

  private readRound(roundId: string): ApiResult<RoundSnapshot> {
    const round = this.round;
    if (!round || round.roundId !== roundId) return fail("NOT_FOUND", "That round is no longer available.");
    if (round.outcome) return ok(round.outcome);
    const now = Date.now();
    const base = { roundId, revision: round.revision, serverNow: iso(now), selfId: fixtureSelfId, participants: fixtureSeats };
    if (now < round.chatStartsAt) {
      return ok({ ...base, phase: "countdown", chatStartsAt: iso(round.chatStartsAt), chatEndsAt: iso(round.chatEndsAt) });
    }
    if (now < round.chatEndsAt) {
      return ok({ ...base, phase: "chat", topic: fixtureTopic, messages: [...round.messages], chatEndsAt: iso(round.chatEndsAt) });
    }
    return ok({
      ...base, phase: "voting", topic: fixtureTopic, messages: [...round.messages], votingEndsAt: iso(round.votingEndsAt),
      ownBallot: round.ballot
        ? { status: "submitted", votes: round.ballot.votes, submittedAt: iso(round.ballot.submittedAt) }
        : { status: "open" },
    });
  }

  private readBoard(): LeaderboardView {
    const selfEntryId = fixtureSession.leaderboardEntryId;
    const entries = fixtureLeaderboard.entries
      .map(entry => entry.entryId === selfEntryId && this.session
        ? { ...entry, guessingPoints: this.session.totalGuessingPoints } : entry)
      .sort((a, b) => b.guessingPoints - a.guessingPoints)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
    return { generatedAt: iso(Date.now()), entries };
  }

  private emit() {
    const session = this.readSession();
    this.sessionListeners.forEach(listener => listener(session));
    this.queueListeners.forEach((queueId, listener) => listener(this.readQueue(queueId)));
    this.roundListeners.forEach((roundId, listener) => listener(this.readRound(roundId)));
    const board = ok(this.readBoard());
    this.boardListeners.forEach(listener => listener(board));
  }
}
