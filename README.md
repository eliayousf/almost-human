# Almost Human

*Two minutes. One stranger. Who's human?*

A social guessing game for the Mubit Night Shift hackathon. The current
[Expo/web interface](frontend/expo/README.md) pairs two anonymous participants,
then asks who is human and who is AI. It uses the shared Convex backend and
includes Ayo's 25 animated characters. The backend's older group mode remains
available to compatible clients.

**Judges: start with [JUDGING.md](JUDGING.md).** It maps all four criteria to
sanitised evidence, reproducible checks and an honest demo runbook.

**Current limit:** a synthetic conversational correction reached completed
Mubit training, but the trained adapter cannot serve a fresh live answer.
Improved dialogue and production readiness are not established.

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

This installs locked dependencies and runs credential-free local checks. It
does not contact the game or Mubit. See the [check receipt](judging/evidence/checks.json)
and [demo instructions](judging/DEMO.md) for their separate scopes.

## How it works today

The deployed integration preview now builds `frontend/expo/`. Its shared client
requests strict 1v1 rooms, receives server topics/timers/scores and routes bot
replies through Mubit. See [INTEGRATION.md](INTEGRATION.md) for exact tested builds.
The Vite frontend in `frontend/src/` remains as earlier work, not the active build.

Vote-based bot improvement is a standard part of the current Expo playtest,
explained in its terms before joining. There is no separate feedback toggle.
See [playtest terms and versioning](PLAYTEST_TERMS.md) for the treatment of
existing players and the separate boundary around human-chat training.

In the backend's default group mode, matchmaking fills lobbies from the live queue: five or more waiting humans
match immediately (ten queued players become two five-player games), three or
four accumulate for a few seconds, and after a waiting period a solo player
can be seated with bots when server bot inference is enabled and available. Each round runs a
synchronised countdown, a random topic, two minutes of chat, then voting: every
human guesses Human or AI for each other seat. Scores are server-scored (100
points per correct seat) and land on a public alias leaderboard.

Bots are first-class seats: a scheduler spawns them with personas, difficulty
levels, and Mubit-powered chat replies (see [backend/BOTS.md](backend/BOTS.md)).
Per-round data records each bot's difficulty so we can later measure how it
affects human guessing accuracy.

## Status

**Working separately? Start with the [shared build brief](TEAM_BRIEF.md),
[public data contract](shared/game-contract.ts), and [synthetic screen fixtures](shared/fixtures.ts).**

**Connecting the frontend?** [Cash's handoff](CASH_HANDOFF.md) includes the
React/Vite setup, anonymous auth provider, live hooks, runnable reference, and
iPhone acceptance checklist.

Project brief, [MVP plan](PLAN.md), development environment, and a small
[Mubit connectivity probe](MUBIT_VERIFICATION.md). Server-side provider chat
through Mubit works. A [reviewed synthetic conversational correction and training
batch](MUBIT_TRAINING_RUN.md) produced a completed adapter job. Its evaluation
failed and live adapter inference remains blocked; the game is not verified to
use the trained version. Real-player training ingestion remains unverified.

The **multiplayer backend is implemented with Convex**: anonymous sessions,
matchmaking for two-to-five-player lobbies, a 3-second countdown, 120-second
chat, 30-second voting, server-scored results, a public leaderboard, and AI bot
players through the Mubit chat gateway. Cash owns the public frontend.
[Backend setup and integration](backend/README.md) includes a local diagnostic
client. Comprehensive moderation and the learning pipeline remain separate
milestones.

## The game

1. Join random matchmaking and receive an assigned alias; no invite code or real name.
2. Watch a 3–2–1 countdown, then discover a randomly selected topic.
3. Chat with the other lobby participants for two minutes.
4. Guess **Human** or **AI** for each of them.
5. See the reveal, earn points, appear under an alias on the public leaderboard,
   and play another round.

Everyone knows before playing that a conversation partner may be an AI.
The reveal identifies human or AI status, never a player's real identity.

## First prototype

- Anonymous random matchmaking for adults, with an operator available during playtests.
- Public deployment for hackathon attendees and anyone online; no invite gate.
- Basic functional UI initially; cashpointsoulja owns UI/UX.
- Text chat with no attachments, clickable links, contact sharing, or follow-up messages.
- Visible Leave, Block, and Report controls; no penalty for leaving.
- Moderation of both human and AI messages, with an operator reviewing reports.
- Vote feedback covered by playtest terms; any human-chat training participation remains separate.
- Training candidates limited to reviewed, redacted conversations with the required participants' consent.
- Defined retention and deletion, restricted data access, and no public chat logs.

These are requirements for the build, not claims about existing safeguards.

## Learning goal

Collect opted-in human conversation examples and ordinary end-of-round guesses.
Players do not write replacement replies. Investigate whether Mubit can ingest
reviewed human examples and use detection outcomes to improve a task-specific adapter.
Human-likeness, helpfulness, and safety are separate evaluation criteria.

Before building the learning loop, verify the complete path:

**Approved example → accepted training data → completed adapter training → fresh adapter response.**

Game-model LLM calls must route through Mubit. API credentials stay on the server.
No game or training data belongs in this public repository.

## Development environment

The pinned Nix flake supplies Node.js 22, Python 3, Git, and common project tools.

```sh
nix develop
```

With direnv configured, allow this project's `.envrc`, which contains `use flake`.
For the multiplayer backend and local test client:

```sh
cd backend
nix develop .. -c npm ci --ignore-scripts
nix develop .. -c npm run dev
# In another terminal, after configuring backend/.env.local:
nix develop .. -c npm run build:playtest
nix develop .. -c npm run playtest
```

Open `http://127.0.0.1:3219/` in three independent tabs. Use synthetic text.
See [backend/README.md](backend/README.md) for anonymous auth setup, checks,
frontend handoff, and remaining public-launch requirements.

Use `nix shell nixpkgs#<package> -c <command>` for temporary tools instead of
installing them globally.
