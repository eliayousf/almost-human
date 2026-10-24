# Almost Human

*Three participants. Two minutes. Who's human?*

A social guessing game for the Mubit Night Shift hackathon. Players chat
anonymously in groups of three with zero, one, or two bots, then identify who
is human and who is AI.

## Status

**Working separately? Start with the [shared build brief](TEAM_BRIEF.md),
[public data contract](shared/game-contract.ts), and [synthetic screen fixtures](shared/fixtures.ts).**

Project brief, [MVP plan](PLAN.md), development environment, and a small
[Mubit connectivity probe](MUBIT_VERIFICATION.md). Server-side provider chat
through Mubit works. Ingestion of human training examples and application access
to the resulting adapter remain unverified.

The chat game, moderation, and player-feedback collection are not implemented yet.

## The game

1. Join random matchmaking and receive an assigned alias; no invite code or real name.
2. Watch a 3–2–1 countdown, then discover a randomly selected topic.
3. Chat with the other two participants for two minutes.
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
- Optional training participation, separate from agreeing to play.
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
There is no application start command yet. See the verification report to run
the synthetic server probe.

Use `nix shell nixpkgs#<package> -c <command>` for temporary tools instead of
installing them globally.
