import { StrictMode, useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { AlmostHumanProvider, useAlmostHuman, useGameSession, useGameQueue, useGameRound, useGameLeaderboard, useRoundSeconds } from "../../shared/react-game";
import type { ApiResult, ChatMessage, ReportReason, RoundSnapshot, SubmitVotesInput } from "../../shared/game-contract";

declare const __CONVEX_URL__: string;
const convex = new ConvexReactClient(__CONVEX_URL__);
const command = () => ({ clientRequestId: crypto.randomUUID() });

/** Functional integration reference, deliberately independent of Cash's visual UI. */
function App() {
  const connection = useAlmostHuman();
  const { game } = connection;
  const sessionResult = useGameSession();
  const session = sessionResult?.ok ? sessionResult.data : null;
  const [selectedRoundId, selectRound] = useState<string | null>(null);
  const roundId = selectedRoundId ?? session?.activeRoundId ?? null;
  const queueId = roundId ? null : session?.activeQueueId ?? null;
  const queue = useGameQueue(queueId);
  const roundResult = useGameRound(roundId);
  const round = roundResult?.ok ? roundResult.data : undefined;
  const leaderboard = useGameLeaderboard();
  const seconds = useRoundSeconds(round);
  const [notice, setNotice] = useState("");
  const [joining, setJoining] = useState(false);

  // Preserve the current room's reveal after settlement clears its resume pointer.
  useEffect(() => {
    if (session?.activeRoundId) selectRound(session.activeRoundId);
  }, [session?.activeRoundId]);
  useEffect(() => {
    if (queue?.ok && queue.data.status === "assigned") selectRound(queue.data.roundId);
  }, [queue]);

  async function accepted<T>(work: Promise<ApiResult<T>>): Promise<T | null> {
    const result = await work;
    setNotice(result.ok ? "" : result.error.message);
    return result.ok ? result.data : null;
  }
  async function join() {
    if (!game || joining) return;
    setJoining(true);
    try {
      const ticket = await accepted(game.joinQueue(command()));
      if (ticket) selectRound(ticket.status === "assigned" ? ticket.roundId : null);
    } finally { setJoining(false); }
  }

  return <>
    <h1>Almost Human: React integration reference</h1>
    <p><strong>All-human development test. Use synthetic text. No model training.</strong></p>
    <p>Cash owns the public design. This example uses the reusable provider and hooks.</p>
    <button onClick={() => window.open(location.href, "_blank", "noopener,noreferrer")}>Open independent player tab</button>
    <p role="status">{notice || connection.error || (connection.status === "connecting" ? "Connecting anonymous player…" : "Connected")}</p>
    {connection.status === "error" && <button onClick={connection.retry}>Retry connection</button>}
    {game && sessionResult === undefined && <p>Loading player…</p>}
    {game && sessionResult && !sessionResult.ok && sessionResult.error.code === "UNAUTHENTICATED" && <StartPlayer onStart={input => accepted(game.createSession(input))} />}
    {sessionResult && !sessionResult.ok && sessionResult.error.code !== "UNAUTHENTICATED" && <p role="alert">{sessionResult.error.message}</p>}
    {session && <section>
      <h2>{session.leaderboardAlias}</h2><p>{session.totalGuessingPoints} total guessing points</p>
      <label><input type="checkbox" checked={session.trainingOptIn} onChange={event => {
        void accepted(game!.setTrainingConsent({ ...command(), policyVersion: "playtest-v1", trainingOptIn: event.target.checked }));
      }} /> Allow reviewed training use (optional; no training runs in this test)</label>
      {!roundId && !queueId && <p><button disabled={joining} onClick={() => { void join(); }}>Join queue</button></p>}
    </section>}
    {queueId && <section>
      <h2>Waiting for three players</h2>
      {queue && !queue.ok && <p role="alert">{queue.error.message}</p>}
      <button onClick={() => { void accepted(game!.leaveQueue(queueId, command())); }}>Cancel waiting</button>
    </section>}
    {roundId && !roundResult && <p>Loading round…</p>}
    {roundResult && !roundResult.ok && <p role="alert">{roundResult.error.message}</p>}
    {round && <section>
      <h2>{round.phase}</h2>
      <p>{round.participants.map(seat => `${seat.alias}${seat.id === round.selfId ? " (you)" : ""}${"kind" in seat ? `: ${seat.kind}` : ""}`).join(" · ")}</p>
      {seconds !== null && <p aria-label="Time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</p>}
      {"topic" in round && <h3>{round.topic.text}</h3>}
      {"messages" in round && <ol aria-label="Chat messages">{round.messages.map(message => <li key={message.id}>
        <strong>{round.participants.find(seat => seat.id === message.senderId)?.alias}: </strong>{message.text}
      </li>)}</ol>}
      <RoundControls key={round.roundId} round={round} accepted={accepted} />
      {round.phase === "reveal" && <p>{round.yourResult.correctGuessCount}/2 correct · +{round.yourResult.guessingPointsEarned} points · {round.yourResult.totalGuessingPoints} total</p>}
      {round.phase === "cancelled" && <p>{round.message}</p>}
      {["reveal", "cancelled"].includes(round.phase) && <button disabled={joining} onClick={() => { void join(); }}>Play again</button>}
    </section>}
    <section><h2>Leaderboard</h2>
      {leaderboard?.ok ? <ol>{leaderboard.data.entries.map(entry => <li key={entry.entryId}>{entry.alias}: {entry.guessingPoints} points</li>)}</ol>
        : <p>{leaderboard ? leaderboard.error.message : "Loading scores…"}</p>}
    </section>
  </>;
}

type StartInput = Parameters<NonNullable<ReturnType<typeof useAlmostHuman>["game"]>["createSession"]>[0];
function StartPlayer({ onStart }: { onStart: (input: StartInput) => Promise<unknown> }) {
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!form.has("adult") || !form.has("rules") || pending) return;
    setPending(true);
    try { await onStart({ ...command(), adultConfirmed: true, rulesAccepted: true, policyVersion: "playtest-v1", trainingOptIn: form.has("training") }); }
    finally { setPending(false); }
  }
  return <form onSubmit={event => { void submit(event); }}>
    <h2>Start a test player</h2>
    <label><input type="checkbox" name="adult" required /> I am 18 or older.</label>
    <label><input type="checkbox" name="rules" required /> I agree to use respectful synthetic text and share no contact details.</label>
    <label><input type="checkbox" name="training" /> Optional reviewed training use.</label>
    <button disabled={pending}>Start player</button>
  </form>;
}

