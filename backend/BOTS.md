# Bot participants (PLAN.md stage 2)

Rooms seat two to five participants and randomly contain zero, one, or two AI
participants; every room has at least one human. All bot LLM calls route
through Mubit from the server.

## How it works

- Bot replies have a server-enforced 6–12 second reading/typing pause after
  generation. Longer text takes longer, with up to two seconds of variation.
  The deadline can shorten a longer pause, but never below six seconds; if that
  cannot fit, the reply is dropped rather than rushed into the voting phase.
  Generation time is additional. Two-seat bots still wait for new human input
  after their opener instead of sending a stream of unsolicited messages.
- `convex/botlogic.ts` - pure, unit-tested logic. `chooseLobby` sizes a lobby
  (two to five seats) from the live queue: five or more waiting humans match
  immediately (ten queued players become two five-player games); three or four
  humans wait out `LOBBY_ACCUMULATE_WAIT_MS` (8s) hoping for a fifth; one or
  two wait for `BOT_FALLBACK_WAIT_MS` (26s, just past the 25s presence grace)
  and are then seated with bots so a solo judge can always play. A departed
  player is never seated with bots. `buildBotMessages` builds the prompt each
  bot turn: persona style, difficulty texture, Elia's behaviour calls, and the
  prompt-injection defenses, with only public context (topic, aliases,
  transcript) - never hidden roles, bot counts, or model identity.
- `convex/matchmaking.ts` - block-aware group selection, lobby formation, and
  the rescheduling sweep (`internal.matchmaking.match`) that retries the queue
  after the honest waits elapse.
- `convex/botState.ts` + `convex/bots.ts` - a claim/commit turn protocol around
  the Convex Agent component. `claim` transactionally reserves the next turn
  (duplicate scheduled deliveries cannot issue another paid request), the
  `takeTurn` action calls Mubit once, and `commit` revalidates the phase
  window, seat kind, message caps and moderation before publishing. A watchdog
  (`fail`) cancels the round as `service_unavailable` when a generation is
  lost, blocked, or too late; there is no canned-response fallback.
- `convex/mubitModel.ts` - a text-only AI SDK adapter for the fixed Mubit
  gateway. One capped attempt per call (10s timeout, 384 completion tokens),
  no automatic retries, and upstream bodies, headers and secrets never reach
  errors, telemetry, or the transcript.
- Each bot seat is assigned a random persona (dry/curious/warm) and difficulty
  (easy/medium/hard) that tunes its texture guidance; both are recorded on the
  member row so judged-Human rates can be compared per level later. They never
  appear in client payloads.
- `internal.bots.performance` derives detection analytics from stored ballots:
  rooms, votes, judged-Human/AI counts and fooled rate per persona+difficulty.
  Internal operator view only, never in the public API.
- AI seats get no result rows, no leaderboard entries, and no points, and
  presence checks ignore them. Reports and blocks accept bot seats without
  leaking their role; blocking a bot ends the room. Hidden roles never appear
  in client payloads before the reveal.

## Required deployment configuration

Set the server-only key on the Convex deployment (never in git, never in the
browser):

```sh
npx convex env set MUBIT_API_KEY <project inference key>
npx convex env set MUBIT_BOTS_ENABLED true
```

Without a server key (or with bots disabled) rooms stay all-human.
`backend/convex/_generated/api.d.ts` was extended by hand for the new modules
(codegen needs a deployment login). Re-run `npx convex dev` once signed in so
the generated files come from the real generator.

## Bot personality

The evaluation metric is the proportion of AI participants judged Human, so
prompts aim for believable chat texture (lowercase, contractions, occasional
typo, real opinions). When accused, bots deny it and claim human the way a
real player would, with a rare dry "yeah, you caught me" misdirect mixed in
(no robot gimmicks). They also occasionally voice light suspicion about other
participants to probe how humans respond to being accused (Elia's calls,
within the disclosed-game frame). PLAN.md safeguards still hold: never a
specific real person's identity, no soliciting personal details or contact,
safety above score. Personas and difficulty guidance live in `BOT_PERSONAS`
and `DIFFICULTY_GUIDANCE` in `convex/botlogic.ts`; tune there.
