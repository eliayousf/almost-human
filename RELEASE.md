# Canonical Almost Human release

- **Code:** [GitHub `main`](https://github.com/eliayousf/almost-human/tree/main).
- **Playtest:** [almost-human-playtest.vercel.app](https://almost-human-playtest.vercel.app/).
- **Backend:** the existing `original-buzzard-860.eu-west-1.convex.cloud` deployment.

Use those two public links for submission and shared testing. Feature branches,
immutable Vercel previews and the earlier frontend fork are review snapshots.
Vercel builds `frontend/expo` from `main`; it does not deploy Convex functions.
A backend change must be deployed to the named existing backend before its
matching frontend is released. Credentials and player data never belong in Git.

## Bounded training-capture proof — 25 October 2026

The [game-vote proof](judging/GAME_VOTE_PROOF.md) adds an internal, expiring
one-turn capture grant for a named consented test player. Both demonstration
grants were revoked; public-player uploads and automatic external ratings remain
off. The UI and ordinary game behavior are unchanged. Current verification
is **158 backend/client tests and 20 Python tests**; the earlier release below
retains its historical counts.

## PR #8 and PR #11 release review — 25 October 2026

[PR #8](https://github.com/eliayousf/almost-human/pull/8) adds separate optional
transcript-training permission and metadata-only inference recording by default.
[PR #11](https://github.com/eliayousf/almost-human/pull/11) adds private, expiring
typing indicators. The combined changes retain one-minute rounds, immediate
reveal after all human votes, existing scoring, result animations, animated faces
and the mobile/Safari layout.

Review fixes before release:

- Recheck chat-training permission before each inference attempt, including retries.
- Preserve the requested **6–12-second** bot display pause; the original PR's
  one-second minimum is not shipped. Longer replies retain their full pause.
- Remove request `metadata`: the live provider returned HTTP 400 because that
  parameter requires provider-side `store`. Use Mubit's documented grouping by
  a stable first user message containing the opaque round ID instead. No extra
  provider storage is enabled. A paired synthetic diagnostic confirmed the
  rejected shape returned 400 and the shape without metadata returned 200.
- Resolve conflicts with current main while preserving the result animations
  and both features' shared contracts. New database fields remain optional for
  existing records; older frontends remain compatible.

## Verification and limits

The guarded local suite passes **155 backend/client tests and 20 Python tests**,
TypeScript, nine shared round fixtures, both diagnostic bundles, the retained
Vite build, all 100 cast assets, Expo checks and web export. Reproduce it with:

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

The [source-fingerprinted receipt](judging/evidence/checks.json) identifies the
checked tree. Tests cover consent defaults/withdrawal, retry recording, session
grouping, authorization, typing expiry/cleanup, pacing, deadlines and scoring.
Service calls in that suite are mocked.

Live checks use new synthetic QA players and invented messages. The human pair
verified realtime typing delivery, clearing on send, rejection of mid-round
training opt-in, final-vote reveal and 100-point scoring. Browser checks cover
375×600 and 1440×900: typing bubble and composer visible, no horizontal overflow.
The initial bot check caught the HTTP 400 above; it was held from the frontend
release and corrected before repeating the bot check. The final live Mubit bot
round passed: its typing pause was **6,941 ms**, a correct AI vote earned
**100 points**, and vote-to-reveal took **114 ms** in that sample. These are
synthetic release checks, not a latency benchmark or trained-adapter proof.
Raw local checks remain
under ignored `artifacts/pr-8-11-review/`; no player transcripts are published.

**External training remains disabled.** The deployed operator query reports
ratings off, no console credential, and no configured project. Standard vote
feedback does not grant transcript-training permission. The optional permission
control alone does not upload examples or activate learning. The recorded
synthetic training experiment and [Mubit serving blocker](MUBIT_TRAINING_RUN.md)
remain unchanged. Session grouping is implemented using the documented fallback;
remote training-set inclusion is not established by these release checks.

Physical-device Safari, production-scale load and fresh trained-adapter inference
are not established by this review.

## Future releases and rollback

Review and test PRs against current main, deploy compatible additive backend
changes, merge only the tested heads, then verify the main alias resolves to the
resulting main commit and the anonymous entry page loads. Keep failed branches
out of the main release; do not promote an unrelated preview.

For an incident, restore the last known-good frontend deployment and revert the
faulty runtime change through a reviewed commit. Keep additive optional schema
fields while disabling features so existing documents continue to validate.
Do not reset player scores, replace the backend, enable training or change
access controls as part of a frontend rollback.
