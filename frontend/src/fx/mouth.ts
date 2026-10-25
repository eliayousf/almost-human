/**
 * Mouth flap driver: a 3-frame stepped scaleY flap on a separate layer over the
 * portrait. rAF-driven, transform/opacity writes only, and it runs only while
 * speaking. Under prefers-reduced-motion it never starts and snaps closed.
 */
import { useEffect, useState } from "react";
import { onReducedMotionChange, prefersReducedMotion } from "./motion";

const FRAMES = [0.08, 0.55, 1] as const; // closed, half, open
const SEQUENCE = [1, 2, 1, 0, 2, 1, 2, 0, 1, 0] as const;
const FRAME_MS = 85;

export class MouthDriver {
  private el: HTMLElement | null = null;
  private until = 0;
  private raf = 0;
  private step = 0;
  private lastStepAt = 0;
  private shown = -1;
  private unsubscribe: (() => void) | null = null;

  constructor() {
    this.loop = this.loop.bind(this);
  }

  /** Bind to the mouth layer element; null detaches and stops cleanly. */
  attach(el: HTMLElement | null): void {
    if (this.el === el) return;
    this.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.el = el;
    this.shown = -1;
    if (!el) return;
    this.render(0);
    this.unsubscribe = onReducedMotionChange(() => { if (prefersReducedMotion()) this.stop(); });
  }

  /** Keep talking for at least `ms` from now (local input pulses or a landed line). */
  speakFor(ms: number): void {
    if (!this.el || prefersReducedMotion()) return;
    this.until = Math.max(this.until, performance.now() + ms);
    if (!this.raf) {
      this.lastStepAt = 0;
      this.raf = requestAnimationFrame(this.loop);
    }
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.until = 0;
    this.render(0);
  }

  private loop(now: number): void {
    if (now >= this.until) {
      this.stop();
      return;
    }
    if (now - this.lastStepAt >= FRAME_MS) {
      this.lastStepAt = now;
      this.step = (this.step + 1) % SEQUENCE.length;
      this.render(SEQUENCE[this.step]);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private render(frame: number): void {
    if (!this.el || frame === this.shown) return;
    this.shown = frame;
    this.el.style.transform = `translate(-50%, -50%) scaleY(${FRAMES[frame]})`;
    this.el.style.opacity = frame === 0 ? "0" : "1";
  }
}

/** One stable driver per seat for the component's lifetime. */
export function useMouth(): MouthDriver {
  const [driver] = useState(() => new MouthDriver());
  useEffect(() => () => driver.stop(), [driver]);
  return driver;
}
// END mouth.ts
