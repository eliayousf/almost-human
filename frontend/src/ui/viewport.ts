/**
 * Keeps the app sized to the VISUAL viewport, so the on-screen keyboard never
 * pushes the composer off-screen on iPhone (iOS does not shrink 100dvh for the
 * keyboard). Writes two CSS variables and a `kb-open` class; CSS compresses the
 * transcript and line when the keyboard is up. Falls back to 100dvh.
 */
export function trackVisualViewport(): void {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    root.style.setProperty("--app-h", `${viewport.height}px`);
    root.style.setProperty("--app-top", `${viewport.offsetTop}px`);
    root.classList.toggle("kb-open", window.innerHeight - viewport.height > 120);
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  viewport.addEventListener("resize", schedule);
  viewport.addEventListener("scroll", schedule);
  update();
}
// END viewport.ts
