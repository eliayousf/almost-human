# Multiplayer backend

Convex owns state, subscriptions, anonymous authentication, deadlines, and scores.
Rooms seat **two to five participants with zero, one, or two Mubit bots**, and at
least one human. The local diagnostic client is for synthetic testing; `frontend/` remains
Cash's workstream. No training job or adapter learning loop is implemented.

Shared development URL for frontend integration:
`https://original-buzzard-860.eu-west-1.convex.cloud`.
Use synthetic text until the public-launch requirements below are complete.
The [environment example](.env.example) contains public configuration only.

## Run

From this directory:

```sh
nix develop .. -c npm ci --ignore-scripts
nix develop .. -c npx convex dev
```

Sign in to the team's Convex project when prompted. The CLI writes ignored
`.env.local` with `CONVEX_DEPLOYMENT`, `CONVEX_URL`, and `CONVEX_SITE_URL`.
Never commit this file or a deploy key. The development deployment has anonymous
auth configured. For a new deployment, configure official Convex Auth once:

```sh
nix develop .. -c npx @convex-dev/auth --web-server-url http://localhost:3219
```

This sets `SITE_URL`, `JWT_PRIVATE_KEY`, and `JWKS` on that deployment. Keep
`auth.config.ts`, `auth.ts`, and `http.ts` as configured. Use a separate production
deployment and its actual frontend origin when preparing public launch.

In another terminal:

```sh
nix develop .. -c npm run build:playtest
nix develop .. -c npm run playtest
```

Open <http://127.0.0.1:3219/> and use **Open independent participant tab** twice.
Accept the test rules, start a player, and join in each tab. Official anonymous
auth tokens stay in each tab's sessionStorage so three tabs represent three
players. Refresh preserves that tab's player and resumes its current activity.
Use synthetic text. Consent is optional; no training export exists.

## Mubit bots

Set `MUBIT_API_KEY` on the **Convex server deployment**, never in a `VITE_*`
variable or frontend file. A key in a local parent `.env` or Codex Cloud vault
does not automatically configure Convex. The CLI can read the value securely
from stdin or its interactive prompt:

```sh
nix develop .. -c npx convex env set MUBIT_API_KEY
nix develop .. -c npx convex env set MUBIT_BOTS_ENABLED true
nix develop .. -c npx convex dev --once
```

Without a server key, or with `MUBIT_BOTS_ENABLED=false`, rooms stay all-human.
With bots enabled, matchmaking sizes each lobby from the live queue (see
`convex/botlogic.ts`): five or more waiting humans match immediately (ten queued
players become two five-player games), three or four accumulate for a few
seconds, and after an honest wait of about 26 seconds a solo player or pair is
seated with one or two bots so the game is always playable. There are never
all-bot rooms. Aliases and seat positions are randomized the same way for every
lobby size.

Each bot seat is assigned a persona (dry, curious, or warm) and a difficulty
(easy, medium, or hard) recorded on its member row so judged-Human rates can be
compared per level later; the internal `bots.performance` query aggregates those
rates from stored ballots. Bots use `gpt-6-luna` through Mubit's fixed HTTPS
chat endpoint and the installed Convex Agent component. Turns alternate between
bot seats, start after countdown,
and are paced 7–11 seconds apart after a reply. At most ten generation attempts
are reserved per room, each with a ten-second provider timeout, 384 completion
token limit, and no automatic retry. Only the topic and up to twenty recent
room messages are sent as context; no account IDs or other rooms are included.

Generation results are not automatically published. An internal mutation checks
the active turn, chat deadline, character limit, and existing contact/threat
filters before saving to the room's Agent thread. Late/duplicate jobs cannot
append replies. A failed, empty, blocked, or abandoned generation ends the round
as `service_unavailable` with no points. There is no canned-response fallback.
These baseline filters do not satisfy the public-launch moderation gate below.

Bots have member seats, not authenticated player profiles. They never vote,
receive scores, appear on the leaderboard, or need human presence heartbeats.
Human ballots score against actual seat roles. Reports can target bot seats;
blocking a bot ends the room using the same public response as blocking a human.
All public `GameClient` shapes are unchanged and contain no role/model fields
before reveal. Cash should explain before Play that chats may include AI and
text is processed by AI services to generate replies; training opt-in is separate.

