import { useLayoutEffect, useRef } from "react";
import type { ChatMessage } from "@game/game-contract";

/** Small transcript strip; text rendered as text, own lines by senderId === selfId. */
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
  return <ol ref={list} className="strip" aria-label="Transcript">
    {messages.length === 0 && <li className="strip__empty">No messages yet.</li>}
    {messages.map(message => <li key={message.id} className={message.senderId === selfId ? "strip__me" : undefined}>
      <span className="strip__who mono">{aliasOf(message.senderId)}</span> {message.text}
    </li>)}
  </ol>;
}
// END Transcript.tsx
