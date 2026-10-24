// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { chatFixture, countdownFixture, revealFixture, sessionFixture, votingFixture } from "../../shared/fixtures";
import type { ApiResult, RoundSnapshot } from "../../shared/game-contract";

const mocks = vi.hoisted(() => ({
  game: {
    createSession: vi.fn(), getSession: vi.fn(), joinQueue: vi.fn(), getRound: vi.fn(), sendMessage: vi.fn(), submitVotes: vi.fn(),
    watchLeaderboard: vi.fn(() => () => {}),
    watchRound: vi.fn<(_id: string, listener: (result: ApiResult<RoundSnapshot>) => void) => () => void>(() => () => {}),
  },
  update: undefined as ((result: ApiResult<RoundSnapshot>) => void) | undefined,
  close: vi.fn(), signIn: vi.fn(), setAuth: vi.fn(),
}));
vi.mock("../../shared/convex-client", () => ({ createConvexGameClient: () => mocks.game }));
vi.mock("convex/browser", () => ({
  ConvexClient: class {
    close = mocks.close;
    setAuth(_fetchToken: unknown, acknowledge: (authenticated: boolean) => void) { mocks.setAuth(); acknowledge(true); }
  },
  ConvexHttpClient: class { action = mocks.signIn; },
}));
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const click = (id: string) => document.getElementById(id)!.click();
const submit = (id: string) => document.getElementById(id)!.dispatchEvent(new Event("submit", { cancelable: true }));
const input = () => document.getElementById("message") as HTMLInputElement;
const transition = (type: string, persisted: boolean) => {
  const event = new Event(type);
  Object.defineProperty(event, "persisted", { value: persisted });
  window.dispatchEvent(event);
};
let listeners: [string, EventListenerOrEventListenerObject][];
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date(chatFixture.serverNow));
  vi.stubGlobal("__CONVEX_URL__", "https://api.example.test");
  sessionStorage.clear();
  const html = readFileSync(`${process.cwd()}/playtest/index.html`, "utf8");
  document.body.innerHTML = html.slice(html.indexOf("<body>") + 6, html.indexOf('<script type="module"'));
  mocks.game.createSession.mockResolvedValue({ ok: true, data: sessionFixture });
  mocks.game.getSession.mockResolvedValue({ ok: true, data: { ...sessionFixture, activeRoundId: chatFixture.roundId } });
  mocks.game.joinQueue.mockResolvedValue({ ok: true, data: { queueId: "demo", status: "assigned", roundId: chatFixture.roundId } });
  mocks.game.getRound.mockResolvedValue({ ok: true, data: chatFixture });
  mocks.game.sendMessage.mockResolvedValue({ ok: true, data: chatFixture.messages[0] });
  mocks.game.submitVotes.mockResolvedValue({ ok: true, data: votingFixture });
  mocks.game.watchRound.mockImplementation((_id, listener) => { mocks.update = listener; return () => {}; });
  listeners = [];
  const add = window.addEventListener.bind(window);
  vi.spyOn(window, "addEventListener").mockImplementation((type, listener, options) => {
    listeners.push([type, listener]); add(type, listener, options);
  });
});
afterEach(() => {
  for (const [type, listener] of listeners) window.removeEventListener(type, listener);
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); document.body.replaceChildren();
});
async function start() {
  await import("../playtest/main");
  (document.getElementById("adult") as HTMLInputElement).checked = true;
  (document.getElementById("rules") as HTMLInputElement).checked = true;
  submit("start-form"); await flush(); click("join"); await flush();
}

test("plain chat stays editable across updates and a failed send; retry preserves the request ID", async () => {
  await start();
  input().focus(); input().value = "My typed draft"; input().setSelectionRange(3, 3);
  input().dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: "draft" }));
  await vi.advanceTimersByTimeAsync(1000);
  mocks.update!({ ok: true, data: { ...chatFixture, revision: chatFixture.revision + 1 } });
  mocks.update!({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Reconnecting…" } });
  expect(document.activeElement).toBe(input());
  expect(input().value).toBe("My typed draft");
  expect(input().selectionStart).toBe(3);
  expect(input().disabled || input().readOnly).toBe(false);
  expect(document.getElementById("message-form")!.hidden).toBe(false);
  mocks.game.sendMessage.mockResolvedValueOnce({ ok: false, error: { code: "SERVICE_UNAVAILABLE", message: "Please retry." } });
  submit("message-form"); await flush();
  expect(input().value).toBe("My typed draft");
  submit("message-form"); await flush();
  expect(input().value).toBe("");
  expect(mocks.game.sendMessage).toHaveBeenCalledTimes(2);
  expect(mocks.game.sendMessage.mock.calls[0]).toEqual(mocks.game.sendMessage.mock.calls[1]);
});

