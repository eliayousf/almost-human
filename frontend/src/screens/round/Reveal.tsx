import type { Recognition, RevealRound } from "@game/game-contract";
import { Hud, SeatTile } from "./parts";
import type { ScreenProps } from "./Round";
import { verdictLabel } from "./Verdict";

/**
 * One reciprocal line from the recognition AGGREGATE (human votes only). No
 * human vote (e.g. an AI counterpart) is the unrated empty state, never a
 * verdict. The API exposes no per-person breakdown, so none is shown.
 */
export function recognitionLine(recognition: Recognition): { text: string; unrated: boolean } {
  const { humanVotesReceived: votes, humanVotesRecognisingYou: yes, fraction } = recognition;
  if (fraction === null || votes === 0) return { text: "Unrated. No human judged you this round.", unrated: true };
  if (votes === 1) return { text: yes ? "They believed you." : "They had you down as a machine.", unrated: false };
  return { text: `${yes} of ${votes} humans believed you.`, unrated: false };
}

/** 4 · Reveal: server-provided kinds, your calls, points, streak, recognition. */
export function RevealScreen({ round, visuals, others, busy, onPlayAgain, onLobby }: ScreenProps & {
  round: RevealRound;
  busy: boolean;
  onPlayAgain: () => void;
  onLobby: () => void;
}) {
  const result = round.yourResult;
  const votes = result.votes ?? [];
  const reciprocal = recognitionLine(result.recognition);
  const kindOf = (id: string) => round.participants.find(seat => seat.id === id)?.kind;
  const perfect = result.ballotStatus === "submitted" && result.correctGuessCount === others.length;
  const headline = result.ballotStatus === "not_submitted" ? "No call made"
    : perfect ? (others.length === 1 ? "Correct call" : "Perfect round")
      : result.correctGuessCount ? "Partly right" : "Fooled";
  const fraction = result.recognition.fraction;

  return <>
    <Hud label="Round over" />
    <div className="room__body room__body--reveal">
      <h1 className="room__title">Who was real?</h1>
      <p className="room__sub">{result.ballotStatus === "submitted" ? "You called it. But did they believe you?" : "You didn't lock a call this round."}</p>

      {others.map(seat => {
        const kind = kindOf(seat.id);
        const vote = votes.find(item => item.participantId === seat.id);
        return <div key={seat.id} className="card card--seat">
          <SeatTile seat={seat} visuals={visuals} variant="thumb" />
          <div className="card__who">
            <p className="card__name">{seat.alias}</p>
            <p className="card__meta mono">
              {vote ? `You said ${verdictLabel(vote.label)} ${vote.label === kind ? "✓" : "✗"}` : "No call"}
            </p>
          </div>
          {kind && <span className={`stamp stamp--${kind} mono`} role="status">{verdictLabel(kind)}</span>}
        </div>;
      })}

      <p className={`reciprocal${reciprocal.unrated ? " reciprocal--unrated" : ""}`}>{reciprocal.text}</p>

      <div className="tally">
        <p className="tally__points">+{result.guessingPointsEarned}</p>
        <p className="tally__head mono">{headline}</p>
        <p className="tally__meta mono">Streak ×{result.streak} · Total {result.totalGuessingPoints.toLocaleString()}</p>
      </div>

      <div className="recog">
        {/* Human judgments only: bot ballots never enter this metric (API aggregate). */}
        <p className="recog__label mono">Recognition · humans who called you human</p>
        <div className="recog__bar" role="meter" aria-label="Share of human counterparts who read you as human"
          aria-valuemin={0} aria-valuemax={1} aria-valuenow={fraction ?? undefined}
          aria-valuetext={fraction === null ? "Not rated" : `${Math.round(fraction * 100)}%`}>
          <span className="recog__fill" style={{ transform: `scaleX(${fraction ?? 0})` }} />
        </div>
        {fraction === null && <p className="recog__label mono">Not rated</p>}
      </div>

      <button type="button" className="cta" disabled={busy} onClick={onPlayAgain}>Play again</button>
      <button type="button" className="cta cta--quiet mono" onClick={onLobby}>Lobby</button>
    </div>
  </>;
}
// END Reveal.tsx
