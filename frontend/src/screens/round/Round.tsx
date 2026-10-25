import { useEffect, useMemo, useRef, useState } from "react";
import type { RoundSnapshot, Seat } from "@game/game-contract";
import { PORTRAITS } from "../../assets/portraits";
import { Portrait } from "../../components/Portrait";
import { useMouth } from "../../fx/mouth";
import type { PlayClient } from "../../game/binding";
import { useCounterpartSpeech } from "../../game/speech";
import { Composer } from "./Composer";
import { RevealPanel, RevealStamp } from "./Reveal";
import { SafetySheet } from "./SafetySheet";
import { Transcript } from "./Transcript";
import { VerdictControls } from "./Verdict";

type Stage = "paired" | "onair" | "verdict" | "reveal" | "cancelled";
const stageOf = (round: RoundSnapshot): Stage =>
  round.phase === "countdown" ? "paired"
    : round.phase === "chat" ? "onair"
      : round.phase === "voting" ? "verdict" : round.phase;

/**
 * Renders `participants` by array length. In a 2-seat room this is the 1v1
 * layout; larger rooms (which the current backend may still create) keep the
 * same stage with the focused counterpart in the main frame and one verdict
 * row per other seat. Nothing here infers or displays a seat's role pre-reveal.
 */
export function Round({ game, round, seconds, busy, onPlayAgain, onLobby }: {
  game: PlayClient;
  round: RoundSnapshot;
  seconds: number | null;
  busy: boolean;
  onPlayAgain: () => void;
  onLobby: () => void;
}) {
  const stage = stageOf(round);
  const self = round.participants.find(seat => seat.id === round.selfId);
  const others = useMemo(() => round.participants.filter(seat => seat.id !== round.selfId), [round.participants, round.selfId]);
  const messages = "messages" in round ? round.messages : [];
  const focus = useFocusedCounterpart(others, messages);
  const selfMouth = useMouth();
  const strangerMouth = useMouth();
  const [sheetOpen, setSheetOpen] = useState(false);
  const burstKey = useBursts(round);

  useCounterpartSpeech(round, focus?.id ?? null, ms => strangerMouth.speakFor(ms));

  const aliasOf = (id: string) => id === round.selfId ? "You" : round.participants.find(seat => seat.id === id)?.alias ?? "—";
  const latest = [...messages].reverse().find(message => message.senderId === focus?.id);
  const revealedFocus = round.phase === "reveal" ? round.participants.find(seat => seat.id === focus?.id) : undefined;
  const live = round.phase === "chat" || round.phase === "voting" || round.phase === "countdown";

  return <main className={`stage stage--${stage}`} data-seats={round.participants.length}>
    <header className="bar">
      <span className={`bar__timer mono${stage !== "paired" && seconds !== null && seconds <= 10 ? " bar__timer--low" : ""}`}
        aria-label="Time remaining" role="timer">
        {seconds === null ? (stage === "reveal" ? "REVEAL" : "—") : formatSeconds(seconds)}
      </span>
      <span className="bar__topic">
        {"topic" in round ? <><span className="label label--amber">Topic</span> {round.topic.text}</>
          : round.phase === "countdown" ? <span className="label">Topic sealed until start</span> : null}
      </span>
      {live && <button type="button" className="bar__menu" aria-label="Report, block or leave"
        onClick={() => setSheetOpen(true)}>⋯</button>}
    </header>

    <div className="duo">
      <Portrait asset={PORTRAITS.stranger} className="frame--stranger" mouth={strangerMouth}
        burstKey={burstKey} label={`${focus?.alias ?? "The stranger"}'s portrait`}>
        {stage === "paired" && <span className="seat-tag">{focus?.alias ?? "Stranger"}</span>}
        {stage === "onair" && latest && <p className="line" key={latest.id} aria-live="polite">{latest.text}</p>}
        {stage === "onair" && !latest && <p className="line line--idle">…</p>}
        {stage === "verdict" && <h2 className="ask">Who are they?</h2>}
        {revealedFocus && "kind" in revealedFocus && <RevealStamp kind={revealedFocus.kind} />}
      </Portrait>
      {self && <Portrait asset={PORTRAITS.self} className="frame--self" mouth={selfMouth}
        mirrored={stage === "paired"} label="Your seat">
        <span className="seat-tag seat-tag--self">You</span>
      </Portrait>}
      {stage === "paired" && seconds !== null && <div className="count mono" aria-hidden="true" key={seconds}>{seconds || "GO"}</div>}
    </div>

    {others.length > 1 && <p className="others mono" aria-label="Other seats">
      {others.map(seat => <span key={seat.id} className={seat.id === focus?.id ? "others__on" : undefined}>{seat.alias}</span>)}
    </p>}

    <section className="deck">
      {round.phase === "countdown" && <p className="deck__hint">You're paired with <strong>{focus?.alias}</strong>. Person or machine, you won't know until the reveal.</p>}
      {(round.phase === "chat" || round.phase === "voting") && <Transcript messages={messages} selfId={round.selfId} aliasOf={aliasOf} />}
      {round.phase === "chat" && <Composer key={round.roundId} game={game} roundId={round.roundId} onType={() => selfMouth.speakFor(260)} />}
      {round.phase === "voting" && <VerdictControls key={round.roundId} game={game} round={round} others={others} />}
      {round.phase === "reveal" && <RevealPanel round={round} others={others} busy={busy} onPlayAgain={onPlayAgain} onLobby={onLobby} />}
      {round.phase === "cancelled" && <div className="cancelled">
        <p className="eyebrow">Round ended</p>
        <p>{round.message}</p>
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={onPlayAgain}>Play again</button>
          <button type="button" className="btn btn--ghost" onClick={onLobby}>Lobby</button>
        </div>
      </div>}
    </section>

    {sheetOpen && live && <SafetySheet game={game} roundId={round.roundId} others={others}
      onClose={() => setSheetOpen(false)} />}
  </main>;
}

function formatSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Main frame follows the last other seat to speak; in 1v1 it is always the stranger. */
function useFocusedCounterpart(others: readonly Seat[], messages: readonly { senderId: string }[]): Seat | undefined {
  const ids = new Set(others.map(seat => seat.id));
  const lastSpeaker = [...messages].reverse().find(message => ids.has(message.senderId))?.senderId;
  return others.find(seat => seat.id === lastSpeaker) ?? others[0];
}

/** Burst on round start, verdict lock, and reveal; never on a resumed snapshot. */
function useBursts(round: RoundSnapshot): number {
  const [key, setKey] = useState(0);
  const locked = round.phase === "voting" && round.ownBallot.status === "submitted";
  const previous = useRef<{ roundId: string; phase: RoundSnapshot["phase"]; locked: boolean } | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = { roundId: round.roundId, phase: round.phase, locked };
    if (!before || before.roundId !== round.roundId) return;
    const started = before.phase === "countdown" && round.phase === "chat";
    const lockedNow = round.phase === "voting" && locked && !before.locked;
    const revealed = round.phase === "reveal" && before.phase !== "reveal";
    if (started || lockedNow || revealed) setKey(value => value + 1);
  }, [round.roundId, round.phase, locked]);
  return key;
}

// END Round.tsx
