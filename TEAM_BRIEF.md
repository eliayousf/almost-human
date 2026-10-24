# Almost Human: shared build brief

**Start here.** Elia and Codex own the backend; **cashpointsoulja owns the
frontend and UI/UX**. This brief and the shared types are the integration
agreement. [PLAN.md](PLAN.md) has the fuller product and safety requirements.

Status: planning, contracts, and synthetic fixtures only. No game backend or
frontend has been implemented. Mubit provider chat works; learning and trained
adapter use remain unverified. See [MUBIT_VERIFICATION.md](MUBIT_VERIFICATION.md).

## The game we are building

1. Anyone can open the public site and join anonymous matchmaking. No invite
   code, real name, or sign-up form. A server-issued session preserves scores.
2. A room has **three participants**, with **zero, one, or two bots** chosen
   randomly. At least one participant is human. Do not reveal the composition.
3. A synchronised **3, 2, 1** countdown finishes, then a random topic is revealed.
4. The group chats for **two minutes**.
5. Each human guesses **Human or AI for each of the other two participants**.
6. Lock guesses, reveal all roles, show points, and offer another round.
7. A public leaderboard shows generated aliases and guessing points.

The initial frontend can be very basic. Cash owns its visual direction and
interactions; the backend must not depend on a component library or framework.

## Ownership and file boundaries

| Work | Owner | Files |
| --- | --- | --- |
| Public screens, components, styling, accessibility, responsive UI | cashpointsoulja | `frontend/` |
| Local screen previews and mock UI adapter | cashpointsoulja | `frontend/`, using `shared/fixtures.ts` |
| Sessions, queue, room lifecycle, timers, messaging, voting, scoring | Elia + Codex | `backend/` |
| Mubit calls, moderation, consent, storage, blocks, reports, operator tools | Elia + Codex | `backend/`, `scripts/` |
| Types, constants, fixtures, HTTP contract | Shared agreement; Elia + Codex maintains initial version | `shared/`, this brief |
| Root setup and deployment configuration | Coordinate before changing | Root files, Nix flake, hosting config |

`frontend/` and `backend/` are reserved boundaries, not generated projects yet.
Cash chooses the frontend framework and owns its package manifest and lockfile.
Backend dependencies stay under `backend/`. Coordinate a root workspace setup
before introducing one. The existing Nix shell supplies Node.js and Python.

Avoid editing the other workstream's files. Propose changes to shared fields
before relying on them. Do not fork a private copy of the contract inside the UI.

## Screens cash can build now

| Screen/state | Required behaviour |
| --- | --- |
| Welcome | Premise, Play, adult eligibility/rules acceptance, separate optional training choice |
| Queue | Own alias, waiting state, Cancel; no bot count or target composition |
| Countdown | Three aliases, identify your own seat, 3–2–1; topic stays hidden |
| Chat | Topic, messages, composer, server-based timer, Leave/Block/Report |
| Voting | Transcript, two Human/AI selections, Submit; show only your own lock status |
| Reveal | All three roles, your guesses/results, earned points, streak, Play again |
| Cancelled | Plain reason and return to queue; no fabricated result or penalty |
| Leaderboard | Public aliases, guessing points, rounds, optional accuracy/recognition stats |

Also handle loading, offline/reconnecting, expired session, blocked message,
rate limit, failed send, voting timeout, and unavailable backend states.
Keep unsent text after a recoverable send error. Render all messages as plain
text. The frontend must not call an LLM or hold a Mubit key.

## Shared data contract

- Import types and `GAME_DEFAULTS` from [shared/game-contract.ts](shared/game-contract.ts).
- Import the synthetic examples from [shared/fixtures.ts](shared/fixtures.ts).
- The UI talks through the `GameClient` interface. Cash may implement a local
  mock of that interface; the backend workstream supplies its real HTTP adapter.
  That browser-safe adapter will live at `shared/http-client.ts`; it is not
  implemented yet and must contain no server credentials.
- Mock mode is explicitly labelled local demo mode. An unavailable backend
  must show an error rather than silently replacing real players with fixtures.
- Types and routes below describe the proposed v1 contract, not existing endpoints.

All dates are UTC ISO 8601 strings. `serverNow` is the server's time when the
snapshot was generated; use its offset from the client clock for countdowns.
Use `chatStartsAt`, `chatEndsAt`, and `votingEndsAt` supplied by the server.
Do not give each browser its own authoritative two-minute clock.

Snapshots have a monotonic per-round `revision`. Ignore older responses that
arrive late. The first HTTP adapter can poll once a second while queued or in a
round, with one request in flight at a time. Stop polling on unmount/exit. Realtime
transport can change inside the adapter without changing public data shapes.

Before reveal, the payload includes **no roles, bot counts, model names,
provider details, other ballots, or internal training metadata**. Before chat,
it also excludes the topic. Backend code constructs an explicit public view;
TypeScript types alone do not strip private fields from database objects.
Seat IDs and aliases must not encode whether their owner is a human or a bot.
Fixtures are preview templates; clone them before mutating local mock state.

Check shared files without installing packages globally:

```sh
nix shell nixpkgs#typescript -c tsc --noEmit --strict --target es2022 --module esnext --moduleResolution bundler shared/game-contract.ts shared/fixtures.ts
nix develop -c node --experimental-strip-types scripts/check-shared-contract.mjs
```

## HTTP mapping for the backend adapter

