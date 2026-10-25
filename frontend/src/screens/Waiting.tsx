import { useEffect, useState } from "react";
import type { ApiResult, QueueTicket } from "@game/game-contract";
import type { PlayClient } from "../game/binding";

/**
 * Truthful queue state: "waiting for a counterpart" with elapsed time counting
 * UP from the server's joinedAt. No countdown, no ETA, no inferred fallback.
 * A ticket can wait indefinitely; Cancel is always available.
 */
export function Waiting({ game, queue, cancelling, notice, onCancel, onRejoin }: {
  game: PlayClient;
  queue: ApiResult<QueueTicket> | undefined;
  cancelling: boolean;
  notice: string;
  onCancel: () => void;
  onRejoin: () => void;
}) {
  const closed = queue && !queue.ok && queue.error.code === "QUEUE_CLOSED";
  const joinedAt = queue?.ok ? Date.parse(queue.data.joinedAt) : null;
  const [now, setNow] = useState(() => Date.parse(game.estimatedServerNow()));
  useEffect(() => {
    if (joinedAt === null) return;
    const timer = setInterval(() => setNow(Date.parse(game.estimatedServerNow())), 1_000);
    return () => clearInterval(timer);
  }, [game, joinedAt]);
  const elapsed = joinedAt === null ? null : Math.max(0, Math.floor((now - joinedAt) / 1000));

  if (closed) {
    return <main className="screen screen--center waiting">
      <p className="eyebrow">Queue</p>
      <h1 className="title">Ticket closed</h1>
      <p className="dim">{queue.error.message}</p>
      <button type="button" className="btn btn--primary" onClick={onRejoin}>Join again</button>
    </main>;
  }

  return <main className="screen screen--center waiting">
    <div className="waiting__frame" aria-hidden="true"><span className="waiting__pulse" /></div>
    <p className="eyebrow">Queue</p>
    <h1 className="title" role="status">Waiting for a counterpart</h1>
    <p className="mono dim" aria-label="Time waited">
      {elapsed === null ? "—" : `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")} waited`}
    </p>
    <p className="dim">This can take a while. You can cancel at any time.</p>
    {queue && !queue.ok && <p className="notice" role="alert">{queue.error.message}</p>}
    {notice && <p className="notice" role="alert">{notice}</p>}
    <button type="button" className="btn btn--ghost" disabled={cancelling} onClick={onCancel}>
      {cancelling ? "Cancelling…" : "Cancel"}
    </button>
  </main>;
}
// END Waiting.tsx
