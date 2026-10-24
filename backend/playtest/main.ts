import { ConvexClient, ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { createConvexGameClient } from "../../shared/convex-client";
import type {
  ApiResult, Guess, HumanOrAi, LeaderboardView, QueueTicket, ReportReason, RoundSnapshot,
  SessionView,
} from "../../shared/game-contract";

declare const __CONVEX_URL__: string;

const TOKEN_KEY = "almost-human-playtest-auth-v1";
const ACTIVITY_KEY = "almost-human-playtest-activity-v1";
const POLICY_VERSION = "playtest-v1";
type Tokens = { token: string; refreshToken: string };
type SignInResult = { tokens?: Tokens | null; redirect?: string; started?: boolean };

const signIn = makeFunctionReference<"action", { provider?: string; refreshToken?: string }, SignInResult>("auth:signIn");
const authHttp = new ConvexHttpClient(__CONVEX_URL__);
const convex = new ConvexClient(__CONVEX_URL__);
let tokens: Tokens | null = null;
let authenticating: Promise<void> | undefined;
let refreshing: Promise<string | null> | undefined;
let authenticated = false;

function readTokens(): Tokens | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? "null");
    if (typeof value === "object" && value !== null && "token" in value && "refreshToken" in value
      && typeof value.token === "string" && typeof value.refreshToken === "string") return value as Tokens;
  } catch { /* A missing or invalid tab session starts a fresh anonymous player. */ }
  return null;
}

function saveTokens(value: Tokens): void {
  tokens = value;
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(value));
}

async function fetchToken({ forceRefreshToken }: { forceRefreshToken: boolean }): Promise<string | null> {
  if (!tokens) return null;
  if (!forceRefreshToken) return tokens.token;
  if (!refreshing) {
    refreshing = (async () => {
      // Official Convex Auth refresh flow; credentials stay in this tab.
      const result = await authHttp.action(signIn, { refreshToken: tokens!.refreshToken });
      if (!result.tokens) return null;
      saveTokens(result.tokens);
      return result.tokens.token;
    })().catch(() => null).finally(() => { refreshing = undefined; });
  }
  return refreshing;
}

async function ensureAnonymous(): Promise<void> {
  if (authenticated) return;
  if (authenticating) return authenticating;
  authenticating = (async () => {
    tokens ??= readTokens();
    if (!tokens) {
      // Anonymous is the official provider configured by backend/convex/auth.ts.
      const result = await authHttp.action(signIn, { provider: "anonymous" });
      if (!result.tokens) throw new Error("Anonymous sign-in did not complete");
      saveTokens(result.tokens);
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Anonymous sign-in timed out")), 15_000);
      convex.setAuth(fetchToken, (isAuthenticated) => {
        authenticated = isAuthenticated;
        if (isAuthenticated) {
          clearTimeout(timeout);
          resolve();
        }
      });
    });
  })().finally(() => { authenticating = undefined; });
  return authenticating;
}

