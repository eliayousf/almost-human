/**
 * Counterpart speech signal: the single module the counterpart's mouth listens to.
 *
 * Bound source (only one): a counterpart message LANDING in the round snapshot.
 * The mouth then moves for a duration proportional to the line's length, as if
 * finishing saying it. It is never presented as a live typing indicator.
 *
 * Remote typing presence: UNBOUND. Awaiting verified backend typing API - do not
 * guess the shape. The pinned contract carries no typing state, and nothing here
 * assumes any remote field, function, or payload. When a verified API exists,
 * bind it inside this module only; screens and the mouth layer stay unchanged.
 */
import { useEffect, useRef } from "react";
import type { RoundSnapshot } from "@game/game-contract";

const MS_PER_CHARACTER = 55;
const MIN_MS = 650;
const MAX_MS = 6_500;

export function speechDurationMs(text: string): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHARACTER));
}

/**
 * Calls onSpeak(durationMs) once per counterpart message that arrives while
 * mounted. Messages already present at mount (refresh/resume) stay silent.
 */
export function useCounterpartSpeech(
  round: RoundSnapshot | undefined,
  counterpartId: string | null,
  onSpeak: (durationMs: number) => void,
): void {
  const seen = useRef<{ roundId: string; ids: Set<string> } | null>(null);
  const speak = useRef(onSpeak);
  speak.current = onSpeak;
  const messages = round && "messages" in round ? round.messages : null;
  const roundId = round?.roundId ?? null;
  useEffect(() => {
    if (!roundId || !messages) return;
    if (seen.current?.roundId !== roundId) {
      seen.current = { roundId, ids: new Set(messages.map(message => message.id)) };
      return;
    }
    const ids = seen.current.ids;
    for (const message of messages) {
      if (ids.has(message.id)) continue;
      ids.add(message.id);
      if (message.senderId === counterpartId) speak.current(speechDurationMs(message.text));
    }
  }, [roundId, messages, counterpartId]);
}
