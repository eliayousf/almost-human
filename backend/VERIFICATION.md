# All-human multiplayer verification

Verified 24 October 2026 against the separate Convex development deployment.

Story: three independent anonymous browser sessions join one room, exchange
messages for the full 120-second window, classify the other two participants,
and receive server-scored results and a shared leaderboard.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Browser → anonymous auth | Passed | Three independent tabs received separate generated aliases and seats using actual Convex Auth JWTs. |
| Queue → persistent room | Passed | All three joined the same room and saw the same topic/deadlines. |
| Message → Agent storage → subscription | Passed | A synthetic message from each tab appeared in all three transcripts. A contact-detail message was rejected. |
| Refresh → auth/session recovery | Passed | Refreshing one tab restored the same alias, seat, transcript, and remaining time. |
| Server timer → voting | Passed | The real two-minute chat closed and all clients received the fixed voting window. No accelerated server configuration was used. |
| Ballot → score → browser | Passed | Human/Human, Human/AI, and AI/AI ballots produced 200, 100, and 0 points against all-human truth. |
| Score → leaderboard subscription | Passed | All three tabs showed the same ordering and one completed round per player. |

Automated checks: **27 passing tests** (13 Convex game tests, 10 client
transport tests, and 4 React integration tests), TypeScript check, typed Convex
compilation/push, playtest bundle build, shared fixture checks, and zero reported
production dependency vulnerabilities. The tests additionally exercise outsider
denial, hidden topic/roles, private/immutable ballots, missing ballots,
idempotency, duplicate settlement, late Leave at the deadline, cancellation,
blocking/rematching, optional consent, abandoned queues, and dropped connections.
Client tests cover native and React subscriptions, cached/updated results,
sanitized errors, server-clock calibration, and heartbeat/unsubscribe cleanup.

## Cash's React integration kit

The official Convex Auth React provider plus `shared/react-game.ts` was verified
in React StrictMode with three independent sessionStorage-backed browser tabs.
The new reference at `/react.html` completed the full 120-second round with live
messages and refresh recovery. Human/Human and Human/AI ballots earned 200 and 100
points; the third player submitted no ballot and earned 0. Live profile totals
and the leaderboard updated together, and the reveal remained visible after
the backend cleared active-room pointers. Browser errors/warnings: none.
Play again matched the same three test sessions into a new room with new seat
aliases; leaving that room cancelled it for all three without changing scores.

The four React tests cover one startup sign-in under StrictMode, waiting for the
server's auth acknowledgement before exposing commands, stored-session recovery
without a new identity, live score updates, safe failed-auth retry, and expired
identity/subscription cleanup.

A separate Vite 8.3.5 production consumer, with its own node_modules, built the
shared React kit successfully. Module inspection confirmed that React, ReactDOM,
Convex, and Convex Auth each resolved to the consumer's single runtime using the
documented dedupe options. Vite emitted its expected use-client directive
warnings for this client-only SPA. Temporary consumer sources/builds stay outside
the repository. This check did not modify Cash's frontend.

The iPhone checklist is supplied for the team's actual devices. No physical
iPhone or hosted mobile frontend was tested in this verification.

These were three automated browser sessions using synthetic text, not a usability
test with three people. The diagnostic UI is backend-owned test tooling. Cash's
public frontend, AI rooms, comprehensive public moderation, and Mubit learning
are outside this verified milestone. No training was performed.

Screenshots and transient test artifacts remain in ignored `artifacts/`; no
credentials, raw player logs, or training datasets are committed.
# Mubit bot milestone — 24 October 2026

Verified locally on `codex/mubit-bots`, deployed to the existing development
backend `original-buzzard-860`; no public frontend was published.

- TypeScript passed. All **44 tests across four files** passed, including all
  three room compositions, queue fairness and stable draws, role privacy,
  scheduled generation, alternating bot seats, duplicate-job exclusion, provider
  failures/timeouts, deadlines, the ten-attempt cap, bot reports/blocks, and
  human-only scoring/leaderboards. Existing client/auth regressions still pass.
- Convex reported **functions ready** after pushing the optional-field/union
  schema and bot functions. The server Mubit credential was configured without
  displaying or committing it; bot matchmaking is enabled on development.
- Both diagnostic client builds and the nine shared fixture checks passed.
  Browser bundles contain public Convex configuration; no server Mubit credential
  is supplied to the frontend. Cash's `frontend/` was not changed.
- A fresh anonymous browser session joined a randomly selected one-human,
  two-bot room. Both bot seats produced real `gpt-6-luna` replies via Mubit from
  scheduled Convex actions. The room reached its cap of ten bot messages.
- The human sent synthetic topic text. Refresh preserved the same player,
  room, transcript, and remaining time. The chat closed after 120 seconds;
  both guesses were locked during the 15-second voting window. Reveal showed
  one human and two AI seats; two correct AI guesses earned **200 points** and
  updated the public alias leaderboard exactly once.
- Optional training consent stayed off. No adapter training, learning claim,
  production deployment, public frontend publishing, or teammate messaging ran.

Local-only screenshots and the synthetic transcript are under ignored
`artifacts/bot-playtest/`. The one-bot and zero-bot combinations were exercised
by component tests; this milestone's new real-model browser round used two bots.
Public-launch moderation/operator/retention and physical-iPhone gates remain
separate requirements.
