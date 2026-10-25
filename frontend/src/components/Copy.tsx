import type { CopySlot } from "../copy/consent";

/** Renders an owner copy slot; placeholders get an unmistakable hazard treatment. */
export function Copy({ slot, as: Tag = "span" }: { slot: CopySlot; as?: "span" | "p" | "h1" | "h2" }) {
  return <Tag className={slot.isPlaceholder ? "placeholder" : undefined} data-placeholder={slot.isPlaceholder || undefined}>
    {slot.text}
  </Tag>;
}
// END Copy.tsx
