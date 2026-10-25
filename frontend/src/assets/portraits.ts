/**
 * THE single portrait assets module. Every portrait the UI, the mouth layer,
 * and the datamosh atlas use comes from here, so dropping in final cleared
 * photographic portraits is a one-file change: replace the imports below with
 * AVIF/WebP files (keep a WebP fallback in `fallbackSrc`) and re-measure
 * the mouth anchors. Portraits are never hotlinked.
 *
 * DEV PLACEHOLDERS: the current files are procedural SVGs, not production art.
 * Portrait choice is by seat order only and never encodes a seat's role.
 */
import strangerSrc from "./portraits/stranger.svg";
import selfSrc from "./portraits/self.svg";

export interface PortraitAsset {
  key: "stranger" | "self";
  /** Preferred source (AVIF for final photos). */
  src: string;
  /** Optional fallback source (WebP for final photos). */
  fallbackSrc?: string;
  /** Intrinsic aspect; every portrait is framed as a 4:5 plate. */
  width: number;
  height: number;
  /** Mouth layer anchor as fractions of the 4:5 plate (centre x/y, size w/h). */
  mouth: { x: number; y: number; w: number; h: number };
  alt: string;
  placeholder: true | false;
}

export const PORTRAITS = {
  stranger: {
    key: "stranger", src: strangerSrc, width: 800, height: 1000,
    mouth: { x: 0.5175, y: 0.581, w: 0.075, h: 0.03 },
    alt: "The stranger", placeholder: true,
  },
  self: {
    key: "self", src: selfSrc, width: 800, height: 1000,
    // Lips centre (208, 293) on the 400x500 plate; enlarged so own-typing
    // feedback reads on the small seat tile at arm's length.
    mouth: { x: 0.52, y: 0.586, w: 0.11, h: 0.055 },
    alt: "Your seat", placeholder: true,
  },
} as const satisfies Record<string, PortraitAsset>;

/** Atlas order for the shared WebGL texture: one cell per portrait. */
export const ATLAS_ORDER: readonly PortraitAsset["key"][] = ["stranger", "self"];

/** Warm the browser cache before a round needs the portraits. */
export function preloadPortraits(): void {
  for (const key of ATLAS_ORDER) {
    const image = new Image();
    image.decoding = "async";
    image.src = PORTRAITS[key].src;
  }
}
