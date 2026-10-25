import type { Seat } from "@game/game-contract";
import { PORTRAITS } from "../../assets/portraits";
import { Portrait, type BurstSignal } from "../../components/Portrait";
import type { MouthDriver } from "../../fx/mouth";

/** Reference-sheet header: red on-air dot, centred mono label, MENU. */
export function Hud({ label, onMenu }: { label: string; onMenu?: () => void }) {
  return <header className="hud">
    <span className="hud__dot" aria-hidden="true" />
    <span className="hud__label mono" role="timer">{label}</span>
    {onMenu
      ? <button type="button" className="hud__menu mono" onClick={onMenu} aria-label="Menu: report, block or leave">Menu</button>
      : <span className="hud__menu" aria-hidden="true" />}
  </header>;
}

export function TopicCard({ text }: { text: string | null }) {
  return <section className="topic" aria-label="Tonight's topic">
    <p className="topic__eyebrow mono">Tonight's topic</p>
    <p className={text ? "topic__text" : "topic__text topic__text--sealed"}>{text ?? "Revealed when the timer starts"}</p>
  </section>;
}

export interface SeatVisuals {
  selfId: string;
  focusId: string | null;
  selfMouth: MouthDriver;
  strangerMouth: MouthDriver;
  burst: BurstSignal;
}

/**
 * One portrait tile per seat. Your seat gets the hatched treatment and a YOU
 * tag; the focused counterpart carries the mouth signal and the burst. Tile
 * art is chosen by seat position only and never encodes a role.
 */
export function SeatTile({ seat, visuals, variant, mirrored = false, label }: {
  seat: Seat;
  visuals: SeatVisuals;
  variant: "room" | "air" | "thumb";
  mirrored?: boolean;
  label?: "top" | "bottom" | "none";
}) {
  const self = seat.id === visuals.selfId;
  const focus = seat.id === visuals.focusId;
  const placement = label ?? (variant === "air" ? "top" : variant === "room" ? "bottom" : "none");
  return <Portrait
    asset={self ? PORTRAITS.self : PORTRAITS.stranger}
    className={`tile tile--${variant}${self ? " tile--you" : ""}`}
    label={self ? "Your seat" : `${seat.alias}'s portrait`}
    mouth={self ? visuals.selfMouth : focus ? visuals.strangerMouth : undefined}
    burst={focus ? visuals.burst : undefined}
    mirrored={mirrored}
    hatched={self}>
    {self && variant !== "thumb" && <span className="tile__you mono">You</span>}
    {placement !== "none" && <span className={`tile__name tile__name--${placement} mono`}>{seat.alias}</span>}
  </Portrait>;
}
// END parts.tsx
