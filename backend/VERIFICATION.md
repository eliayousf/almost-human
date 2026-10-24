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

# Playtest hardening — local verification, 24 October 2026

Base: `codex/mubit-bots` at `4283275` (includes `e88702f`). The initial
investigation's overlapping cancellation/presence changes were discarded.
Used project-local Node.js 22.23.4; Nix was unavailable and was not run.
The diagnosis of the original failures remains unresolved: the logs contain no
HTTP status or error text for those failures. A network/edge failure before an
HTTP response is the best-supported interpretation, but remains unproven.
The network-rejection regression covers that path.

- The unmodified base passed all **53 tests**, TypeScript, and both diagnostic
  builds. Its transient-first-turn retry and dynamic ballot count are preserved.
- Before integration, the batch passed **111 tests across seven files**, TypeScript, both
  diagnostic builds, all nine shared fixtures and `git diff --check`.
- Reproduced and fixed a watchdog race: two ten-second attempts plus the
  two-second backoff can outlive the old 18-second watchdog. A first timeout
  followed by a nine-second successful retry now publishes exactly one message.
  The watchdog now includes typing time: 40 seconds. A new turn needs the
  24-second generation budget plus its minimum typing delay before chat ends.
- Retry classification is checked through the actual Agent and adapter:
  network failures (including response-body connection loss), timeouts and
  429/500/502/503/504 responses permit at most one retry. 400/401/403/408,
  malformed JSON and empty replies do not retry. Raw upstream bodies and
  credentials are excluded from error messages and logs; numeric HTTP status
  is retained server-side and excluded from public round data.
- Sustained failures cancel without points, clear resume pointers, display a
  service-unavailable explanation and let the player join again. Unsafe/late
  replies, duplicate callbacks, watchdog expiry and turn caps remain covered.
- Mobile reconnect coverage checks immediate wake heartbeats, at most one
  outstanding heartbeat, listener cleanup, stored-identity refresh and the same
  seat/transcript/deadline after a 20-second interruption. The original
  25-second presence timeout is retained. Clock failure cannot delay presence
  or replace a healthy round snapshot. A page-cache suspension no longer
  permanently closes the vanilla harness's SDK client.
- The actual bundled vanilla UI passed **390×844 Chromium mobile emulation**
  against synthetic fixtures: tap/type, focus and draft preservation across an
  update, send, cancellation explanation/replay control, and 2/3/5-seat ballot
  submission. Browser page errors: zero. This was not physical iPhone Safari;
  page-cache lifecycle events are also covered in DOM tests.
- One earlier run of a pre-existing matching test exceeded its five-second
  timeout while browser verification ran concurrently; the final full suite
  subsequently passed all 80 tests before the explicit 429-policy update.

## Current proposal: turn-taking, presentation, pacing and owner decisions

1. **Two-seat self-conversation (confirmed bug):** successful commits always
   queued another bot turn, and transcript lines did not explicitly identify
   the bot's own text. Two-seat rooms now allow one opener, then require human
   text absent from the last claimed context. Accepted human text wakes the
   bot; text arriving during generation or typing gets a follow-up after
   publication. An optional private human-message marker keeps duplicate jobs
   and idempotent command retries from triggering extra replies. Rooms with
   three or more seats keep scheduled turns, including one-human/two-bot rooms.
   Every bot's own transcript lines are marked `(you)` without exposing roles.
2. **Reveal denominator (display bug):** both harnesses used a literal `/2`.
   They now render `correctGuessCount/(participants.length - 1)` without
   changing ballot validation or scoring. Vanilla and React render regressions
   cover zero/correct guesses in two-seat rooms and three-/five-seat rooms.
