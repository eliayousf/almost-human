# Mobile layout and multiplayer checks

This work belongs to `eliayousf/almost-human` and is based on
`codex/frontend-integration`. It uses the existing shared Convex client and
backend. It does not introduce a second game server.

## Layout

- Web root height follows `visualViewport.height`, including toolbar and keyboard resizes.
- Document overflow remains scrollable. Non-chat screens also have a scroll region.
- Enter room sits immediately beneath the portrait; the idle question-mark spacer is removed.
- Small chat viewports prioritize messages and the composer; the large portrait is hidden below 440px of visible height.
- At widths of at least 900px, chat uses a 280px opponent/topic column and a flexible conversation column, within a 1040px maximum width.
- Browser safe-area padding protects bottom controls. The input remains 16px to avoid iOS focus zoom.

The isolated `?preview=idle`, `?preview=chat`, `?preview=guess`, and
`?preview=reveal` routes use clearly labelled synthetic data for responsive
checks. They do not join a live room or create a session.

## Existing multiplayer architecture

```text
Independent browser identities
          ↓
Shared authenticated Convex client (reactive room subscriptions)
          ↓
Transactional queue → private room + per-room thread
          ↓                          ↓
Human message mutations       Per-room scheduled AI action → Mubit
          ↓                          ↓
       Authoritative chat/vote deadlines → one-time scoring
```

Strict 1v1 matchmaking prefers two compatible waiting humans. A solo player
waits for the configured grace period before an AI can take the other seat.
Room membership, messages, ballots, scores, idempotent commands and rate limits
are enforced on the server. Different devices have independent anonymous
identities; ordinary tabs sharing browser storage intentionally share a player.

## Reproducible isolated concurrency checks

```sh
npm --prefix backend test -- convex/concurrency.test.ts
```

- 40 synthetic authenticated humans join concurrently and form 20 distinct human/human rooms.
- Each room receives only its two participants' messages. Another room rejects the caller.
- All 40 participants can vote. Correct guesses award 100 points each; repeated settlement does not award points twice.
- 40 separate human/AI rooms each receive a response through the actual bot scheduling/SDK path, using a stubbed provider. Message IDs and pending turns remain room-specific.

These tests prove functional concurrency in the isolated Convex test runtime.
They are not a measured production throughput or latency guarantee for 40 live
Mubit requests. Live capacity also depends on Convex concurrency and Mubit
account/model quotas; no shared production quota or backend configuration was
changed for this test.

## Verification environment

Checks ran with temporary Node 22.23.4 and project-local dependencies. Nix is
not installed on the testing Mac; the repository's Nix files are unchanged.
Browser checks use Chromium viewport overrides, not a physical iPhone/Safari.
Physical keyboard, Safari toolbar behavior and real-device performance still
need confirmation on the owner's phone.

## Live development-backend check (2026-10-25)

Two independent anonymous browser sessions, isolated by local web origins, joined
one strict 1v1 room on the existing development backend. Each received the
other's invented test message. Both submitted Human, both were revealed Human,
and each received 100 points. Reload preserved the same player and score.
A third independent solo session received an opening reply and a reply to an
invented follow-up; its eventual reveal identified the opponent as AI. Feedback
opt-in remained off. No transcripts, session tokens, participant identifiers or
provider credentials are stored in this report.

This live check preceded the newer versioned terms and one-minute timing changes
on the shared integration branch. Those changes are preserved in the rebased
source and checked locally; the historical check is not a fresh acceptance of
new terms.

The 40-room AI result above remains simulated; this live check does not establish
40 simultaneous paid-model replies, provider quota headroom, or production latency.
