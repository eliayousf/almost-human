import { useSyncExternalStore } from "react";

const query = typeof window !== "undefined" && window.matchMedia
  ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/** Read at call time so in-flight effects stop as soon as the setting changes. */
export function prefersReducedMotion(): boolean {
  return query?.matches ?? false;
}

export function onReducedMotionChange(listener: () => void): () => void {
  query?.addEventListener("change", listener);
  return () => query?.removeEventListener("change", listener);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(onReducedMotionChange, prefersReducedMotion, () => false);
}