3. **Typing pacing:** replies remain private until a durable, length-scaled
   publication callback: 2 seconds plus 70 ms per Unicode character, capped
   at 12 seconds. Two-seat human replies generate without the group-room gap;
   larger rooms retain their 7–11-second gap before generation. The 40-second
   watchdog includes both 10-second attempts, the 2-second retry pause and
   maximum typing time. Tests cover slow retries, duplicate publication, text
   arriving during typing, silence, late generation, leave and voting deadlines.
   **Known deadline limitation (behavior preserved):** in a two-seat room,
   human text received while a bot turn is reserved does not schedule another
   turn in `sendMessage`. If generation returns too late for its length-scaled
   typing delay, `prepareReply` clears that reservation and drops the reply
   before scheduling publication. No successful `commit` runs to queue the
   human's follow-up, so their accepted text can remain unanswered for the rest
   of chat. The text stays in the transcript; the round proceeds to voting
   without cancellation, a rushed reply or a deadline extension. A regression
   pins this sequence. At the drop, at most 12 seconds remain, below the
   existing 26-second minimum turn budget; recovering a reply would require
   a separate decision about generation budgets or pacing semantics.
4. **Texting style, including emoji refinement:** all difficulty prompts target
   3–12 words, at most 80 characters, and one or two short lines. They forbid
   em/en dashes, smart quotes/apostrophes, typographic ellipses and markdown
   formatting. Most messages have no emoji; emoji use is rare, at most one,
   varied and not repeated from the bot's previous messages. Prompt regressions
   check these rules at every difficulty. These are generation instructions;
   the canonical moderated text is not silently rewritten.

Item 4 basis: playtest findings by the product owner (24 Oct): over-long messages, repeated emojis, instant replies, em dashes.

5. **Explicit product-owner decision: voting increases from 15 to 30 seconds.**
   This is a product decision, distinct from the bug and bot-tell fixes above.
   Countdown remains 3 seconds and chat remains 120 seconds. Matchmaking derives
   all deadlines from `GAME_DEFAULTS`; voting/reveal fixture timestamps and
   current handoff documentation follow the new window. Regressions verify a
   solo ballot is accepted at 20 seconds, reveal waits until 30 seconds, and
   the scheduled lifecycle does not settle at the old 15-second cutoff.

Item 5 basis: voting 30s is an explicit product-owner decision (24 Oct), following a solo playtest finding that the 15-second window was too short.

Local checks completed; no new live or device verification was performed in this environment. No merge, push,
backend deployment, model training or public publishing was performed.


## Integration onto Ayo's ratings branch — 25 October 2026

Base and final uncommitted HEAD: `66f4831` (`origin/cash/mubit-ratings`).
Batch items 1–6, prior retry/reconnect hardening and the deadline-drop regression
are integrated with Ayo's ratings, consent and lesson flow. Ayo's pooling wins:
batch item 7's prompt layout and its incompatible tests are dropped. His alias,
persona, difficulty and lesson formatting stays in the user message; the batch's
texting rules stay fixed in the shared system message. The injection-safety test
is retained and also checks untrusted lesson text.

`takeTurn` passes request IDs and lesson counts through `prepareReply` to the
delayed `commit`, which records each published bot line once in `botCalls`.
Regressions cover pending publication, duplicate callbacks, lessons and retry
request IDs alongside all of Ayo's ratings cases. `mubitConsole.ts`, `ratings.ts`,
flag declarations and flag defaults are unchanged from `66f4831`.

The earlier fragmentation finding remains context: the Mubit console snapshot
at 21:38 UTC on 24 Oct (project `ws-c1ceb04caf9a7083`) showed 14 Almost Human
tasks, 83 calls in the last 7 days and 1 kept example total. This integration
has no new live console, device or training verification. Nothing is pushed,
opened as a pull request or deployed; merged source changes remain uncommitted.

The combined suite passes **117 tests across seven files**, TypeScript, both
harness builds, all nine shared fixtures and `git diff --check`. The full-diff
secrets scan has zero private message IDs or credential findings; the existing
phone-number moderation fixture is the sole permitted baseline exception.
