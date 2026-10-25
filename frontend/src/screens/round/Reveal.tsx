import type { HumanOrAi, Recognition, RevealRound, Seat } from "@game/game-contract";
import { verdictLabel } from "./Verdict";

/** The stamp over the counterpart's face; server-provided kind only. */
export function RevealStamp({ kind }: { kind: HumanOrAi }) {
  return <span className={`stamp stamp--${kind}`} role="status">{verdictLabel(kind)}</span>;
}

/**
 * One reciprocal line from the recognition AGGREGATE (human votes only). With
 * no human vote (e.g. an AI counterpart) it is the unrated empty state, never a
 * verdict. No per-person breakdown exists in the API, so none is shown.
 */
export function recognitionLine(recognition: Recognition): { text: string; unrated: boolean } {
  const { humanVotesReceived: votes, humanVotesRecognisingYou: yes, fraction } = recognition;
  if (fraction === null || votes === 0) return { text: "Unrated. No human judged you this round.", unrated: true };
  if (votes === 1) return { text: yes ? "They read you as human." : "They had you down as a machine.", unrated: false };
  return { text: `${yes} of ${votes} humans read you as human.`, unrated: false };
}

export function RevealPanel({ round, others, busy, onPlayAgain, onLobby }: {
  round: RevealRound;
  others: readonly Seat[];
  busy: boolean;
  onPlayAgain: () => void;
  onLobby: () => void;
}) {
  const result = round.yourResult;
  const votes = result.votes ?? [];
  const reciprocal = recognitionLine(result.recognition);
  const kindOf = (id: string) => round.participants.find(seat => seat.id === id)?.kind;

  return <div className="reveal">
    <ul className="reveal__calls">
      {result.ballotStatus === "not_submitted" && <li className="dim">No call made. No points this round.</li>}
      {votes.map(vote => {
        const right = kindOf(vote.participantId) === vote.label;
        return <li key={vote.participantId}>
          {others.length > 1 && <span className="mono">{others.find(seat => seat.id === vote.participantId)?.alias} · </span>}
          You called <span className={`tag tag--${vote.label}`}>{verdictLabel(vote.label)}</span>
          <span className={right ? "reveal__right" : "reveal__wrong"}>{right ? "Correct" : "Wrong"}</span>
        </li>;
      })}
      {others.length > 1 && others.map(seat => <li key={seat.id} className="mono dim">
        {seat.alias} was {kindOf(seat.id) === "human" ? "human" : "a machine"}
      </li>)}
    </ul>
    <div className="reveal__score">
      <span className="points">+{result.guessingPointsEarned}</span>
      <span className="reveal__meta mono">
        <span>Streak {result.streak}</span>
        <span>Total {result.totalGuessingPoints.toLocaleString()}</span>
      </span>
    </div>
    <p className={`reciprocal${reciprocal.unrated ? " reciprocal--unrated" : ""}`}>{reciprocal.text}</p>
    <div className="row">
      <button type="button" className="btn btn--primary" disabled={busy} onClick={onPlayAgain}>Play again</button>
      <button type="button" className="btn btn--ghost" onClick={onLobby}>Lobby</button>
    </div>
  </div>;
}
// END Reveal.tsx
