# Multiplayer backend

Convex owns state, subscriptions, anonymous authentication, deadlines, and scores.
Rooms seat **two to five participants with zero, one, or two Mubit bots**, and at
least one human. The local diagnostic client is for synthetic testing; `frontend/` remains
Cash's workstream. Model training and trained-adapter use remain unverified.

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
bot seats and start after countdown. In two-seat rooms the bot may open once,
then waits for a new human message before generating another reply. Human text
arriving during generation or typing gets a follow-up; duplicate callbacks and
retried human commands cannot restart a self-conversation. Larger rooms retain
their scheduled turns and existing 7–11-second gap between generations.

Every generated reply is moderated, then published by a durable scheduled
mutation after a typing delay: 125–175 ms per Unicode character,
bounded to 6–12 seconds. Two-seat replies begin generating on human input instead
of adding the group-room gap. No reply is rushed into the transcript at the
deadline: if typing cannot finish before chat ends, it is discarded. The final
mutation rechecks phase, moderation, membership and the claimed turn.

The prompt targets one brief phone text: 3–12 words, at most 80 characters,
one or two short lines, plain keyboard punctuation, and no em/en dashes, smart
quotes, typographic ellipses, bullets, headings or markdown. Most messages have
no emoji; any emoji is rare, limited to one, varied and not repeated from the
bot's earlier messages. Own transcript lines are marked `(you)`, and the prompt
lists the actual participants. These are model instructions; the existing
400-character moderation limit remains the publication safeguard.

Shared game, style and safety instructions are identical across seats and
variants. Ayo's prompt format places alias, persona style, difficulty texture
and optional earlier bot-only lessons in the user message. Published replies
retain their Mubit request ID and lesson count for consent-aware round verdicts
and optional ratings. See [MUBIT_LEARNING.md](../MUBIT_LEARNING.md) for that flow
and its existing controls. Live console task pooling remains unverified here.

At most ten turns are reserved per room. Each request has a ten-second provider timeout and 384 completion token
limit. Network errors, timeouts, HTTP 429 and HTTP 5xx responses get at most one
retry after two seconds. Other HTTP 4xx responses (including 408), malformed
responses and other non-transient failures are never retried. A turn needs the
one ten-second attempt plus the minimum typing delay and two seconds of headroom before chat ends;
its 40-second watchdog covers both attempts, maximum typing and processing overhead.
The topic, up to twenty recent room messages and optional earlier bot-only
lessons form the context; no account IDs or other rooms' human messages are included.

Generation results are not automatically published. An internal mutation checks
the active turn, chat deadline, character limit, and existing contact/threat
filters before saving to the room's Agent thread. Late/duplicate jobs cannot
append replies. A failed generation after its permitted retry, or an empty,
blocked or abandoned generation, ends the round as `service_unavailable` with no
points. Players see a service-unavailable explanation and can play again. Server
diagnostics retain the numeric upstream HTTP status without response bodies or
credentials; public round data never includes provider diagnostics.
There is no canned-response fallback.
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

Clock calibration is best effort and cannot delay round queries, subscriptions
or presence. While a mobile connection is unavailable, at most one heartbeat is
in flight; returning to a visible page or reconnecting sends a fresh beat without
waiting for the next interval. Safari page-cache suspension preserves the SDK
and subscriptions instead of permanently closing them. Refresh restores the same
stored anonymous identity. The existing 25-second presence timeout still applies;
resume cannot revive a round the server has already cancelled.

The transport is Convex RPC/subscriptions, replacing the earlier proposed REST
and cookie implementation. Public data and GameClient methods are preserved.
The only added SessionView fields are optional own `activeRoundId` and
`activeQueueId` for recovery. Current Expo policyVersion is `playtest-v2-vote-feedback`; legacy
`playtest-v1` clients remain compatible. See [playtest terms](../PLAYTEST_TERMS.md). Commands use a fresh UUID; reuse it
for retrying the same action. Changed payload + same command ID is rejected.

`client/game-client.ts` lives here so its SDK imports resolve against backend
dependencies when bundling the shared shim. A frontend bundler must permit this
repository's shared and backend/client source paths. No server code is imported.
There is no `/api/v1` HTTP service to proxy.

## Rules enforced on the server

- Two to five seats (two for strictPair), at least one authenticated human; human pairs respect blocks.
- Topic hidden for the 3-second countdown; chat lasts exactly 60 seconds.
- At most 400 characters per message; burst/per-player rate and room limits.
- One guess per other seat, one immutable ballot, at most a 10-second window;
  reveal immediately when every human has voted.
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

### Typing indicators

Chat snapshots optionally include `typing: [{ participantId, until }]`. Only current
room members can call `game.setTyping({ roundId, typing })`; identity comes from
Convex Auth. Draft content is never sent. Clients throttle activity to once per
1.5 seconds, stop after 2.5 seconds of inactivity, and hide expired signals using
the calibrated server clock (four-second server expiry). Sending clears activity
atomically. Human and prepared AI replies share the same role-free shape and four-second
lease; bots renew their lease without exposing the planned send timestamp.

AI publication waits 125–175 ms per Unicode character, bounded to 6–12 seconds.
A reply that cannot finish its full delay before chat closes is dropped. Presence
metadata is isolated per room and removed on voting/cancellation/reveal.

Deploy the Convex schema/functions from the same revision before enabling this in
production. The frontend detects support from the `typing` field and remains
compatible with an older backend. A Vercel frontend deployment alone cannot
activate typing or change server-side AI pacing.