function RoundControls({ round, accepted }: {
  round: RoundSnapshot;
  accepted: <T>(work: Promise<ApiResult<T>>) => Promise<T | null>;
}) {
  const { game } = useAlmostHuman();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const pendingMessage = useRef<{ text: string; clientRequestId: string } | null>(null);
  const pendingBallot = useRef<SubmitVotesInput | null>(null);
  const others = round.participants.filter(seat => seat.id !== round.selfId);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!game || pending || !text.trim()) return;
    if (pendingMessage.current?.text !== text) pendingMessage.current = { text, ...command() };
    setPending(true);
    try {
      const result: ApiResult<ChatMessage> = await game.sendMessage(round.roundId, pendingMessage.current);
      if (result.ok) { setText(""); pendingMessage.current = null; }
      else if (result.error.code !== "SERVICE_UNAVAILABLE") pendingMessage.current = null;
      await accepted(Promise.resolve(result));
    } finally { setPending(false); }
  }
  async function vote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!game || pending || round.phase !== "voting" || round.ownBallot.status === "submitted") return;
    const form = new FormData(event.currentTarget);
    const labels = others.map(seat => form.get(seat.id));
    if (labels.some(label => label !== "human" && label !== "ai")) return;
    const votes: SubmitVotesInput["votes"] = [
      { participantId: others[0].id, label: labels[0] as "human" | "ai" },
      { participantId: others[1].id, label: labels[1] as "human" | "ai" },
    ];
    if (!pendingBallot.current || JSON.stringify(pendingBallot.current.votes) !== JSON.stringify(votes)) pendingBallot.current = { ...command(), votes };
    setPending(true);
    try { await accepted(game.submitVotes(round.roundId, pendingBallot.current)); }
    finally { setPending(false); }
  }
  const finished = round.phase === "reveal" || round.phase === "cancelled";
  return <>
    {round.phase === "chat" && <form onSubmit={event => { void send(event); }}>
      <label>Message <input value={text} maxLength={400} required onChange={event => setText(event.target.value)} /></label>
      <button disabled={pending}>Send</button>
    </form>}
    {round.phase === "voting" && <form onSubmit={event => { void vote(event); }}>
      {others.map(seat => <label key={seat.id}>{seat.alias} <select name={seat.id} required disabled={pending || round.ownBallot.status === "submitted"}
        defaultValue={round.ownBallot.status === "submitted" ? round.ownBallot.votes.find(vote => vote.participantId === seat.id)?.label : ""}>
        <option value="">Choose…</option><option value="human">Human</option><option value="ai">AI</option>
      </select></label>)}
      <button disabled={pending || round.ownBallot.status === "submitted"}>Lock guesses</button>
      {round.ownBallot.status === "submitted" && <p>Your guesses are locked. Waiting for the reveal.</p>}
    </form>}
    {!finished && <>
      <button onClick={() => { void accepted(game!.leaveRound(round.roundId, command())); }}>Leave round</button>
      {others.map(seat => <SafetyControls key={seat.id} roundId={round.roundId} participantId={seat.id} alias={seat.alias} accepted={accepted} />)}
    </>}
  </>;
}

function SafetyControls({ roundId, participantId, alias, accepted }: {
  roundId: string; participantId: string; alias: string;
  accepted: <T>(work: Promise<ApiResult<T>>) => Promise<T | null>;
}) {
  const { game } = useAlmostHuman();
  const [reason, setReason] = useState<ReportReason>("other");
  return <p>{alias}: <select aria-label={`Report reason for ${alias}`} value={reason} onChange={event => setReason(event.target.value as ReportReason)}>
    <option value="other">Other</option><option value="harassment">Harassment</option><option value="personal_information">Personal information</option>
    <option value="unsafe_content">Unsafe content</option><option value="spam">Spam</option>
  </select>{" "}<button onClick={() => { void accepted(game!.reportParticipant(roundId, { ...command(), participantId, reason })); }}>Report {alias}</button>{" "}
    <button onClick={() => { void accepted(game!.blockParticipant(roundId, { ...command(), participantId })); }}>Block {alias}</button></p>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing React example root");
createRoot(root).render(<StrictMode>
  <AlmostHumanProvider client={convex} storage={window.sessionStorage} storageNamespace="almost-human-react-test">
    <App />
  </AlmostHumanProvider>
</StrictMode>);
