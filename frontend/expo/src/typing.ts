/** Throttle activity only; draft text never leaves the composer. */
export function createTypingReporter(send: (typing: boolean) => void) {
  let active = false;
  let lastSent = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    clearTimeout(timer);
    if (active) send(false);
    active = false;
  };
  return {
    update(typing: boolean) {
      if (!typing) { stop(); return; }
      if (!active || Date.now() - lastSent >= 1500) {
        send(true);
        lastSent = Date.now();
      }
      active = true;
      clearTimeout(timer);
      timer = setTimeout(stop, 2500);
    },
    stop,
  };
}
