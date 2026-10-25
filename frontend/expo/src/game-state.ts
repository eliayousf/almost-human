import { GAME_DEFAULTS, type RoundSnapshot, type SessionView } from '../../../shared/game-contract.ts';

export type Verdict = 'human' | 'ai';
export type Phase = 'idle' | 'queue' | 'waiting' | 'chat' | 'guess' | 'reveal' | 'cancelled';
export type Partner = { name: string; faceId?: number };
export type State = {
  phase: Phase; name: string; faceId?: number; score: number; played?: number; right?: number;
  roomId?: string; partner?: Partner; topic?: string; now?: number; endsAt?: number;
  roundMs?: number; voteMs?: number; guessEndsAt?: number; guessed?: Verdict;
  messages?: { me: boolean; text: string }[]; cancellation?: string;
  reveal?: { partner: Partner; truth: Verdict; correct: boolean; yourGuess?: Verdict;
    score: number; earnedPoints?: number; streak?: number;
    recognition?: { fraction: number | null; humanVotesReceived: number; humanVotesRecognisingYou: number };
    judgeOnYou?: { verdict: Verdict; tell: string }; judgeOnPartner?: { tell: string } };
};

/** Presentation mapping only. Roles and scores always come from server snapshots. */
export function displayState(session: SessionView, round: RoundSnapshot | undefined, now: number): State {
  const state: State = { phase: 'idle', name: session.leaderboardAlias, score: session.totalGuessingPoints, now };
  if (!round) return state;
  if (round.participants.length !== 2) throw new Error('This interface requires a two-seat room.');
  const self = round.participants.find(seat => seat.id === round.selfId);
  const partner = round.participants.find(seat => seat.id !== round.selfId);
  if (!self || !partner) throw new Error('The room has incomplete participant data.');
  Object.assign(state, { roomId: round.roundId, name: self.alias, faceId: self.faceId,
    partner: { name: partner.alias, faceId: partner.faceId }, roundMs: GAME_DEFAULTS.chatMs, voteMs: GAME_DEFAULTS.votingMs });
  if (round.phase === 'cancelled') return { ...state, phase: 'cancelled', cancellation: round.message };
  if (round.phase === 'countdown') return { ...state, phase: 'waiting', endsAt: Date.parse(round.chatStartsAt) };
  state.topic = round.topic.text;
  state.messages = round.messages.map(message => ({ me: message.senderId === round.selfId, text: message.text }));
  if (round.phase === 'chat') return { ...state, phase: 'chat', endsAt: Date.parse(round.chatEndsAt) };
  if (round.phase === 'voting') return { ...state, phase: 'guess', guessEndsAt: Date.parse(round.votingEndsAt),
    guessed: round.ownBallot.status === 'submitted' ? round.ownBallot.votes.find(vote => vote.participantId === partner.id)?.label : undefined };
  const revealed = round.participants.find(seat => seat.id === partner.id)!;
  const result = round.yourResult;
  return { ...state, phase: 'reveal', score: result.totalGuessingPoints, reveal: {
    partner: state.partner!, truth: revealed.kind, correct: result.correctGuessCount === 1,
    yourGuess: result.votes?.find(vote => vote.participantId === partner.id)?.label,
    score: result.totalGuessingPoints, earnedPoints: result.guessingPointsEarned,
    streak: result.streak, recognition: result.recognition,
  } };
}
