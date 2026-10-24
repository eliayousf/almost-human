# Cash: frontend integration handoff

Start here. Build your screens in `frontend/`; the backend is already hosted.
Recommended demo: **React + Vite + TypeScript, opened in iPhone Safari via HTTPS**.
Your design remains yours. The provider, hooks, types, fixtures, and reference
screens below supply the connection and game behavior.

Current milestone: lobbies of two to five participants, and rooms may already
include bot players (zero, one, or two, chosen by the server). Always render the
returned `participants` array by its length rather than assuming three seats or
human-only rooms; votes need one guess per other seat. Mubit learning is
separate work. Explain before Play that partners may be AI and that chat text
is processed by AI services for replies; training opt-in is separate.
Development playtests use synthetic conversation text.

## 1. Get the code without replacing your frontend

Repository: <https://github.com/eliayousf/almost-human>.
Backend branch: `codex/backend`. Review: <https://github.com/eliayousf/almost-human/pull/1>.

Save your current work on your frontend branch, then run from the repository root:

```sh
git fetch origin
git merge origin/codex/backend
nix develop -c npm --prefix backend ci --ignore-scripts
```

Keep working on your frontend branch. You do not need a Convex account, deployment
key, Mubit key, or running backend CLI just to connect your UI to this deployment.
The backend package install supplies dependencies for shared source files.

If you have not created the frontend yet, the Vite React TypeScript template is
the recommended starting point. Keep its package manifest and lockfile in
`frontend/`. If your app already exists, integrate into it.

Install the tested client versions in your frontend too:

```sh
nix develop -c npm --prefix frontend install --save-exact react@19.3.1 react-dom@19.3.1 convex@1.48.0 @convex-dev/auth@0.0.96
nix develop -c npm --prefix frontend install --save-dev --save-exact @types/react@19 @types/react-dom@19
```

These commands assume the Vite frontend already has its own package.json. Use the
root Nix shell (`nix develop`, or direnv with `.envrc`) for project tooling.

## 2. Configure the public backend URL

Put this in ignored `frontend/.env.local`, and in the frontend host's build settings:

```dotenv
VITE_CONVEX_URL=https://original-buzzard-860.eu-west-1.convex.cloud
# Local desktop test only: each normal tab becomes an independent test player.
VITE_INDEPENDENT_PLAYTEST_TABS=true
```

Restart Vite after changing environment variables; rebuild after changing hosted
environment variables. The `.convex.cloud` URL is public configuration. Do not
use `.convex.site` as the SDK URL or put signing/deploy/Mubit keys in `VITE_*`.

For the actual demo, leave the independent-tab flag unset/false. The official
provider then persists one anonymous player in localStorage. Each phone/browser
has its own identity. Clearing browser storage loses that identity and its score.

## 3. Let Vite import the shared client

Merge these options into `frontend/vite.config.ts` (keep your existing plugins):

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@game": fileURLToPath(new URL("../shared", import.meta.url)) },
    dedupe: ["react", "react-dom", "convex", "@convex-dev/auth"],
  },
  server: {
    fs: { allow: [
      fileURLToPath(new URL(".", import.meta.url)),
      fileURLToPath(new URL("../shared", import.meta.url)),
      fileURLToPath(new URL("../backend/client", import.meta.url)),
    ] },
  },
});
```

The dedupe setting matters: `backend/` and `frontend/` each have dependencies.
All React hooks and auth contexts must use the same runtime copies. Vite documents
[dedupe](https://vite.dev/config/shared-options.html#resolve-dedupe) and
[filesystem access](https://vite.dev/config/server-options.html#server-fs-allow).
An isolated Vite 8.3.5 consumer build verified that these dependencies resolve
to one frontend runtime. A use-client directive warning can appear from the
shared/auth modules in a Vite SPA; this build passes and executes entirely on
the client. Do not remove the auth provider to silence that warning.

In the compilerOptions of the frontend app's tsconfig, add:

```json
{ "paths": { "@game/*": ["../shared/*"] } }
```

Keep the normal `react-jsx`, Bundler module resolution, DOM, and `vite/client`
types from the React TypeScript template. Do not constrain `rootDir` to `src/`
if it prevents importing the shared sources. Importing through the alias pulls
in their types; do not make a private copy of the contract or server functions.

## 4. Mount the ready-made provider once

Example `frontend/src/main.tsx`; replace App with your actual root component:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { AlmostHumanProvider } from "@game/react-game";
import App from "./App";

const url = import.meta.env.VITE_CONVEX_URL;
if (!url) throw new Error("Set VITE_CONVEX_URL and restart the frontend.");
const convex = new ConvexReactClient(url);
const independentTabs = import.meta.env.VITE_INDEPENDENT_PLAYTEST_TABS === "true";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AlmostHumanProvider
      client={convex}
      storage={independentTabs ? window.sessionStorage : undefined}
    >
      <App />
    </AlmostHumanProvider>
  </StrictMode>,
);
```

