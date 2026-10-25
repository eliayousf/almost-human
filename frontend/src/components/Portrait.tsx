import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import { castMedia, type CastState, type FaceId } from "../assets/cast";
import { datamosh } from "../fx/datamosh";
import { prefersReducedMotion, useReducedMotion } from "../fx/motion";

export const BURST_MS = 480;
const SLICES = 7;

/** A burst request shared across screens: each key fires exactly once. */
export interface BurstSignal {
  key: number;
  consumed: MutableRefObject<number>;
}

interface Props {
  /** From the cast bind point; null renders the neutral blank plate. */
  faceId: FaceId | null;
  state: CastState;
  className: string;
  label: string;
  /** Only the character portrait panel receives bursts. */
  burst?: BurstSignal;
  mirrored?: boolean;
  /** Hatched treatment for your own seat (reference sheet). */
  hatched?: boolean;
  children?: ReactNode;
}

/**
 * A portrait frame: the cast loop (object-fit cover) fills the existing frame,
 * the burst layer (shared WebGL canvas or CSS slices) sits over it, then
 * overlay children, which always stay clean. Video mounts only while the
 * frame is on screen and motion is allowed; otherwise the poster still shows.
 */
export function Portrait({ faceId, state, className, label, burst, mirrored = false, hatched = false, children }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const [fallbackBurst, setFallbackBurst] = useState(0);
  const visible = useOnScreen(frame);
  const still = useReducedMotion();

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const burstKey = burst?.key ?? 0;
  useEffect(() => {
    if (!burst || burstKey <= burst.consumed.current) return;
    burst.consumed.current = burstKey;
    const host = frame.current;
    if (!host || prefersReducedMotion()) return;
    // The WebGL loop stops by itself if this frame leaves the DOM.
    void burstSource(host, faceId)
      .then(source => source ? datamosh.burst(host, source, BURST_MS) : false)
      .then(ran => { if (!ran && mounted.current) setFallbackBurst(burstKey); });
  }, [burstKey, burst, faceId]);

  const plateClass = `plate${mirrored ? " plate--mirrored" : ""}`;
  const poster = faceId === null ? null : castMedia(faceId, state).poster;
  const fallback = poster
    ? <img className="plate__media" src={poster} alt="" width={512} height={512} loading="lazy" decoding="async" draggable={false} />
    : <div className="plate__blank" />;

  return <div ref={frame} className={`frame ${className}${hatched ? " frame--hatched" : ""}`}
    data-face={faceId ?? "none"} data-cast-state={state}>
    <div className={plateClass} role="img" aria-label={label}>
      {faceId !== null && visible && !still ? <CastVideo key={faceId} faceId={faceId} state={state} /> : fallback}
    </div>
    {fallbackBurst > 0 && <div className="slices" aria-hidden="true" key={fallbackBurst}
      onAnimationEnd={event => { if (event.target === event.currentTarget.lastElementChild) setFallbackBurst(0); }}>
      {Array.from({ length: SLICES }, (_, index) => <div key={index} className="slice" style={{
        clipPath: `inset(${(index * 100) / SLICES}% 0 ${100 - ((index + 1) * 100) / SLICES}% 0)`,
        "--dx": `${(index % 2 ? -1 : 1) * (4 + ((index * 37) % 11))}%`,
        animationDuration: `${BURST_MS}ms`,
      } as CSSProperties}>
        <div className={plateClass}>{fallback}</div>
      </div>)}
    </div>}
    {children && <div className="frame__overlay">{children}</div>}
  </div>;
}

/**
 * One muted inline loop per state. On a state change the new loop mounts
 * hidden over the current one and takes over once it is actually playing, so
 * switching idle/talk/smile never flashes an empty frame.
 */
function CastVideo({ faceId, state }: { faceId: FaceId; state: CastState }) {
  const { src: want, poster } = castMedia(faceId, state);
  const [shown, setShown] = useState(want);
  const layers = shown === want ? [want] : [shown, want];
  return <>{layers.map(src => <video key={src} className="plate__media" src={src} poster={poster}
    muted loop autoPlay playsInline preload="none" disablePictureInPicture aria-hidden="true"
    ref={muteForAutoplay}
    data-pending={src !== shown ? "" : undefined}
    onPlaying={src !== shown ? () => setShown(src) : undefined} />)}</>;
}

/** iOS Safari autoplays inline only when the muted property itself is set. */
function muteForAutoplay(video: HTMLVideoElement | null) {
  if (video) video.defaultMuted = video.muted = true;
}

/** Burst texture: the playing video frame, else this face's poster still. */
async function burstSource(host: HTMLElement, faceId: FaceId | null): Promise<HTMLVideoElement | HTMLImageElement | null> {
  if (faceId === null) return null;
  const video = host.querySelector<HTMLVideoElement>("video:not([data-pending])");
  if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return video;
  const image = new Image();
  image.src = castMedia(faceId, "idle").poster;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

function useOnScreen(ref: MutableRefObject<HTMLElement | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

// END Portrait.tsx
