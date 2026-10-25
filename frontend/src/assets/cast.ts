/**
 * THE single cast bind point. Every seat's face (the YOU card and every
 * counterpart alike) is resolved here and nowhere else, so a future backend
 * field replaces the fallback without touching components.
 *
 * Resolution order, identical for every seat (it never looks at a role):
 *  1. A valid `faceId` (1-25) carried on the room/participant payload. The
 *     pinned contract has no such field yet; it is read defensively.
 *  2. FIXTURE MODE ONLY: a seeded draw from roundId + seat id, so every view of
 *     the same fixture room agrees.
 *  3. Otherwise null: the UI shows a neutral blank plate. A live client must
 *     never draw a face on its own; two clients would disagree.
 *
 * Media files are owner-supplied, served from /cast/ (public/cast/, git-ignored)
 * and never committed. Only this manifest is tracked.
 */
import type { Seat } from "@game/game-contract";
import manifest from "./cast.json";

export type FaceId = number;
export type CastState = "idle" | "talk" | "smile";

interface CastEntry {
  id: FaceId;
  idle: string;
  talk: string;
  smile: string;
  poster: string;
}

const ENTRIES: readonly CastEntry[] = manifest;
const BY_ID = new Map(ENTRIES.map(entry => [entry.id, entry]));
const BASE = `${import.meta.env.BASE_URL}cast/`;
const FIXTURE_DRAW = import.meta.env.MODE === "fixtures";

export function castMedia(faceId: FaceId, state: CastState): { src: string; poster: string } {
  const entry = BY_ID.get(faceId)!;
  return { src: BASE + entry[state], poster: BASE + entry.poster };
}

/** Face per seat id for one room; null means "no face supplied" (neutral plate). */
export function castFaces(roundId: string, participants: readonly Seat[]): ReadonlyMap<string, FaceId | null> {
  const faces = new Map<string, FaceId | null>();
  const drawn = FIXTURE_DRAW ? fixtureDraw(roundId, participants) : null;
  for (const seat of participants) faces.set(seat.id, payloadFaceId(seat) ?? drawn?.get(seat.id) ?? null);
  return faces;
}

function payloadFaceId(seat: Seat): FaceId | null {
  const value = (seat as Seat & { faceId?: unknown }).faceId;
  return typeof value === "number" && BY_ID.has(value) ? value : null;
}

/**
 * FIXTURE MODE ONLY. Seeded by roundId; seats take distinct faces in sorted
 * seat-id order, so the result does not depend on whose view renders it.
 */
function fixtureDraw(roundId: string, participants: readonly Seat[]): Map<string, FaceId> {
  const random = mulberry32(fnv1a(roundId));
  const ids = ENTRIES.map(entry => entry.id);
  for (let index = ids.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [ids[index], ids[swap]] = [ids[swap], ids[index]];
  }
  const seats = participants.map(seat => seat.id).sort();
  return new Map(seats.map((id, index) => [id, ids[index % ids.length]]));
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
