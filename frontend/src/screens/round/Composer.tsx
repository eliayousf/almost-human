import { useEffect, useRef, useState, type FormEvent } from "react";
import { GAME_DEFAULTS } from "@game/game-contract";
import type { PlayClient } from "../../game/binding";

/**
 * Chat composer. Typed text survives failures; a network retry reuses the same
 * clientRequestId and payload; RATE_LIMITED respects retryAfterMs. `onType`
 * fires on real local input events only (drives your own seat's mouth).
 */
export function Composer({ game, roundId, onType }: {
  game: PlayClient;
  roundId: string;
  onType: () => void;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [waitUntil, setWaitUntil] = useState(0);
  const [, setTick] = useState(0);
  const attempt = useRef<{ text: string; clientRequestId: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const limited = waitUntil > Date.now();

  useEffect(() => {
    if (!waitUntil) return;
    const timer = setTimeout(() => { setWaitUntil(0); setTick(value => value + 1); }, Math.max(0, waitUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [waitUntil]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (pending || limited || !trimmed) return;
    if (attempt.current?.text !== text) attempt.current = { text, clientRequestId: crypto.randomUUID() };
    setPending(true);
    try {
      const result = await game.sendMessage(roundId, { clientRequestId: attempt.current.clientRequestId, text });
      if (result.ok) {
        setText("");
        setNotice("");
        attempt.current = null;
        return;
      }
      setNotice(result.error.message);
      if (result.error.code !== "SERVICE_UNAVAILABLE") attempt.current = null;
      if (result.error.code === "RATE_LIMITED" && result.error.retryAfterMs) setWaitUntil(Date.now() + result.error.retryAfterMs);
    } finally {
      setPending(false);
      // Keep the keyboard up on iPhone after sending.
      input.current?.focus({ preventScroll: true });
    }
  }

  const remaining = GAME_DEFAULTS.maxMessageCharacters - text.length;
  return <form className="composer" onSubmit={event => { void send(event); }}>
    {notice && <p className="notice notice--compact" role="alert">{notice}</p>}
    <div className="composer__row">
      <input ref={input} className="composer__input" value={text} maxLength={GAME_DEFAULTS.maxMessageCharacters}
        placeholder="Convince them…" aria-label="Your message" autoComplete="off" autoCorrect="on"
        enterKeyHint="send" onChange={event => { setText(event.target.value); onType(); }}
        onKeyDown={event => { if (event.key.length === 1 || event.key === "Backspace") onType(); }} />
      <button className="btn btn--send" disabled={pending || limited || !text.trim()}>{pending ? "…" : "Send"}</button>
    </div>
    {remaining < 60 && <p className="composer__count mono" aria-live="polite">{remaining}</p>}
  </form>;
}
// END Composer.tsx
