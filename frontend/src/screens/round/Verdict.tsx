import { useRef, useState } from "react";
import { GAME_DEFAULTS, type HumanOrAi, type SubmitVotesInput, type VotingRound } from "@game/game-contract";
import { Hud, SeatTile } from "./parts";
import { formatSeconds, type ScreenProps } from "./Round";

export const verdictLabel = (label: HumanOrAi) => label === "human" ? "Human" : "Machine";
const DASHES = 10;

/**
 * 3 · Verdict. One HUMAN|MACHINE call per other seat (one in a 2-seat room),
 * then an explicit lock: ballots are immutable and an unsubmitted ballot
 * scores 0, so nothing auto-submits. Lock state follows ownBallot.
 */
export function VerdictScreen({ game, round, seconds, visuals, others, onMenu }: ScreenProps & { round: VotingRound }) {
  const [choices, setChoices] = useState<Record<string, HumanOrAi>>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const attempt = useRef<SubmitVotesInput | null>(null);
  const ballot = round.ownBallot;
  const locked = ballot.status === "submitted";
  const callOf = (id: string) => locked ? ballot.votes.find(vote => vote.participantId === id)?.label : choices[id];
  const complete = others.every(seat => choices[seat.id]);
  const lit = seconds === null ? DASHES : Math.ceil((seconds / (GAME_DEFAULTS.votingMs / 1000)) * DASHES);
  const self = round.participants.find(seat => seat.id === round.selfId);

  async function lock() {
    if (!complete || pending || locked) return;
    const votes = others.map(seat => ({ participantId: seat.id, label: choices[seat.id] }));
    if (!attempt.current || JSON.stringify(attempt.current.votes) !== JSON.stringify(votes)) {
      attempt.current = { clientRequestId: crypto.randomUUID(), votes };
    }
    setPending(true);
    try {
      const result = await game.submitVotes(round.roundId, attempt.current);
      setNotice(result.ok ? "" : result.error.message);
      if (!result.ok && result.error.code !== "SERVICE_UNAVAILABLE") attempt.current = null;
    } finally {
      setPending(false);
    }
  }

  return <>
    <Hud label={`Verdict · ${formatSeconds(seconds)}`} onMenu={onMenu} />
    <div className="room__body room__body--verdict">
      <h1 className="room__title">Who's human?</h1>
      <p className="room__sub">{others.length === 1 ? "Call it. They're calling you too." : "Call it for each voice. They're calling you too."}</p>
      <div className="dashes" aria-hidden="true">
        {Array.from({ length: DASHES }, (_, index) => <span key={index} className={index < lit ? "is-lit" : undefined} />)}
      </div>

      {others.map(seat => {
        const call = callOf(seat.id);
        return <div key={seat.id} className="card card--seat">
          <SeatTile seat={seat} visuals={visuals} variant="thumb" />
          <div className="card__who">
            <p className="card__name">{seat.alias}</p>
            <p className="card__meta mono">{locked ? "Locked" : "Your call"}</p>
          </div>
          <div className="pill" role="radiogroup" aria-label={`Your call on ${seat.alias}`}>
            {(["human", "ai"] as const).map(label => <button key={label} type="button" role="radio"
              aria-checked={call === label} disabled={locked || pending}
              className={`pill__opt pill__opt--${label}${call === label ? " is-on" : ""}`}
              onClick={() => setChoices(current => ({ ...current, [seat.id]: label }))}>
              {verdictLabel(label)}
            </button>)}
          </div>
        </div>;
      })}

      {self && <div className="card card--seat card--you">
        <SeatTile seat={self} visuals={visuals} variant="thumb" />
        <div className="card__who">
          <p className="card__name">You · {self.alias}</p>
          <p className="card__meta mono">{others.length === 1 ? "The stranger's read on you" : "The room's read on you"}</p>
        </div>
        {/* Always unknown before reveal: no judgment exists to show. */}
        <span className="card__unknown mono" aria-label="Unknown until the reveal">? ? ?</span>
      </div>}

      {notice && <p className="notice notice--compact" role="alert">{notice}</p>}
      <p className="room__fine mono">{locked ? "Locked. Waiting for the reveal." : "Lock your call before the timer hits zero"}</p>
      {!locked && <button type="button" className="cta" disabled={!complete || pending} onClick={() => { void lock(); }}>
        {pending ? "Locking…" : complete ? "Lock verdict" : "Make your call"}
      </button>}
    </div>
  </>;
}
// END Verdict.tsx