The provider restores stored auth or signs in anonymously, waits for the server
to acknowledge the JWT, and exposes a stable game client. It handles StrictMode
startup, a connection timeout, sanitized errors, and retry. Do not add a second
Convex provider or implement token storage/refresh yourself.

Anonymous auth can initialize on page load. The game profile is created only
after Play submits the eligibility/rules choices. Training consent stays optional.
If auth expires, the provider shows an error rather than silently replacing the
player. Retry may create a new identity if the old one cannot be recovered.

## 5. Use live hooks to drive your screens

```tsx
import {
  useAlmostHuman, useGameSession, useGameQueue, useGameRound,
  useGameLeaderboard, useRoundSeconds,
} from "@game/react-game";
```

| Hook | What it supplies |
| --- | --- |
| `useAlmostHuman()` | `{status, game, error, retry}`; game is null until authenticated |
| `useGameSession()` | Own profile, consent, total score, optional active queue/round IDs |
| `useGameQueue(queueId or null)` | Waiting or assigned ticket; maintains queue presence |
| `useGameRound(roundId or null)` | Caller-specific live round; maintains room presence |
| `useGameLeaderboard()` | Public top 50 aliases, scores, rounds, optional accuracy/recognition |
| `useRoundSeconds(round or undefined)` | Nonnegative countdown seconds, or null outside timed phases |

Data hooks return `undefined` while loading, then `ApiResult<T>`. Handle all
three states. Hooks release subscriptions on unmount or ID change and suppress
snapshots from the previous watch. Keep the provider above page transitions;
do not recreate the SDK client inside a screen's render.

Queue/round presence relies on keeping the relevant hook mounted throughout
waiting/play. A hidden component that remains mounted still subscribes: pass
null or unmount when exiting. Leaderboard/session watches do not keep a room alive.

| Screen | Backend source and action |
| --- | --- |
| Connecting | `status === "connecting"`; disable Play until game is available |
| Connection error | Show error, call retry on a deliberate retry action |
| Welcome | New anonymous auth has no game profile; getSession returns UNAUTHENTICATED; show rules/eligibility and optional consent |
| Queue | `joinQueue`, then watch own ticket; assigned ticket gives roundId |
| Countdown | round.phase countdown; show seats/self and chatStartsAt countdown; no topic yet |
| Chat | round.phase chat; display topic/messages, composer, chatEndsAt, safety controls |
| Voting | round.phase voting; display transcript, exactly two labels, ownBallot, votingEndsAt |
| Reveal | round.phase reveal; display server-provided kinds and yourResult |
| Cancelled | round.phase cancelled; display message; no score awarded |
| Leaderboard | Render live server entries; guessing points determine order |

Route by the server's phase. Zero on a local timer never reveals roles, invents
a result, or starts voting. If the next snapshot is delayed, show a short waiting
state. The backend controls all deadlines and scores. Chat is 120 seconds after a 3-second
countdown; voting is 30 seconds. Messages are limited to 400 characters.

