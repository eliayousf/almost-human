// @vitest-environment happy-dom
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { revealFixture } from "../../shared/fixtures";
import type { RoundSnapshot } from "../../shared/game-contract";

const controls = vi.hoisted(() => ({ tree: undefined as ReactNode, round: undefined as RoundSnapshot | undefined }));
vi.mock("react-dom/client", () => ({ createRoot: () => ({ render: (tree: ReactNode) => { controls.tree = tree; } }) }));
vi.mock("convex/react", () => ({ ConvexReactClient: class {} }));
vi.mock("../../shared/react-game", () => ({
  AlmostHumanProvider: ({ children }: { children: ReactNode }) => children,
  useAlmostHuman: () => ({ status: "ready", game: {}, error: null }),
  useGameSession: () => undefined,
  useGameQueue: () => undefined,
  useGameRound: () => ({ ok: true, data: controls.round }),
  useGameLeaderboard: () => undefined,
  useRoundSeconds: () => null,
}));
beforeAll(async () => {
  vi.stubGlobal("__CONVEX_URL__", "https://api.example.test");
  document.body.innerHTML = '<div id="root"></div>';
  await import("../playtest/react-main");
});
afterAll(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });

test.each([{ size: 2, correct: 0 }, { size: 2, correct: 1 }, { size: 3, correct: 0 }, { size: 5, correct: 4 }])("React's $size-seat reveal displays $correct against the actual guess count", ({ size, correct }) => {
  const participants = Array.from({ length: size }, (_, i) => ({ id: `seat-${i}`, alias: `Player ${i}`, kind: i === 0 ? "human" as const : "ai" as const }));
  controls.round = { ...revealFixture, participants, selfId: participants[0].id, yourResult: { ...revealFixture.yourResult, correctGuessCount: correct } };
  const output = document.createElement("div");
  output.innerHTML = renderToStaticMarkup(controls.tree);
  expect(output.textContent).toContain(`${correct}/${size - 1} correct`);
});
