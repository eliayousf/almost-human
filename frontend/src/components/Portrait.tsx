import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";
import type { PortraitAsset } from "../assets/portraits";
import { datamosh } from "../fx/datamosh";
import type { MouthDriver } from "../fx/mouth";
import { prefersReducedMotion } from "../fx/motion";

export const BURST_MS = 480;
const SLICES = 7;

/** A burst request shared across screens: each key fires exactly once. */
export interface BurstSignal {
  key: number;
  consumed: MutableRefObject<number>;
}

interface Props {
  asset: PortraitAsset;
  className: string;
  label: string;
  mouth?: MouthDriver;
  /** Only the character portrait panel receives bursts. */
  burst?: BurstSignal;
  mirrored?: boolean;
  /** Hatched treatment for your own seat (reference sheet). */
  hatched?: boolean;
  children?: ReactNode;
}

/**
 * A portrait frame: a 4:5 plate that covers the frame, the mouth layer over
 * it, the burst layer (shared WebGL canvas or CSS slices), then overlay
 * children, which always stay clean.
 */
export function Portrait({ asset, className, label, mouth, burst, mirrored = false, hatched = false, children }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const mouthLayer = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const [fallbackBurst, setFallbackBurst] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!mouth) return;
    mouth.attach(mouthLayer.current);
    return () => mouth.attach(null);
  }, [mouth]);

  const burstKey = burst?.key ?? 0;
  useEffect(() => {
    if (!burst || burstKey <= burst.consumed.current) return;
    burst.consumed.current = burstKey;
    const host = frame.current;
    if (!host || prefersReducedMotion()) return;
    // The WebGL loop stops by itself if this frame leaves the DOM.
    void datamosh.burst(host, asset.key, BURST_MS).then(ran => {
      if (!ran && mounted.current) setFallbackBurst(burstKey);
    });
  }, [burstKey, burst, asset.key]);

  const plateClass = `plate${mirrored ? " plate--mirrored" : ""}`;
  const image = <img className="plate__img" src={asset.src} alt="" width={asset.width} height={asset.height}
    loading="lazy" decoding="async" draggable={false} />;

  return <div ref={frame} className={`frame ${className}${hatched ? " frame--hatched" : ""}`}>
    <div className={plateClass} role="img" aria-label={label}>
      {image}
      <div ref={mouthLayer} className="mouth" aria-hidden="true" style={{
        left: `${asset.mouth.x * 100}%`, top: `${asset.mouth.y * 100}%`,
        width: `${asset.mouth.w * 100}%`, height: `${asset.mouth.h * 100}%`,
      }} />
    </div>
    {fallbackBurst > 0 && <div className="slices" aria-hidden="true" key={fallbackBurst}
      onAnimationEnd={event => { if (event.target === event.currentTarget.lastElementChild) setFallbackBurst(0); }}>
      {Array.from({ length: SLICES }, (_, index) => <div key={index} className="slice" style={{
        clipPath: `inset(${(index * 100) / SLICES}% 0 ${100 - ((index + 1) * 100) / SLICES}% 0)`,
        "--dx": `${(index % 2 ? -1 : 1) * (4 + ((index * 37) % 11))}%`,
        animationDuration: `${BURST_MS}ms`,
      } as CSSProperties}>
        <div className={plateClass}>{image}</div>
      </div>)}
    </div>}
    {children && <div className="frame__overlay">{children}</div>}
  </div>;
}
// END Portrait.tsx
