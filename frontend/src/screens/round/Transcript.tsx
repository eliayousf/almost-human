import { useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@game/game-contract";

/** Transcript: mono speaker label over each line; own lines bold. Text only, never HTML. */
export function Transcript({ messages, selfId, aliasOf }: {
  messages: readonly ChatMessage[];
  selfId: string;
  aliasOf: (id: string) => string;
}) {
  const list = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  return <ol ref={list} className="log" aria-label="Transcript" aria-live="polite">
    {messages.length === 0 && <li className="log__empty mono">No messages yet. Say something.</li>}
    {messages.map(message => <li key={message.id} className={message.senderId === selfId ? "log__me" : undefined}>
      <span className="log__who mono">{aliasOf(message.senderId)}</span>
      <span className="log__text">{message.text}</span>
    </li>)}
  </ol>;
}
// END Transcript.tsx
