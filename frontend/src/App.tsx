import { lazy, Suspense, useEffect, useState } from "react";
import { command, useBinding } from "./game/binding";
import { ConsentGate } from "./screens/Consent";
import { Lobby } from "./screens/Lobby";
import { StatusScreen } from "./screens/Status";
import { Waiting } from "./screens/Waiting";

// The round stage (cast videos, shader) is outside the critical
// path: it is prefetched once a player exists and is needed only after Play.
const loadRound = () => import("./screens/round/Round");
const Round = lazy(() => loadRound().then(module => ({ default: module.Round })));

/**
 * Routes purely by server state: session -> queue ticket -> round phase.
 * Local timers never advance a phase, reveal a role, or invent a result.
 */
export function App() {
  const binding = useBinding();
  const connection = binding.useConnection();
  const { game } = connection;
  const sessionResult = binding.useSession();
  const session = sessionResult?.ok ? sessionResult.data : null;

  const [selectedRoundId, selectRound] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const roundId = selectedRoundId ?? session?.activeRoundId ?? null;
  const queueId = roundId ? null : session?.activeQueueId ?? ticketId;
  const queue = binding.useQueue(queueId);
  const roundResult = binding.useRound(roundId);
  const round = roundResult?.ok ? roundResult.data : undefined;
  const seconds = binding.useRoundSeconds(round);
  const leaderboard = binding.useLeaderboard();
  const [busy, setBusy] = useState(false);
  // Display-only round counter for this browser session; the API has none.
  const [seenRounds, setSeenRounds] = useState<string[]>([]);
  useEffect(() => {
    if (roundId) setSeenRounds(list => list.includes(roundId) ? list : [...list, roundId]);
  }, [roundId]);
  const roundNumber = roundId ? Math.max(1, seenRounds.indexOf(roundId) + 1) : 0;
  const [notice, setNotice] = useState("");

  // Prefer the active round; retain a settled round locally so its reveal stays.
  useEffect(() => {
    if (session?.activeRoundId) selectRound(session.activeRoundId);
  }, [session?.activeRoundId]);
  useEffect(() => {
    if (queue?.ok && queue.data.status === "assigned") {
      selectRound(queue.data.roundId);
      setTicketId(null);
    }
  }, [queue]);
  const hasSession = Boolean(session);
  useEffect(() => {
    if (!hasSession) return;
    void loadRound();
  }, [hasSession]);

  async function join() {
    if (!game || busy) return;
    setBusy(true);
    try {
      const result = await game.joinQueue(command());
      if (!result.ok) {
        setNotice(result.error.message);
        if (result.error.code === "ALREADY_IN_ROUND" && session?.activeRoundId) selectRound(session.activeRoundId);
        return;
      }
      setNotice("");
      if (result.data.status === "assigned") {
        selectRound(result.data.roundId);
      } else {
        selectRound(null);
        setTicketId(result.data.queueId);
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!game || !queueId || busy) return;
    setBusy(true);
    try {
      const result = await game.leaveQueue(queueId, command());
      if (result.ok || result.error.code === "QUEUE_CLOSED") {
        setTicketId(null);
        setNotice("");
      } else {
        setNotice(result.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  function toLobby() {
    selectRound(null);
    setTicketId(null);
    setNotice("");
  }

  if (connection.status === "error") {
    return <StatusScreen title="Can't reach the game" detail={connection.error ?? undefined}
      action={{ label: "Retry", onClick: connection.retry }} />;
  }
  if (!game || sessionResult === undefined) return <StatusScreen title="Connecting…" />;
  if (!sessionResult.ok) {
    if (sessionResult.error.code === "UNAUTHENTICATED") return <ConsentGate onAccept={input => game.createSession(input)} />;
    return <StatusScreen title="Something went wrong" detail={sessionResult.error.message} />;
  }
  const player = sessionResult.data;

  if (roundId) {
    if (!roundResult) return <StatusScreen title="Loading round…" />;
    if (!roundResult.ok) {
      return <StatusScreen title="This round is unavailable" detail={roundResult.error.message}
        action={{ label: "Back to lobby", onClick: toLobby }} />;
    }
    return <Suspense fallback={<StatusScreen title="Loading round…" />}>
      <Round game={game} round={roundResult.data} seconds={seconds} busy={busy} roundNumber={roundNumber}
        onPlayAgain={() => { void join(); }} onLobby={toLobby} />
    </Suspense>;
  }
  if (queueId) {
    return <Waiting game={game} queue={queue} cancelling={busy} notice={notice}
      onCancel={() => { void cancel(); }} onRejoin={() => { setTicketId(null); void join(); }} />;
  }
  return <Lobby game={game} session={player} leaderboard={leaderboard} joining={busy} notice={notice}
    onPlay={() => { void join(); }} />;
}
// END App.tsx
