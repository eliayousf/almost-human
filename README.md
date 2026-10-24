# Almost Human

*Two minutes. One conversation. Human or AI?*

A social guessing game for the Mubit Night Shift hackathon. Players chat
anonymously with another player or an AI, then guess which they encountered.

## Status

Project brief and development environment only. The chat game, moderation,
feedback collection, and Mubit adapter integration are not implemented yet.
Adapter training and application access must be verified before promising
that the game improves a model.

## The game

1. Join a private lobby and receive an assigned nickname.
2. Enter a two-minute text conversation with a human player or an AI.
3. Guess **Human** or **AI** when the round ends.
4. See the reveal, earn points for a correct guess, and play another round.

Everyone knows before playing that a conversation partner may be an AI.
The reveal identifies human or AI status, never a player's real identity.

## First prototype

- Invite-only rooms for adults.
- Text chat with no attachments, clickable links, contact sharing, or follow-up messages.
- Visible Leave, Block, and Report controls; no penalty for leaving.
- Moderation of both human and AI messages, with an operator reviewing reports.
- Optional training participation, separate from agreeing to play.
- Training candidates limited to reviewed, redacted conversations with the required participants' consent.
- Defined retention and deletion, restricted data access, and no public chat logs.

These are requirements for the build, not claims about existing safeguards.

## Learning goal

Collect permitted feedback on conversational naturalness and investigate whether
Mubit can use approved examples to train a task-specific language-model adapter.
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
There is no application start command yet.

Use `nix shell nixpkgs#<package> -c <command>` for temporary tools instead of
installing them globally.
