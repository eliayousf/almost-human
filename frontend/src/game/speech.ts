/**
 * Counterpart speech signal: the single module the counterpart's Talk loop and
 * the style-only READING YOU caption listen to.
 *
 * LABELLED FIXTURE FALLBACK ONLY. The one trigger is a counterpart message
 * LANDING in a fixture round snapshot: their card then plays its talk loop for
 * a duration proportional to the line's length. This is NOT a typing,
 * presence, attention, or audio indicator, and it is never presented as one.
 *
 * Remote typing/presence: UNBOUND. Awaiting a verified backend signal - do not
 * guess the shape. Outside fixture mode REMOTE_SIGNAL is null, so the
 * counterpart stays on its idle loop and READING YOU stays off. When a verified
 * API exists, bind it inside this module only; screens and cards stay unchanged.
 */
import { useEffect, useRef } from "react";
import type { RoundSnapshot } from "@game/game-contract";

/** Which source drives remote Talk/READING YOU. null = off (no fake presence). */
export const REMOTE_SIGNAL: "fixture-message-landing" | null =
  import.meta.env.MODE === "fixtures" ? "fixture-message-landing" : null;

/**
 * Style-only cues (equalizer bars, READING YOU) render only while a remote
 * signal source is bound. Today that is the fixture fallback alone, so they
 * never render in live mode.
 */
export const STYLE_CUES = REMOTE_SIGNAL !== null;

/** How long the counterpart card reads as listening after its Talk loop ends. */
export const LISTEN_MS = 6_000;

const MS_PER_CHARACTER = 55;
const MIN_MS = 650;
const MAX_MS = 6_500;

export function speechDurationMs(text: string): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, text.length * MS_PER_CHARACTER));
}

/**
 * FIXTURE FALLBACK: calls onSpeak(durationMs) once per counterpart message
 * that arrives while mounted. Messages already present at mount
 * (refresh/resume) stay silent. Inert outside fixture mode.
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
    if (!REMOTE_SIGNAL || !roundId || !messages) return;
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

/**
 * Style-only READING YOU caption on the focused counterpart. Driven ONLY by the
 * same fixture trigger as its Talk loop (its own message landing): once that
 * Talk ends, the card reads as listening for LISTEN_MS. Your own keystrokes and
 * your own messages never turn it on. Not a typing/presence indicator; always
 * false outside fixture mode.
 */
export function showsReadingYou(counterpartListening: boolean, counterpartTalking: boolean): boolean {
  return STYLE_CUES && counterpartListening && !counterpartTalking;
}
// END speech.ts
