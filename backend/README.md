# Multiplayer backend

Convex owns state, subscriptions, anonymous authentication, deadlines, and scores.
This milestone is **three human players only**. The local diagnostic client is
for testing; `frontend/` remains Cash's workstream. No model is called or trained.

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

## Frontend integration

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

- Three distinct authenticated humans, compatible with either player's blocks.
- Topic hidden for the 3-second countdown; chat lasts exactly 120 seconds.
- At most 400 characters per message; burst/per-player rate and room limits.
- Exactly two other-seat guesses, one immutable ballot, a fixed 15-second window.
- 100 points per correct guess; atomic, single settlement, no client score input.
- Private round membership, own ballot only, roles shown only at reveal.
- Leave/block cancels the round with no new score; reports remain private.
- Heartbeats have a 25-second timeout; checks every 30 seconds cancel disconnected
  rooms and expire abandoned queue entries. Reconnecting promptly retains identity.
- Messages are stored in the Agent component; presence/rate limits use their
  official Convex components. No LLM call is needed for this milestone.

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
Mubit chat and learning integration remain separate, with no claimed adapter
improvement. All future game LLM calls must route through Mubit.
