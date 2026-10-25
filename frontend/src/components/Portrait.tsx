import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PortraitAsset } from "../assets/portraits";
import { datamosh } from "../fx/datamosh";
import type { MouthDriver } from "../fx/mouth";
import { prefersReducedMotion } from "../fx/motion";

export const BURST_MS = 480;
const SLICES = 7;

interface Props {
  asset: PortraitAsset;
  className: string;
  label: string;
  mouth?: MouthDriver;
  /** Increment to fire one datamosh burst (portrait panel only). */
  burstKey?: number;
  mirrored?: boolean;
  children?: ReactNode;
}

/**
 * A portrait frame: a 4:5 "plate" that covers the frame, the mouth layer on
 * top of it, the burst layer (shared WebGL canvas or CSS slices), then any
 * overlay children, which always stay clean.
 */
export function Portrait({ asset, className, label, mouth, burstKey = 0, mirrored = false, children }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const mouthLayer = useRef<HTMLDivElement>(null);
  const [fallbackBurst, setFallbackBurst] = useState(0);

  useEffect(() => {
    if (!mouth) return;
    mouth.attach(mouthLayer.current);
    return () => mouth.attach(null);
  }, [mouth]);

  useEffect(() => {
    const host = frame.current;
    if (!burstKey || !host || prefersReducedMotion()) return;
    let active = true;
    void datamosh.burst(host, asset.key, BURST_MS).then(ran => {
      if (active && !ran) setFallbackBurst(burstKey);
    });
    return () => {
      active = false;
      datamosh.cancel();
    };
  }, [burstKey, asset.key]);

  const plate = <>
    <img className="plate__img" src={asset.src} alt="" width={asset.width} height={asset.height}
      loading="lazy" decoding="async" draggable={false} />
  </>;

  return <div ref={frame} className={`frame ${className}`}>
    <div className={`plate${mirrored ? " plate--mirrored" : ""}`} role="img" aria-label={label}>
      {plate}
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
        <div className={`plate${mirrored ? " plate--mirrored" : ""}`}>{plate}</div>
      </div>)}
    </div>}
    {children && <div className="frame__overlay">{children}</div>}
  </div>;
}
// END Portrait.tsx