Base path: `/api/v1`, on the same origin as the public frontend. The backend
issues an HttpOnly session cookie. Requests use `credentials: "include"`.
No account ID or role supplied by the browser establishes authority.
Backend writes also enforce origin/CSRF protection; cookies alone are not the
complete authorisation check.

Every response follows `ApiResult<T>`, including errors. Errors have a safe
message and stable code; no stack traces, provider errors, or hidden role clues.

| Method/path | GameClient method | Request / result |
| --- | --- | --- |
| `GET /session` | `getSession` | Own `SessionView`, or `UNAUTHENTICATED` |
| `POST /session` | `createSession` | `CreateSessionInput` → own `SessionView` |
| `PATCH /session/consent` | `setTrainingConsent` | `TrainingConsentInput` → own `SessionView` |
| `POST /queue` | `joinQueue` | `CommandInput` → `QueueTicket` |
| `GET /queue/:queueId` | `getQueue` | Own `QueueTicket` |
| `POST /queue/:queueId/leave` | `leaveQueue` | `CommandInput` → `LeftResult` |
| `GET /rounds/:roundId` | `getRound` | Member-specific `RoundSnapshot` |
| `POST /rounds/:roundId/messages` | `sendMessage` | `SendMessageInput` → accepted `ChatMessage` |
| `POST /rounds/:roundId/votes` | `submitVotes` | `SubmitVotesInput` → caller's `RoundSnapshot` |
| `POST /rounds/:roundId/leave` | `leaveRound` | `CommandInput` → `LeftResult` |
| `POST /rounds/:roundId/reports` | `reportParticipant` | `ReportInput` → `RecordedResult` |
| `POST /rounds/:roundId/blocks` | `blockParticipant` | `BlockInput` → `LeftResult` |
| `GET /leaderboard` | `getLeaderboard` | Public `LeaderboardView`, initially top 50 |

Commands carry a fresh `clientRequestId`, reused when retrying that same action.
The server makes retries idempotent. It validates membership, deadlines, message
limits, moderation, and votes. UI disabling is convenience, not enforcement.

Voting is one atomic submission containing exactly two distinct other-seat IDs.
Both labels must be present. Submitted ballots cannot change. Return the saved
result for a repeated identical command; reject a new attempt to edit a locked
ballot. Reveal after the fixed voting window closes; do not expose which seats
are waiting to vote. Defaults: 3-second countdown, 120-second chat, 15-second vote
window, 400-character messages. These are server-configurable defaults.

Leaving or blocking ends the caller's active round without awarding new points.
After a short reconnect grace period, a departed human voids the room; do not
secretly substitute a bot. Reporting records a private report and offers Leave.

## Scoring agreement and unresolved proposal

Use **100 guessing points per correct classification**, maximum 200 per round,
as the initial implementation default. A round with no submitted ballot earns
zero guessing points. The server returns points and totals; the UI displays them.
The public leaderboard ranks guessing points. A perfect round extends a streak.

Show recognition by real human voters as a separate statistic. With no human
votes, show "Not rated"; never invent bot votes or treat no opportunity as failure.
The suggested **50-point Humanity bonus is not approved** and is not part of the
initial score contract. Discuss it after a playtest; do not add it independently
in frontend or backend code.

## Passive learning and public-launch requirements

Players do not write corrections. Collect opted-in human conversation examples
and the ordinary per-participant guesses. Review and redact candidates before
training. Every human whose text appears in a training example or its context
must have opted in. An AI judged Human is a believability signal, not proof that
every reply is safe, useful, or accepted for training.

Do not show "AI improved" or a training progress animation without actual
training/version evidence. Game LLM calls route through Mubit; the learning
integration remains an independent acceptance gate.

Before opening the public queue: working moderation of human and AI messages,
contact-sharing checks, rate limits, Leave/Block/Report, operator report review,
and an emergency room shutdown control. Agree the data notice, retention, and
withdrawal route before real participants join. No public chat logs.

## Parallel workflow

1. Put this foundation on `main` so both workstreams start from the same commit.
2. Cash works on a frontend branch, e.g. `frontend/game-ui`; backend work uses
   `codex/backend`. Neither person pushes gameplay changes directly to `main`.
3. Cash builds every screen against the typed fixtures. Backend work implements
   the same `GameClient` responses, without changing the UI's data assumptions.
4. Each pull request says what changed, what was checked, and any contract change.
   Merge small complete pieces; pull the updated `main` before the next piece.
5. Agree contract changes in the team's Discord `#chat`, then record them in the
   shared files. This document does not send a message or invite anyone.

If Cash does not have write access to this repository, he can work in a fork
and open pull requests. Collaborator access can be arranged separately.

The first integration milestone is **three real browsers completing an all-human
round**. Next, test one-bot and two-bot rooms with actual Mubit replies, then
scoring/leaderboard, moderation, and reconnect behaviour. Synthetic preview
fixtures cannot satisfy those live acceptance checks.

## First handoff

**Cash:** create `frontend/`, choose the framework, build the public screens and
mock adapter from the shared contract. Keep all state server-driven at the boundary.

**Elia + Codex:** choose backend/runtime/storage, implement anonymous sessions
and an all-human queue/round first, then AI, scoring, moderation, operator tools,
and the Mubit learning proof. Supply the HTTP client adapter and deployment routing.

Coordinate before either side changes root build files, shared types, URL paths,
or scoring. Keep secrets, real conversations, participant records, and model
artifacts out of Git. Synthetic fixtures are clearly labelled and safe to share.
