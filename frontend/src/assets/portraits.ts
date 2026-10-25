/**
 * THE single portrait assets module. Every portrait the UI, the mouth layer,
 * and the datamosh atlas use comes from here, so swapping in final art is a
 * one-file change: replace the imports below and re-measure the mouth anchors.
 * Portraits are bundled with the app and never hotlinked.
 *
 * Source: from the owner's reference demo (AI-generated in his commissioned
 * design work); final cleared art pending owner decision. These are temporary
 * placeholder faces until the owner's cast videos (Idle/Talk/Smile states)
 * replace every face, including YOU, in a follow-up.
 *
 * Portrait choice is by seat (you vs. counterpart) only and never encodes a
 * seat's role.
 */
import strangerSrc from "./portraits/stranger.webp";
import youSrc from "./portraits/altface.webp";

export interface PortraitAsset {
  key: "stranger" | "self";
  src: string;
  /** Optional fallback source if `src` fails to decode. */
  fallbackSrc?: string;
  width: number;
  height: number;
  /** Mouth layer anchor as fractions of the 4:5 plate (centre x/y, size w/h). */
  mouth: { x: number; y: number; w: number; h: number };
  alt: string;
  placeholder: boolean;
}

export const PORTRAITS = {
  stranger: {
    key: "stranger", src: strangerSrc, width: 640, height: 800,
    // Teeth line centred near (340, 446) on the 640x800 plate; kept subtle.
    mouth: { x: 0.531, y: 0.557, w: 0.12, h: 0.03 },
    alt: "The stranger", placeholder: true,
  },
  self: {
    key: "self", src: youSrc, width: 640, height: 800,
    // Mouth centred near (333, 428) on the 640x800 plate.
    mouth: { x: 0.52, y: 0.535, w: 0.15, h: 0.04 },
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
// END portraits.ts
