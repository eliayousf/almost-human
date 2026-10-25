import { expect, test } from "vitest";
import { castFaceIds } from "./cast";

test("all clients get the same cast regardless of membership iteration order", () => {
  const ids = ["seat-c", "seat-a", "seat-b"];
  expect(castFaceIds("round-one", ids)).toEqual(castFaceIds("round-one", [...ids].reverse()));
});

test("cast remains stable across reads, uses unique valid faces, and varies by room", () => {
  const ids = ["a", "b", "c", "d", "e"];
  const first = castFaceIds("round-one", ids);
  expect(first).toEqual(castFaceIds("round-one", ids));
  expect(new Set(first.values()).size).toBe(ids.length);
  expect([...first.values()].every(id => Number.isInteger(id) && id >= 1 && id <= 25)).toBe(true);
  expect(first).not.toEqual(castFaceIds("round-two", ids));
});
