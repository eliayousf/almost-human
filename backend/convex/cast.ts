/** A deterministic room-wide cast. Inputs contain no role or real identity. */
export function castFaceIds(roundId: string, memberIds: readonly string[]): Map<string, number> {
  let seed = 2166136261;
  for (const char of roundId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const faces = Array.from({ length: 25 }, (_, index) => index + 1);
  for (let index = faces.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [faces[index], faces[swap]] = [faces[swap], faces[index]];
  }
  return new Map([...memberIds].sort().map((id, index) => [id, faces[index % faces.length]]));
}
