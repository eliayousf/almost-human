/**
 * Talk signal: a per-seat "speaking until" window that switches a cast card
 * from its idle loop to its talk loop. Callers extend the window with
 * speakFor(ms); it ends on its own. No rAF, no DOM writes: components read it
 * through useTalking().
 */
import { useEffect, useState, useSyncExternalStore } from "react";

export class TalkSignal {
  private talking = false;
  private until = 0;
  private timer = 0;
  private listeners = new Set<() => void>();

  constructor() {
    this.subscribe = this.subscribe.bind(this);
    this.isTalking = this.isTalking.bind(this);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  isTalking(): boolean {
    return this.talking;
  }

  /** Keep talking for at least `ms` from now (local keystrokes or a landed line). */
  speakFor(ms: number): void {
    const until = performance.now() + ms;
    if (until <= this.until) return;
    this.until = until;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.stop(), ms);
    this.set(true);
  }

  stop(): void {
    clearTimeout(this.timer);
    this.until = 0;
    this.set(false);
  }

  private set(talking: boolean): void {
    if (talking === this.talking) return;
    this.talking = talking;
    for (const listener of this.listeners) listener();
  }
}

/** One stable signal per seat for the component's lifetime. */
export function useTalk(): TalkSignal {
  const [signal] = useState(() => new TalkSignal());
  useEffect(() => () => signal.stop(), [signal]);
  return signal;
}

const SILENT = () => false;
const NOOP = () => () => {};

export function useTalking(signal: TalkSignal | null | undefined): boolean {
  return useSyncExternalStore(signal?.subscribe ?? NOOP, signal?.isTalking ?? SILENT);
}