## 6. Commands: actual shapes

Import types from `@game/game-contract`. Every command uses a UUID. Reuse the
same UUID and payload for a network retry; use a new UUID for a new action.
Render ongoing state from live hooks, rather than replacing it with a potentially
older command response. The low-level client also has getSession/getQueue/getRound.

```ts
const command = () => ({ clientRequestId: crypto.randomUUID() });

await game.createSession({
  ...command(), adultConfirmed: true, rulesAccepted: true,
  policyVersion: "playtest-v1", trainingOptIn: false,
});
await game.joinQueue(command());
await game.sendMessage(roundId, { ...command(), text });
await game.submitVotes(roundId, {
  ...command(),
  votes: [
    { participantId: otherSeatA.id, label: "human" },
    { participantId: otherSeatB.id, label: "ai" },
  ],
});
await game.leaveQueue(queueId, command());
await game.leaveRound(roundId, command());
await game.blockParticipant(roundId, { ...command(), participantId: otherSeatA.id });
await game.reportParticipant(roundId, {
  ...command(), participantId: otherSeatA.id, reason: "harassment",
});
await game.setTrainingConsent({
  ...command(), policyVersion: "playtest-v1", trainingOptIn: false,
});
```

CreateSession must reflect the user's actual checked choices; do not auto-accept
eligibility/rules. Preserve typed text after a failed send. Disable duplicate
submissions while pending. Votes contain exactly two distinct other seats and
become immutable once submitted. Report reason choices are harassment,
personal_information, unsafe_content, spam, other; optional detail maximum 500 characters.
Report success is `{recorded:true}`; leave/block success is `{left:true}`.

Own session has `activeRoundId`/`activeQueueId` for refresh recovery. Prefer the
active round when both exist. Retain the displayed terminal round locally after
settlement clears those pointers; otherwise the result screen can disappear.
The runnable example shows this. No auth tokens belong in URLs.

Chat uses fresh round-scoped seat aliases. Leaderboard alias is a separate,
persistent score alias. Identify your chat bubble using `senderId === selfId`.
Render message text as text, never HTML. Never render or infer hidden roles.
Server IDs come from real responses; fixture IDs such as demo-seat-1 are invalid
for backend writes. Readability percentages with null fractions show Not rated.

Scores: 100 per correct classification, maximum 200; no ballot earns 0. Perfect
round extends a streak. Recognition is a separate statistic; there is no 50-point
bonus. Play again calls joinQueue after reveal/cancelled; the backend rematches.

## 7. Errors the UI should handle

| Error | UI response |
| --- | --- |
| UNAUTHENTICATED on first profile read | Auth may be ready but profile not created; show Welcome |
| Other UNAUTHENTICATED | Connection/recovery state; do not fabricate a fresh score |
| MESSAGE_BLOCKED | Keep text; show returned explanation and allow editing |
| RATE_LIMITED | Respect retryAfterMs; keep the intended action/input |
| VOTES_LOCKED | Disable voting; follow ownBallot from the live round |
| ROUND_CLOSED | Stop sending/voting; follow the next server phase |
| ALREADY_IN_ROUND | Resume session.activeRoundId |
| QUEUE_CLOSED | Clear local queue selection; offer Join again |
| INVALID_INPUT | Show safe message; check IDs, both votes, limits, policy version, and UUID reuse |
| NOT_FOUND / NOT_PARTICIPANT | End the stale view and offer return to lobby |
| SERVICE_UNAVAILABLE | Show retry/reconnecting; preserve input and command ID |

An unavailable backend is an explicit error. Never silently substitute mock
players, synthetic success, a local timer result, or fixture scores.

## 8. Working reference and screen fixtures

From the repository root:

```sh
nix develop -c npm --prefix backend run build:playtest
nix develop -c npm --prefix backend run playtest
```