const game = createConvexGameClient(convex, ensureAnonymous);
function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing test control: ${id}`);
  return value as T;
}
const ui = {
  notice: element("notice"), welcome: element("welcome"), player: element("player"),
  startForm: element<HTMLFormElement>("start-form"), start: element<HTMLButtonElement>("start"),
  adult: element<HTMLInputElement>("adult"), rules: element<HTMLInputElement>("rules"),
  training: element<HTMLInputElement>("training"), consent: element<HTMLInputElement>("consent"),
  alias: element("alias"), score: element("score"), join: element<HTMLButtonElement>("join"),
  queue: element("queue"), cancelQueue: element<HTMLButtonElement>("cancel-queue"),
  round: element("round"), phase: element("phase"), seats: element("seats"), timer: element("timer"),
  topic: element("topic"), transcript: element<HTMLOListElement>("transcript"),
  messageForm: element<HTMLFormElement>("message-form"), message: element<HTMLInputElement>("message"),
  send: element<HTMLButtonElement>("send"), voteForm: element<HTMLFormElement>("vote-form"),
  votes: element("votes"), submitVotes: element<HTMLButtonElement>("submit-votes"),
  ballotStatus: element("ballot-status"), result: element("result"), playAgain: element<HTMLButtonElement>("play-again"),
  safety: element("safety"), leave: element<HTMLButtonElement>("leave"), leaderboard: element("leaderboard"),
};

let session: SessionView | null = null;
let queue: QueueTicket | null = null;
let round: RoundSnapshot | null = null;
let stopQueue: (() => void) | undefined;
let stopRound: (() => void) | undefined;
let stopLeaderboard: (() => void) | undefined;
let serverOffsetMs = 0;
let votedRoundId: string | null = null;
let renderedVoteRound: string | null = null;
let renderedSafetyRound: string | null = null;
let pendingSend: { text: string; clientRequestId: string } | null = null;
let sending = false;
let submittingVotes = false;
const selectedVotes = new Map<string, HumanOrAi>();

const command = () => ({ clientRequestId: crypto.randomUUID() });
function notice(text = ""): void { ui.notice.textContent = text; }
function trackTime(serverNow: string): void { serverOffsetMs = Date.parse(serverNow) - Date.now(); }
function saveActivity(): void {
  sessionStorage.setItem(ACTIVITY_KEY, JSON.stringify({ queueId: queue?.queueId, roundId: round?.roundId }));
}

async function apply<T>(promise: Promise<ApiResult<T>>, success: (data: T) => void | Promise<void>): Promise<boolean> {
  const result = await promise;
  if (!result.ok) {
    notice(`${result.error.message}${result.error.retryAfterMs ? ` Try again in ${Math.ceil(result.error.retryAfterMs / 1000)}s.` : ""}`);
    return false;
  }
  notice();
  await success(result.data);
  return true;
}

async function busy(button: HTMLButtonElement, work: () => Promise<unknown>): Promise<void> {
  if (button.disabled) return;
  button.disabled = true;
  try { await work(); }
  catch { notice("The test connection failed. Please try again."); }
  finally {
    button.disabled = false;
    if (button === ui.submitVotes && round?.phase === "voting" && round.ownBallot.status === "submitted") button.disabled = true;
  }
}

function drawSession(value: SessionView): void {
  session = value;
  trackTime(value.serverNow);
  ui.welcome.hidden = true;
  ui.player.hidden = false;
  ui.alias.textContent = value.leaderboardAlias;
  ui.score.textContent = `${value.totalGuessingPoints} total guessing points`;
  ui.consent.checked = value.trainingOptIn;
  ui.join.hidden = queue !== null || (round !== null && !["reveal", "cancelled"].includes(round.phase));
  if (!stopLeaderboard) {
    stopLeaderboard = game.watchLeaderboard((result) => {
      if (result.ok) drawLeaderboard(result.data);
      else notice(result.error.message);
    });
  }
}

function drawLeaderboard(value: LeaderboardView): void {
  ui.leaderboard.replaceChildren();
  for (const entry of value.entries) {
    const row = document.createElement("li");
    row.value = entry.rank;
    row.textContent = `${entry.alias}: ${entry.guessingPoints} points · ${entry.roundsPlayed} rounds`;
    ui.leaderboard.append(row);
  }
  if (!value.entries.length) {
    const row = document.createElement("li");
    row.textContent = "No completed rounds yet.";
    ui.leaderboard.append(row);
  }
}

function clearActivity(): void {
  stopQueue?.(); stopQueue = undefined;
  stopRound?.(); stopRound = undefined;
  queue = null; round = null;
  ui.queue.hidden = true; ui.round.hidden = true; ui.join.hidden = session === null;
  renderedVoteRound = null; renderedSafetyRound = null;
  selectedVotes.clear(); pendingSend = null;
  saveActivity();
}

function watchQueue(ticket: QueueTicket): void {
  stopQueue?.(); stopRound?.(); stopRound = undefined;
  round = null;
  queue = ticket;
  ui.round.hidden = true; ui.queue.hidden = false; ui.join.hidden = true;
  saveActivity();
  stopQueue = game.watchQueue(ticket.queueId, (result) => {
    if (!result.ok) { notice(result.error.message); return; }
    queue = result.data;
    trackTime(queue.serverNow);
    if (queue.status === "assigned") {
      const roundId = queue.roundId;
      stopQueue?.(); stopQueue = undefined;
      ui.queue.hidden = true;
      void loadRound(roundId);
    }
  });
}

async function loadRound(roundId: string): Promise<void> {
  await apply(game.getRound(roundId), (value) => {
    queue = null;
    stopRound?.();
    drawRound(value);
    stopRound = game.watchRound(roundId, (result) => {
      if (result.ok) drawRound(result.data);
      else notice(result.error.message);
    });
  });
}

function drawTranscript(value: RoundSnapshot): void {
  if (!("messages" in value)) { ui.transcript.hidden = true; return; }
  const atBottom = ui.transcript.scrollHeight - ui.transcript.scrollTop - ui.transcript.clientHeight < 60;
  ui.transcript.hidden = false;
  ui.transcript.replaceChildren();
  for (const message of value.messages) {
    const row = document.createElement("li");
    const name = value.participants.find((seat) => seat.id === message.senderId)?.alias ?? "Participant";
    row.textContent = `${name}${message.senderId === value.selfId ? " (you)" : ""}: ${message.text}`;
    ui.transcript.append(row);
  }
  if (atBottom) ui.transcript.scrollTop = ui.transcript.scrollHeight;
}

function drawVotes(value: RoundSnapshot): void {
  if (value.phase !== "voting") { ui.voteForm.hidden = true; return; }
  ui.voteForm.hidden = false;
  if (renderedVoteRound !== value.roundId) {
    ui.votes.replaceChildren();
    selectedVotes.clear();
    for (const seat of value.participants.filter((participant) => participant.id !== value.selfId)) {
      const label = document.createElement("label");
      label.append(document.createTextNode(`${seat.alias} `));
      const select = document.createElement("select");
      select.dataset.participantId = seat.id;
      select.required = true;
      for (const [labelText, optionValue] of [["Choose…", ""], ["Human", "human"], ["AI", "ai"]]) {
        const option = document.createElement("option");
        option.textContent = labelText; option.value = optionValue;
        select.append(option);
      }
      select.addEventListener("change", () => {
        if (select.value === "human" || select.value === "ai") selectedVotes.set(seat.id, select.value);
        else selectedVotes.delete(seat.id);
      });
      label.append(select); ui.votes.append(label);
    }
    renderedVoteRound = value.roundId;
  }
  const submitted = value.ownBallot.status === "submitted" || votedRoundId === value.roundId;
  ui.submitVotes.disabled = submitted || submittingVotes;
  for (const select of ui.votes.querySelectorAll("select")) select.disabled = submitted || submittingVotes;
  ui.ballotStatus.textContent = submitted ? "Your guesses are locked. The reveal follows the voting timer." : "Submit both guesses before the timer expires.";
}

function drawSafety(value: RoundSnapshot): void {
  const finished = value.phase === "reveal" || value.phase === "cancelled";
  ui.leave.hidden = finished;
  ui.safety.hidden = finished;
  if (renderedSafetyRound === value.roundId) return;
  ui.safety.replaceChildren();
  for (const seat of value.participants.filter((participant) => participant.id !== value.selfId)) {
    const row = document.createElement("div");
    const label = document.createElement("label");
    label.textContent = `${seat.alias}: `;
    const reason = document.createElement("select");
    reason.setAttribute("aria-label", `Reason to report ${seat.alias}`);
    for (const [text, code] of [
      ["Harassment", "harassment"], ["Personal information", "personal_information"],
      ["Unsafe content", "unsafe_content"], ["Spam", "spam"], ["Other", "other"],
    ]) {
      const option = document.createElement("option"); option.textContent = text; option.value = code; reason.append(option);
    }
    label.append(reason);
    const report = document.createElement("button"); report.type = "button"; report.className = "secondary"; report.textContent = "Report";
    report.addEventListener("click", () => {
      void busy(report, () => apply(game.reportParticipant(value.roundId, {
        ...command(), participantId: seat.id, reason: reason.value as ReportReason,
      }), () => { notice("Report recorded. You can leave the round at any time."); }));
    });
    const block = document.createElement("button"); block.type = "button"; block.className = "danger"; block.textContent = "Block and leave";
    block.addEventListener("click", () => {
      void busy(block, () => apply(game.blockParticipant(value.roundId, { ...command(), participantId: seat.id }), () => {
        clearActivity(); notice("Participant blocked. You left the round.");
      }));
    });
    row.className = "row"; row.append(label, report, block); ui.safety.append(row);
  }
  renderedSafetyRound = value.roundId;
}

function drawRound(value: RoundSnapshot): void {
  if (round?.roundId === value.roundId && round.revision > value.revision) return;
  const becameReveal = value.phase === "reveal" && (round?.roundId !== value.roundId || round.phase !== "reveal");
  round = value;
  trackTime(value.serverNow);
  ui.queue.hidden = true; ui.round.hidden = false; ui.join.hidden = true;
  ui.seats.textContent = value.participants.map((seat) => `${seat.alias}${seat.id === value.selfId ? " (you)" : ""}${"kind" in seat ? ` — ${seat.kind}` : ""}`).join(" · ");
  ui.phase.textContent = {
    countdown: "Get ready", chat: "Chat", voting: "Human or AI?", reveal: "Round results", cancelled: "Round ended",
  }[value.phase];
  ui.topic.hidden = !("topic" in value);
  if ("topic" in value) ui.topic.textContent = value.topic.text;
  ui.messageForm.hidden = value.phase !== "chat";
  ui.result.hidden = value.phase !== "reveal" && value.phase !== "cancelled";
  ui.playAgain.hidden = value.phase !== "reveal" && value.phase !== "cancelled";
  if (value.phase === "reveal") {
    ui.result.replaceChildren();
    const score = document.createElement("p");
    score.textContent = `${value.yourResult.correctGuessCount}/2 correct · +${value.yourResult.guessingPointsEarned} points · ${value.yourResult.totalGuessingPoints} total · streak ${value.yourResult.streak}`;
    const votes = document.createElement("p");
    votes.textContent = value.yourResult.votes
      ? value.yourResult.votes.map((vote) => `${value.participants.find((seat) => seat.id === vote.participantId)?.alias}: you guessed ${vote.label}`).join(" · ")
      : "No ballot submitted.";
    ui.result.append(score, votes);
  } else if (value.phase === "cancelled") ui.result.textContent = value.message;
  drawTranscript(value); drawVotes(value); drawSafety(value); drawTimer(); saveActivity();
  if (becameReveal) void apply(game.getSession(), drawSession);
}

function drawTimer(): void {
  if (!round) return;
  const deadline = round.phase === "countdown" ? round.chatStartsAt
    : round.phase === "chat" ? round.chatEndsAt : round.phase === "voting" ? round.votingEndsAt : null;
  ui.timer.hidden = deadline === null;
  if (!deadline) return;
  const seconds = Math.max(0, Math.ceil((Date.parse(deadline) - Date.now() - serverOffsetMs) / 1000));
  ui.timer.textContent = round.phase === "countdown" ? String(seconds || "Go") : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  if (round.phase === "chat") ui.send.disabled = sending || seconds === 0;
}
setInterval(drawTimer, 250);

async function join(): Promise<void> {
  await apply(game.joinQueue(command()), (ticket) => {
    clearActivity();
    if (ticket.status === "assigned") { queue = ticket; saveActivity(); void loadRound(ticket.roundId); }
    else watchQueue(ticket);
  });
}

ui.startForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!ui.adult.checked || !ui.rules.checked) return;
  void busy(ui.start, () => apply(game.createSession({
    ...command(), adultConfirmed: true, rulesAccepted: true,
    policyVersion: POLICY_VERSION, trainingOptIn: ui.training.checked,
  }), drawSession));
});
ui.join.addEventListener("click", () => { void busy(ui.join, join); });
ui.playAgain.addEventListener("click", () => { void busy(ui.playAgain, join); });
ui.consent.addEventListener("change", () => {
  const previous = session?.trainingOptIn ?? false;
  const selected = ui.consent.checked;
  ui.consent.disabled = true;
  void apply(game.setTrainingConsent({ ...command(), policyVersion: POLICY_VERSION, trainingOptIn: selected }), drawSession)
    .then((ok) => { if (!ok) ui.consent.checked = previous; })
    .finally(() => { ui.consent.disabled = false; });
});
ui.cancelQueue.addEventListener("click", () => {
  if (queue) void busy(ui.cancelQueue, () => apply(game.leaveQueue(queue!.queueId, command()), clearActivity));
});
ui.leave.addEventListener("click", () => {
  if (round) void busy(ui.leave, () => apply(game.leaveRound(round!.roundId, command()), clearActivity));
});
ui.messageForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (sending || round?.phase !== "chat" || !ui.message.value.trim()) return;
  const currentRound = round.roundId;
  const text = ui.message.value;
  if (pendingSend?.text !== text) pendingSend = { text, ...command() };
  const input = pendingSend;
  sending = true;
  void busy(ui.send, async () => {
    const result = await game.sendMessage(currentRound, input);
    if (result.ok) {
      if (ui.message.value === text) ui.message.value = "";
      pendingSend = null; notice();
    } else {
      if (result.error.code !== "SERVICE_UNAVAILABLE") pendingSend = null;
      notice(result.error.message);
    }
  }).finally(() => { sending = false; drawTimer(); });
});
ui.voteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (submittingVotes || round?.phase !== "voting") return;
  const others = round.participants.filter((seat) => seat.id !== round!.selfId);
  const votes: Guess[] = others.map((seat) => ({ participantId: seat.id, label: selectedVotes.get(seat.id)! }));
  if (votes.length !== 2 || votes.some((vote) => !vote.label)) { notice("Choose a label for both participants."); return; }
  const roundId = round.roundId;
  submittingVotes = true;
  void busy(ui.submitVotes, () => apply(game.submitVotes(roundId, { ...command(), votes: votes as unknown as Guess[] }), (value) => {
    votedRoundId = roundId; drawRound(value);
  })).finally(() => { submittingVotes = false; if (round) drawVotes(round); });
});
element("new-tab").addEventListener("click", () => { window.open(location.href, "_blank", "noopener,noreferrer"); });
element("reset").addEventListener("click", () => {
  if (!window.confirm("Start a new anonymous test player in this tab? Its score will reset. Leave any active round first.")) return;
  sessionStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(ACTIVITY_KEY); location.reload();
});

// This development harness deliberately keeps official Auth tokens in a tab's
// sessionStorage. The public frontend should use Convex Auth's supported provider
// integration instead of copying this temporary playtest bootstrap.
if (readTokens()) {
  notice("Restoring this test player…");
  void ensureAnonymous().then(async () => {
    await apply(game.getSession(), async (value) => {
      drawSession(value);
      try {
        if ("activeRoundId" in value && typeof value.activeRoundId === "string") {
          await loadRound(value.activeRoundId);
          return;
        }
        if ("activeQueueId" in value && typeof value.activeQueueId === "string") {
          await apply(game.getQueue(value.activeQueueId), watchQueue);
          return;
        }
        const activity = JSON.parse(sessionStorage.getItem(ACTIVITY_KEY) ?? "{}");
        if (typeof activity.roundId === "string") await loadRound(activity.roundId);
        else if (typeof activity.queueId === "string") await apply(game.getQueue(activity.queueId), watchQueue);
      } catch { sessionStorage.removeItem(ACTIVITY_KEY); }
    });
  }).catch(() => notice("Could not restore this player. Reset this test player to sign in again."));
}

window.addEventListener("pagehide", () => {
  stopQueue?.(); stopRound?.(); stopLeaderboard?.();
  void convex.close();
});