test.each([2, 3, 5])("the %i-seat playtest submits one vote per other seat", async size => {
  await start();
  const participants = Array.from({ length: size }, (_, i) => ({ id: `seat-${i}`, alias: `Player ${i}` }));
  mocks.update!({ ok: true, data: { ...votingFixture, participants, selfId: participants[0].id } });
  for (const select of document.querySelectorAll<HTMLSelectElement>("#votes select")) {
    select.value = "ai"; select.dispatchEvent(new Event("change"));
  }
  submit("vote-form"); await flush();
  expect(mocks.game.submitVotes).toHaveBeenCalledExactlyOnceWith(votingFixture.roundId, {
    clientRequestId: expect.any(String), votes: participants.slice(1).map(seat => ({ participantId: seat.id, label: "ai" })),
  });
});

test.each([{ size: 2, correct: 0 }, { size: 2, correct: 1 }, { size: 3, correct: 0 }, { size: 5, correct: 4 }])("the $size-seat reveal displays $correct correct against the actual guess count", async ({ size, correct }) => {
  await start();
  const participants = Array.from({ length: size }, (_, i) => ({ id: `seat-${i}`, alias: `Player ${i}`, kind: i === 0 ? "human" as const : "ai" as const }));
  mocks.update!({ ok: true, data: { ...revealFixture, participants, selfId: participants[0].id, yourResult: { ...revealFixture.yourResult, correctGuessCount: correct } } });
  await flush();
  expect(document.getElementById("result")!.textContent).toContain(`${correct}/${size - 1} correct`);
});

test("only terminal cancellation hides the input, shows the supplied reason, and offers another round", async () => {
  await start();
  const message = "The game service is temporarily unavailable. This round ended with no points awarded. Please try playing again.";
  mocks.update!({ ok: true, data: { ...chatFixture, revision: chatFixture.revision + 1, phase: "cancelled", reason: "service_unavailable", message } });
  expect(document.getElementById("message-form")!.hidden).toBe(true);
  expect(document.getElementById("result")!.textContent).toBe(message);
  expect(document.getElementById("play-again")!.hidden).toBe(false);
  mocks.game.getRound.mockResolvedValue({ ok: true, data: { ...countdownFixture, roundId: "next-round" } });
  mocks.game.joinQueue.mockResolvedValue({ ok: true, data: { queueId: "next-queue", status: "assigned", roundId: "next-round" } });
  click("play-again"); await flush();
  expect(mocks.game.joinQueue).toHaveBeenCalledTimes(2);
  expect(document.getElementById("phase")!.textContent).toBe("Get ready");
});

test("a page-cache restore keeps its connection; ordinary navigation closes it", async () => {
  await start();
  input().value = "Draft before switching apps";
  transition("pagehide", true); transition("pageshow", true);
  expect(mocks.close).not.toHaveBeenCalled();
  expect(input().value).toBe("Draft before switching apps");
  transition("pagehide", false);
  expect(mocks.close).toHaveBeenCalledOnce();
});

test("refresh restores the stored anonymous player and its existing round", async () => {
  sessionStorage.setItem("almost-human-playtest-auth-v1", JSON.stringify({ token: "synthetic-token", refreshToken: "synthetic-refresh" }));
  await import("../playtest/main"); await flush();
  expect(mocks.setAuth).toHaveBeenCalledOnce();
  expect(mocks.signIn).not.toHaveBeenCalled();
  expect(mocks.game.getRound).toHaveBeenCalledExactlyOnceWith(chatFixture.roundId);
  expect(document.getElementById("alias")!.textContent).toBe(sessionFixture.leaderboardAlias);
  expect(document.getElementById("message-form")!.hidden).toBe(false);
});