## Frontend integration

For the complete Vite/iPhone handoff and the optional ready-made React provider
and hooks, start with [CASH_HANDOFF.md](../CASH_HANDOFF.md). The React reference
runs at <http://127.0.0.1:3219/react.html> after the same playtest build below.

1. Install compatible `convex`, `@convex-dev/auth`, and React dependencies in the
   frontend's own package manifest. Use Convex Auth's official React provider and
   anonymous sign-in integration; no sign-up form is required. The diagnostic
   client's token bootstrap is temporary test code, not the production auth UI.
2. Use the authenticated `ConvexReactClient` owned by the Auth provider, or an
   authenticated framework-neutral `ConvexClient`, for the deployment URL. That URL
   is public configuration; JWT signing keys and deploy keys never reach browsers.
3. Import `createConvexGameClient` from `shared/convex-client.ts`. Pass the SDK
   client and an `ensureAnonymous` callback which finishes official anonymous
   sign-in and waits until the SDK is authenticated. The returned object
   implements every method of `GameClient` and supports both SDK watch APIs.
4. Use `watchQueue`, `watchRound`, and `watchLeaderboard` for native live updates;
   unsubscribe on unmount/exit. Queue/round subscriptions send 10-second
   heartbeats. Keep the adapter instance stable across renders.
5. Use `estimatedServerNow()` after calibration and the server's deadlines for
   timer display. The adapter calibrates a fresh action, because cached query
   timestamps are not a ticking clock. Only the server changes phases or scores.

The transport is Convex RPC/subscriptions, replacing the earlier proposed REST
and cookie implementation. Public data and GameClient methods are preserved.
The only added SessionView fields are optional own `activeRoundId` and
`activeQueueId` for recovery. Current policyVersion is `playtest-v1`; public launch
needs a reviewed replacement data notice. Commands use a fresh UUID; reuse it
for retrying the same action. Changed payload + same command ID is rejected.

`client/game-client.ts` lives here so its SDK imports resolve against backend
dependencies when bundling the shared shim. A frontend bundler must permit this
repository's shared and backend/client source paths. No server code is imported.
There is no `/api/v1` HTTP service to proxy.

## Rules enforced on the server

- Exactly three seats, at least one authenticated human; human pairs respect blocks.
- Topic hidden for the 3-second countdown; chat lasts exactly 120 seconds.
- At most 400 characters per message; burst/per-player rate and room limits.
- Exactly two other-seat guesses, one immutable ballot, a fixed 15-second window.
- 100 points per correct guess; atomic, single settlement, no client score input.
- Private round membership, own ballot only, roles shown only at reveal.
- Leave/block cancels the round with no new score; reports remain private.
- Heartbeats have a 25-second timeout; checks every 30 seconds cancel disconnected
  rooms and expire abandoned queue entries. Reconnecting promptly retains identity.
- Messages are stored in the Agent component; presence/rate limits use their
  official Convex components. Bot inference runs only in internal scheduled actions.

An anonymous identity survives while its auth storage survives. Clearing storage
creates a new identity and loses score/block continuity. Public anti-abuse controls
must account for that; this is not a verified-person leaderboard.

## Checks

```sh
nix develop .. -c npm run check
nix develop .. -c npm test
nix develop .. -c npx convex dev --once
nix develop .. -c npm run build:playtest
```

Tests use the real schema and official component test registrars. They cover
matching, authorization/privacy, deadlines, messages, idempotency, locked ballots,
scoring, recognition, cancellation, blocked pairs, consent, and disconnection.
See [VERIFICATION.md](VERIFICATION.md) for the completed live three-browser test.

## Before opening a public queue

The local contact/threat filters are a baseline, not comprehensive moderation.
Public launch still requires working moderation, operator report handling and
shutdown controls, anti-abuse checks, a retention/deletion policy and withdrawal
route, and frontend integration. Raw chats and real player data stay out of Git.
Training consent is recorded and revocable; it does not trigger any training.
Mubit bot inference and learning integration remain separate, with no claimed
adapter improvement. All game LLM calls route through Mubit.