For these npm commands, backend/.env.local needs CONVEX_URL; copy the public
values from backend/.env.example if the file is absent. No key is needed to run
the browser client against the existing deployment. Do not reconfigure/deploy
the backend simply to run this reference.

Open <http://127.0.0.1:3219/react.html>. It uses **the exact provider and hooks
above**, official anonymous auth, and sessionStorage for three independent tabs.
It is a functional reference with no product styling. Source:
[backend/playtest/react-main.tsx](backend/playtest/react-main.tsx).
The original vanilla reference remains at `/`.

[shared/fixtures.ts](shared/fixtures.ts) contains synthetic countdown, chat,
open/locked voting, reveal with 0/1/2 bots, missed voting, cancelled, leaderboard,
blocked message, rate limit, and unavailable states. Use these for visual work
in explicitly labelled mock mode. They are not valid server IDs or live players.

## 9. iPhone demo and hosting

Use a hosted **HTTPS** frontend URL. Localhost on a phone points at the phone,
not a laptop. Plain HTTP at a laptop's LAN IP also does not provide the secure
context required by [crypto.randomUUID](https://developer.mozilla.org/en-US/docs/Web/API/Crypto/randomUUID).
The backend URL remains the hosted HTTPS Convex URL. No native app install is needed.

Vite builds a static frontend; [current default browser targets include
Safari 16.4+](https://vite.dev/guide/build.html#browser-compatibility). Test on the
actual iPhones used for the demo; desktop automation is not an iPhone test.

For a host building from this monorepo, use repository root as its build root:

- Install: `npm --prefix backend ci --ignore-scripts && npm --prefix frontend ci`
- Build: `npm --prefix frontend run build`
- Output: `frontend/dist`
- Node: 22; public build env VITE_CONVEX_URL as above.
- If using client-side routes, configure navigation fallback to index.html.

Keep the whole repo in build context so shared sources are available. Never
upload backend/.env.local, signing keys, or raw chats. Hosting a frontend does
not deploy Convex functions; backend deployment stays with Elia's workstream.
Vite's [preview server](https://vite.dev/guide/static-deploy.html) is local test
tooling, not the public hosting service.

iPhone UI checks: viewport metadata, portrait layout without horizontal scrolling,
16px-or-larger text inputs, comfortable tap targets, readable contrast, reduced
motion support, keyboard that leaves the composer/Send visible, and safe-area
padding for any fixed controls. Use dynamic viewport sizing rather than assuming
100vh is always the visible area. Keep the in-game timer derived from server time.
Check Wi-Fi/cellular, refresh, and browser background/foreground transitions.
Long backgrounding can void a room: 25-second heartbeat timeout, checked every 30 seconds.

## 10. Acceptance checklist

- [ ] Three devices or independent sessions create three distinct players.
- [ ] They enter one room, see the same countdown and topic, and exchange text.
- [ ] Refresh preserves identity, room, transcript, and remaining time.
- [ ] Chat closes after 120 seconds; the other seats can be classified for 30 seconds.
- [ ] Guesses lock and each player sees only their own submitted ballot.
- [ ] Reveal and leaderboard reflect real server points; no ballot earns 0.
- [ ] Play again works; Cancel waiting, Leave, Block, and Report are accessible.
- [ ] Blocked messages/rate limits preserve input; offline errors are visible.
- [ ] The actual hosted HTTPS URL works in portrait Safari with the keyboard open.
- [ ] No browser secrets, raw chat logs, or fabricated learning claims are shipped.

Backend and React kit are verified with 27 tests and a full 120-second
three-browser round through each reference client. The React handoff also
passed an isolated Vite consumer build. Actual iPhone testing remains on the
checklist. [backend/VERIFICATION.md](backend/VERIFICATION.md) records results.

Public launch still needs comprehensive moderation, operator report review and
shutdown controls, retention/deletion and withdrawal rules. UI integration does
not imply those gates or the Mubit learning proof have been completed.
