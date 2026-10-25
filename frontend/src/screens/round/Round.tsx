import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, RoundSnapshot, Seat } from "@game/game-contract";
import { castFaces } from "../../assets/cast";
import { useTalk } from "../../fx/talk";
import type { PlayClient } from "../../game/binding";
import { useCounterpartSpeech } from "../../game/speech";
import "./round.css";
import { OnAir } from "./OnAir";
import { Paired } from "./Paired";
import { Hud, type SeatVisuals } from "./parts";
import { RevealScreen } from "./Reveal";
import { SafetySheet } from "./SafetySheet";
import { VerdictScreen } from "./Verdict";

export interface ScreenProps {
  game: PlayClient;
  seconds: number | null;
  roundNumber: number;
  visuals: SeatVisuals;
  /** Seats in tile order: counterparts around your seat (1v1: stranger, you). */
  ordered: readonly Seat[];
  others: readonly Seat[];
  onMenu?: () => void;
}

/**
 * The four reference-sheet screens (Room, On air, Verdict, Reveal), routed by
 * the server phase. Seats render by `participants` length; a 2-seat room is
 * the 1v1 layout. Nothing here infers or displays a seat's role pre-reveal.
 */
export function Round({ game, round, seconds, busy, roundNumber, onPlayAgain, onLobby }: {
  game: PlayClient;
  round: RoundSnapshot;
  seconds: number | null;
  busy: boolean;
  roundNumber: number;
  onPlayAgain: () => void;
  onLobby: () => void;
}) {
  const others = useMemo(() => round.participants.filter(seat => seat.id !== round.selfId), [round.participants, round.selfId]);
  const self = round.participants.find(seat => seat.id === round.selfId);
  const ordered = useMemo(() => {
    if (!self) return others;
    const middle = others.length === 1 ? 1 : Math.floor(others.length / 2);
    return [...others.slice(0, middle), self, ...others.slice(middle)];
  }, [others, self]);
  const messages = "messages" in round ? round.messages : [];
  const focus = focusedCounterpart(others, messages);
  const selfTalk = useTalk();
  const strangerTalk = useTalk();
  const burst = useBursts(round);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Labelled fixture fallback only; inert outside fixture mode (see speech.ts).
  useCounterpartSpeech(round, focus?.id ?? null, ms => strangerTalk.speakFor(ms));
  const faces = useMemo(() => castFaces(round.roundId, round.participants), [round.roundId, round.participants]);

  const visuals = useMemo<SeatVisuals>(() => ({
    selfId: round.selfId, focusId: focus?.id ?? null, faces, selfTalk, strangerTalk, burst,
  }), [round.selfId, focus?.id, faces, selfTalk, strangerTalk, burst]);
  const live = round.phase === "countdown" || round.phase === "chat" || round.phase === "voting";
  const props: ScreenProps = {
    game, seconds, roundNumber, visuals, ordered, others,
    onMenu: live ? () => setSheetOpen(true) : undefined,
  };

  return <main className={`room room--${round.phase}`} data-seats={round.participants.length}>
    {round.phase === "countdown" && <Paired {...props} />}
    {round.phase === "chat" && <OnAir {...props} round={round} />}
    {round.phase === "voting" && <VerdictScreen {...props} round={round} />}
    {round.phase === "reveal" && <RevealScreen {...props} round={round} busy={busy} onPlayAgain={onPlayAgain} onLobby={onLobby} />}
    {round.phase === "cancelled" && <>
      <Hud label="Round ended" />
      <div className="room__body room__body--center">
        <h1 className="room__title">Round ended</h1>
        <p className="room__sub">{round.message}</p>
        <button type="button" className="cta" disabled={busy} onClick={onPlayAgain}>Next room</button>
        <button type="button" className="cta cta--quiet" onClick={onLobby}>Lobby</button>
      </div>
    </>}
    {sheetOpen && live && <SafetySheet game={game} roundId={round.roundId} others={others}
      onClose={() => setSheetOpen(false)} />}
  </main>;
}

export function formatSeconds(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The burst/Talk target follows the last other seat to speak; in 1v1 it is the stranger. */
function focusedCounterpart(others: readonly Seat[], messages: readonly ChatMessage[]): Seat | undefined {
  const ids = new Set(others.map(seat => seat.id));
  const lastSpeaker = [...messages].reverse().find(message => ids.has(message.senderId))?.senderId;
  return others.find(seat => seat.id === lastSpeaker) ?? others[0];
}

/** Burst on round start, verdict lock, and reveal; never on a resumed snapshot. */
function useBursts(round: RoundSnapshot) {
  const [key, setKey] = useState(0);
  const consumed = useRef(0);
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
  return useMemo(() => ({ key, consumed }), [key]);
}
// END Round.tsx
