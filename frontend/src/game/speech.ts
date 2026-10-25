/**
 * Counterpart mouth signal: the SINGLE bind point for what moves the
 * counterpart's mouth layer. Screens and the mouth driver never choose a
 * source themselves.
 *
 * Current source: a LABELLED FIXTURE FALLBACK. When a counterpart message lands
 * in a fixture-mode snapshot, the mouth moves for a duration proportional to
 * the line's length. This is not a typing indicator, says nothing about what
 * the counterpart is doing now, and is never presented as one. In live mode it
 * is off: the counterpart mouth stays still.
 *
 * Remote signal: UNBOUND. Awaiting a verified backend API; do not guess its
 * shape. Replace `FALLBACK` below with that source when it exists.
 *
 * (Your own seat's mouth is separate: it is driven by real local input events
 * in the composer, which is a genuine local signal.)
 */
import { useEffect, useRef } from "react";
import type { RoundSnapshot } from "@game/game-contract";
import { useBinding } from "./binding";

const FALLBACK = "fixture-message-landed" as const;
export const COUNTERPART_MOUTH_SOURCE: typeof FALLBACK | "none" = FALLBACK;

const MS_PER_CHARACTER = 55;
const MIN_MS = 650;
const MAX_MS = 6_500;

export function speechDurationMs(text: string): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHARACTER));
}

/**
 * Fixture fallback: calls onSpeak(durationMs) once per counterpart message that
 * lands while mounted. Messages present at mount (refresh/resume) stay silent.
 * Does nothing outside fixture mode.
 */
export function useCounterpartSpeech(
  round: RoundSnapshot | undefined,
  counterpartId: string | null,
  onSpeak: (durationMs: number) => void,
): void {
  const enabled = useBinding().mode === "fixtures" && COUNTERPART_MOUTH_SOURCE === FALLBACK;
  const seen = useRef<{ roundId: string; ids: Set<string> } | null>(null);
  const speak = useRef(onSpeak);
  speak.current = onSpeak;
  const messages = round && "messages" in round ? round.messages : null;
  const roundId = round?.roundId ?? null;
  useEffect(() => {
    if (!enabled || !roundId || !messages) return;
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
  }, [enabled, roundId, messages, counterpartId]);
}
// END speech.ts
