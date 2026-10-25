import type { CSSProperties } from "react";
import { GAME_DEFAULTS, type ChatRound } from "@game/game-contract";
import { useTalking } from "../../fx/talk";
import { showsReadingYou } from "../../game/speech";
import { Composer } from "./Composer";
import { Hud, SeatTile, TopicCard } from "./parts";
import { formatSeconds, type ScreenProps } from "./Round";
import { Transcript } from "./Transcript";

/** 2 · On air: portrait tiles, pinned topic, transcript, composer. */
export function OnAir({ game, round, seconds, roundNumber, visuals, ordered, onMenu }: ScreenProps & { round: ChatRound }) {
  const remaining = seconds === null ? 1 : Math.min(1, seconds / (GAME_DEFAULTS.chatMs / 1000));
  const lastSender = round.messages.at(-1)?.senderId ?? null;
  const readingYou = showsReadingYou(lastSender, round.selfId, useTalking(visuals.strangerTalk));
  const aliasOf =(id: string) => id === round.selfId ? "You" : round.participants.find(seat => seat.id === id)?.alias ?? "—";
  return <>
    <Hud label={`Round ${roundNumber} · ${formatSeconds(seconds)}`} onMenu={onMenu} />
    <div className="progress" aria-hidden="true">
      <span className="progress__fill" style={{ transform: `scaleX(${remaining})` }} />
    </div>
    <div className="room__body room__body--air">
      <div className="tiles tiles--air" style={{ "--n": ordered.length } as CSSProperties}>
        {ordered.map(seat => <SeatTile key={seat.id} seat={seat} visuals={visuals} variant="air"
          live={seat.id === lastSender}
          // Style-only fixture caption (speech.ts): not a typing/presence
          // indicator; always off outside fixture mode.
          status={seat.id === visuals.focusId && readingYou ? "Reading you" : undefined} />)}
      </div>
      <TopicCard text={round.topic.text} />
      <Transcript messages={round.messages} selfId={round.selfId} aliasOf={aliasOf} />
      <Composer key={round.roundId} game={game} roundId={round.roundId} onType={() => visuals.selfTalk.speakFor(260)} />
    </div>
  </>;
}
// END OnAir.tsx
