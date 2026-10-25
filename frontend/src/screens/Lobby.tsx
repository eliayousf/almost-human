import { useState } from "react";
import type { ApiResult, LeaderboardView, SessionView } from "@game/game-contract";
import { Copy } from "../components/Copy";
import { consentCopy, POLICY_VERSION } from "../copy/consent";
import { command, type PlayClient } from "../game/binding";

export function Lobby({ game, session, leaderboard, joining, notice, onPlay }: {
  game: PlayClient;
  session: SessionView;
  leaderboard: ApiResult<LeaderboardView> | undefined;
  joining: boolean;
  notice: string;
  onPlay: () => void;
}) {
  const [consentPending, setConsentPending] = useState(false);
  const [consentNotice, setConsentNotice] = useState("");

  async function toggleTraining(trainingOptIn: boolean) {
    setConsentPending(true);
    try {
      const result = await game.setTrainingConsent({ ...command(), policyVersion: POLICY_VERSION, trainingOptIn });
      setConsentNotice(result.ok ? "" : result.error.message);
    } finally {
      setConsentPending(false);
    }
  }

  return <main className="screen screen--scroll lobby">
    <header className="lobby__head">
      <p className="wordmark">ALMOST HUMAN</p>
      <p className="lobby__pitch">One stranger. One minute.<br />Convince them you're human, and decide what <em>they</em> are.</p>
    </header>

    <section className="lobby__me" aria-label="Your player">
      <div>
        <p className="label">Playing as</p>
        <p className="lobby__alias">{session.leaderboardAlias}</p>
      </div>
      <div className="lobby__score">
        <p className="label">Score</p>
        <p className="score">{session.totalGuessingPoints.toLocaleString()}</p>
      </div>
    </section>

    {notice && <p className="notice" role="alert">{notice}</p>}
    <button type="button" className="btn btn--play" disabled={joining} onClick={onPlay}>
      {joining ? "Joining…" : "Play"}
    </button>

    <section className="lobby__training" aria-label="Optional training consent">
      <label className="check">
        <input type="checkbox" checked={session.trainingOptIn} disabled={consentPending}
          onChange={event => { void toggleTraining(event.target.checked); }} />
        <Copy slot={consentCopy.trainingToggle} />
      </label>
      <Copy as="p" slot={consentCopy.trainingDetail} />
      {consentNotice && <p className="notice" role="alert">{consentNotice}</p>}
    </section>

    <section className="board" aria-label="Leaderboard">
      <h2 className="label">Leaderboard</h2>
      {!leaderboard && <p className="dim">Loading scores…</p>}
      {leaderboard && !leaderboard.ok && <p className="notice">{leaderboard.error.message}</p>}
      {leaderboard?.ok && <ol className="board__list">
        {leaderboard.data.entries.slice(0, 10).map(entry => <li key={entry.entryId}
          className={entry.entryId === session.leaderboardEntryId ? "board__row board__row--me" : "board__row"}>
          <span className="board__rank">{entry.rank}</span>
          <span className="board__alias">{entry.alias}</span>
          <span className="board__pts">{entry.guessingPoints.toLocaleString()}</span>
        </li>)}
      </ol>}
    </section>
  </main>;
}
// END Lobby.tsx
