import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CHAT_TRAINING_POLICY_VERSION } from "../../../shared/playtest-policy";
import { ConvexReactClient } from 'convex/react';
import { AlmostHumanProvider, useAlmostHuman, useGameSession, useGameQueue, useGameRound, useRoundSeconds } from '../../../shared/react-game';
import type { ApiResult, ReportReason } from '../../../shared/game-contract';
import { createTypingReporter } from './typing';
import { displayState, type State } from './game-state';
import { needsCurrentTerms, VOTE_FEEDBACK_TERMS_VERSION } from '../../../shared/playtest-policy';

export const backendUrl = process.env.EXPO_PUBLIC_CONVEX_URL;
export function GameProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new ConvexReactClient(backendUrl!));
  return <AlmostHumanProvider client={client}>{children}</AlmostHumanProvider>;
}

export function useLiveGame() {
  const connection = useAlmostHuman();
  const { game } = connection;
  const sessionResult = useGameSession();
  const session = sessionResult?.ok ? sessionResult.data : null;
  const [selectedRound, setSelectedRound] = useState<string | null>(null);
  const [ticket, setTicket] = useState<string | null>(null);
  const roundId = selectedRound ?? session?.activeRoundId ?? null;
  const queueId = roundId ? null : session?.activeQueueId ?? ticket;
  const queue = useGameQueue(queueId);
  const roundResult = useGameRound(roundId);
  const round = roundResult?.ok ? roundResult.data : undefined;
  const typingEnabled = round?.phase === 'chat' && round.typing !== undefined;
  const typingReporter = useMemo(() => createTypingReporter(active => {
    if (game?.setTyping && roundId && typingEnabled) void game.setTyping(roundId, active).catch(() => undefined);
  }), [game, roundId, typingEnabled]);
  useEffect(() => () => typingReporter.stop(), [typingReporter]);
  const seconds = useRoundSeconds(round);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const requests = useRef(new Map<string, string>());
  useEffect(() => { if (session?.activeRoundId) setSelectedRound(session.activeRoundId); }, [session?.activeRoundId]);
  useEffect(() => {
    if (queue?.ok && queue.data.status === 'assigned') { setSelectedRound(queue.data.roundId); setTicket(null); }
  }, [queue]);
  useEffect(() => {
    if (!game) { setSelectedRound(null); setTicket(null); requests.current.clear(); }
  }, [game]);

  async function command<T>(scope: string, payload: unknown, invoke: (clientRequestId: string) => Promise<ApiResult<T>>) {
    if (!game || inFlight.current) return null;
    const key = JSON.stringify([scope, payload]);
    const id = requests.current.get(key) ?? crypto.randomUUID();
    requests.current.set(key, id);
    inFlight.current = true; setBusy(true);
    try {
      const result = await invoke(id);
      if (result.ok || result.error.code !== 'SERVICE_UNAVAILABLE') requests.current.delete(key);
      setError(result.ok ? '' : result.error.message);
      return result;
    } catch {
      setError('Connection interrupted. Try again.');
      return null;
    } finally { inFlight.current = false; setBusy(false); }
  }
  const play = async () => {
    if (needsCurrentTerms(session)) { setSelectedRound(null); setTicket(null); setError(''); return; }
    const result = await command('join', {}, id => game!.joinQueue({ clientRequestId: id, strictPair: true }));
    if (result?.ok) {
      setSelectedRound(result.data.status === 'assigned' ? result.data.roundId : null);
      setTicket(result.data.status === 'waiting' ? result.data.queueId : null);
    }
  };
  const toLobby = () => { setSelectedRound(null); setTicket(null); setError(''); };
  const cancelQueue = async () => {
    if (!queueId) return;
    const result = await command('cancel', queueId, id => game!.leaveQueue(queueId, { clientRequestId: id }));
    if (result?.ok || (result && !result.ok && result.error.code === 'QUEUE_CLOSED')) toLobby();
  };
  const leave = async () => {
    if (!roundId) return;
    await command('leave', roundId, id => game!.leaveRound(roundId, { clientRequestId: id }));
  };
  const send = async (text: string) => Boolean(roundId && (await command('send', [roundId, text], id => game!.sendMessage(roundId, { clientRequestId: id, text })))?.ok);
  const partner = round?.participants.find(seat => seat.id !== round.selfId);
  const vote = async (label: 'human' | 'ai') => {
    if (!roundId || !partner || round?.phase !== 'voting') return;
    await command('vote', [roundId, label], id => game!.submitVotes(roundId, { clientRequestId: id, votes: [{ participantId: partner.id, label }] }));
  };
  const report = async (reason: ReportReason, detail: string) => Boolean(roundId && partner &&
    (await command('report', [roundId, reason, detail], id => game!.reportParticipant(roundId, { clientRequestId: id, participantId: partner.id, reason, detail })))?.ok);
  const block = async () => Boolean(roundId && partner &&
    (await command('block', [roundId, partner.id], id => game!.blockParticipant(roundId, { clientRequestId: id, participantId: partner.id })))?.ok);
  const accept = async (adult: boolean, rules: boolean) => {
    if (!adult || !rules) return;
    await command('terms', VOTE_FEEDBACK_TERMS_VERSION, id => game!.createSession({ clientRequestId: id, adultConfirmed: true, rulesAccepted: true, policyVersion: VOTE_FEEDBACK_TERMS_VERSION, trainingOptIn: true }));
  };
  const chatTraining = async (allowed: boolean) => Boolean((await command('chatTraining', allowed,
    id => game!.setChatTrainingConsent({ clientRequestId: id, allowed, policyVersion: CHAT_TRAINING_POLICY_VERSION })))?.ok);
  let state: State | undefined;
  let mappingError = '';
  if (session) {
    try { state = displayState(session, round, Date.parse(game!.estimatedServerNow())); }
    catch { mappingError = 'This older room is not a two-seat room. Leave it to enter a new 1v1 room.'; }
  }
  const queryError = sessionResult && !sessionResult.ok && sessionResult.error.code !== 'UNAUTHENTICATED' ? sessionResult.error.message
    : roundResult && !roundResult.ok ? roundResult.error.message
      : queue && !queue.ok ? queue.error.message : '';
  return { connection, session, state, seconds, busy, error: error || mappingError || queryError,
    loading: !game || sessionResult === undefined || Boolean(roundId && !roundResult),
    needsAcceptance: Boolean(game && ((sessionResult && !sessionResult.ok && sessionResult.error.code === 'UNAUTHENTICATED') || (needsCurrentTerms(session) && !roundId && !queueId))),
    updatingTerms: needsCurrentTerms(session),
    queueing: Boolean(queueId), queueClosed: Boolean(queue && !queue.ok && queue.error.code === 'QUEUE_CLOSED'),
    roundId, partner, play, send, typing: typingReporter.update, vote, accept, chatTraining, cancelQueue, leave, report, block, toLobby };
}
