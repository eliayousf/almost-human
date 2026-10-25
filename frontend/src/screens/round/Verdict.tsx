import { useRef, useState } from "react";
import type { HumanOrAi, Seat, SubmitVotesInput, VotingRound } from "@game/game-contract";
import type { PlayClient } from "../../game/binding";

export const verdictLabel = (label: HumanOrAi) => label === "human" ? "HUMAN" : "MACHINE";

/**
 * One guess per other seat (one in a 2-seat room), then an explicit lock:
 * ballots are immutable once submitted. The lock state follows ownBallot from
 * the live round, never a local assumption.
 */
export function VerdictControls({ game, round, others }: {
  game: PlayClient;
  round: VotingRound;
  others: readonly Seat[];
}) {
  const [choices, setChoices] = useState<Record<string, HumanOrAi>>({});
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const attempt = useRef<SubmitVotesInput | null>(null);
  const ballot = round.ownBallot;

  if (ballot.status === "submitted") {
    return <div className="verdict verdict--locked" role="status">
      <p className="eyebrow">Verdict locked</p>
      <p className="verdict__locked">
        {ballot.votes.map(vote => <span key={vote.participantId} className={`tag tag--${vote.label}`}>
          {others.length > 1 && <>{others.find(seat => seat.id === vote.participantId)?.alias} · </>}
          {verdictLabel(vote.label)}
        </span>)}
      </p>
      <p className="dim">Waiting for the reveal.</p>
    </div>;
  }

  const complete = others.every(seat => choices[seat.id]);
  async function lock() {
    if (!complete || pending) return;
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

  return <div className="verdict">
    {others.map(seat => <div key={seat.id} className="verdict__seat" role="radiogroup"
      aria-label={others.length > 1 ? `Your call on ${seat.alias}` : "Your call"}>
      {others.length > 1 && <span className="verdict__alias mono">{seat.alias}</span>}
      <div className="verdict__pair">
        {(["human", "ai"] as const).map(label => <button key={label} type="button" role="radio"
          aria-checked={choices[seat.id] === label} disabled={pending}
          className={`btn btn--call btn--${label}${choices[seat.id] === label ? " is-on" : ""}`}
          onClick={() => setChoices(current => ({ ...current, [seat.id]: label }))}>
          {verdictLabel(label)}
        </button>)}
      </div>
    </div>)}
    {notice && <p className="notice notice--compact" role="alert">{notice}</p>}
    <button type="button" className="btn btn--lock" disabled={!complete || pending} onClick={() => { void lock(); }}>
      {pending ? "Locking…" : complete ? "Lock verdict" : "Make your call"}
    </button>
  </div>;
}
// END Verdict.tsx
