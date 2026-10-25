import type { CSSProperties } from "react";
import { Hud, SeatTile, TopicCard } from "./parts";
import type { ScreenProps } from "./Round";

/** 1 · Room: the seats face each other, 3-2-1, topic sealed. */
export function Paired({ seconds, visuals, ordered, others, onMenu }: ScreenProps) {
  const subtitle = others.length === 1
    ? "One stranger. Convince them you're real."
    : `${others.length + 1} voices. Convince them you're real.`;
  return <>
    <Hud label="Room" onMenu={onMenu} />
    <div className="room__body room__body--paired">
      <h1 className="room__title">Your room</h1>
      <p className="room__sub">{subtitle}</p>
      <div className="tiles tiles--room" style={{ "--n": ordered.length } as CSSProperties}>
        {ordered.map(seat => <SeatTile key={seat.id} seat={seat} visuals={visuals} variant="room"
          mirrored={seat.id === visuals.selfId} />)}
      </div>
      <div className="bigcount" aria-live="polite" key={seconds ?? "wait"}>{seconds ?? "…"}</div>
      <p className="room__hint">Chat opens in a moment</p>
      <TopicCard text={null} />
    </div>
  </>;
}
// END Paired.tsx
