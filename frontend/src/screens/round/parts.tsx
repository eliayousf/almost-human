import type { Seat } from "@game/game-contract";
import type { FaceId } from "../../assets/cast";
import { Portrait, type BurstSignal } from "../../components/Portrait";
import { useTalking, type TalkSignal } from "../../fx/talk";

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
  /** Per seat id, from the cast bind point (assets/cast.ts) only. */
  faces: ReadonlyMap<string, FaceId | null>;
  /** Your Talk: real local keystrokes. */
  selfTalk: TalkSignal;
  /** Focused counterpart's Talk: fixture fallback only (game/speech.ts). */
  strangerTalk: TalkSignal;
  burst: BurstSignal;
}

/**
 * One cast tile per seat. Your seat gets an amber edge and a YOU tag; the
 * focused counterpart carries the Talk signal and the burst. The face comes
 * from the cast bind point and never encodes a role. Loop state: smile on the
 * verdict/reveal screens, otherwise talk while the seat's signal is on, else
 * idle.
 */
export function SeatTile({ seat, visuals, variant, mirrored = false, label, status, live = false, smile = false }: {
  seat: Seat;
  visuals: SeatVisuals;
  variant: "room" | "air" | "thumb";
  mirrored?: boolean;
  label?: "top" | "bottom" | "none";
  /** Small corner tag; callers derive it from snapshot data only. */
  status?: string;
  /** Brighter edge for the seat that spoke last. */
  live?: boolean;
  smile?: boolean;
}) {
  const self = seat.id === visuals.selfId;
  const focus = seat.id === visuals.focusId;
  const talking = useTalking(self ? visuals.selfTalk : focus ? visuals.strangerTalk : null);
  const placement = label ?? (variant === "air" ? "top" : variant === "room" ? "bottom" : "none");
  return <Portrait
    faceId={visuals.faces.get(seat.id) ?? null}
    state={smile ? "smile" : talking ? "talk" : "idle"}
    className={`tile tile--${variant}${self ? " tile--you" : ""}${live ? " tile--live" : ""}${talking ? " is-speaking" : ""}`}
    label={self ? "Your seat" : `${seat.alias}'s portrait`}
    burst={focus ? visuals.burst : undefined}
    mirrored={mirrored}>
    {self && variant !== "thumb" && <span className="tile__you mono">You</span>}
    {placement !== "none" && <span className={`tile__name tile__name--${placement} mono`}>{seat.alias}</span>}
    {/* Equalizer: shown only while this seat's Talk signal is on (the same
        signal as its talk loop). It represents no audio; none exists. */}
    {(self || focus) && variant === "air" && <span className="eq" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ animationDelay: `${(index * 53) % 240}ms` }} />)}
    </span>}
    {status && <span className="tile__status mono">{status}</span>}
  </Portrait>;
}
// END parts.tsx
