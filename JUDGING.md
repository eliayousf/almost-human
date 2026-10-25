# Almost Human: judging guide

**Start with the [live game](https://almost-human-playtest.vercel.app/) and
[GitHub main](https://github.com/eliayousf/almost-human/tree/main).** This guide
is the submission entry point. The submission is a real
multiplayer game backend plus a verified synthetic Mubit training experiment.
**The trained adapter cannot currently serve a fresh live answer.** This package
documents that blocker; it does not claim all four criteria are satisfied.

Almost Human is a disclosed human-or-AI guessing game used as a text-based
conversation and feedback collection prototype. Its intended users are
**voice-agent builders**: natural-sounding audio can still be paired with
awkward wording. The recurring task is generating short, contextual dialogue;
the goal is to train models that produce better wording with lower latency.
The current product has no voice integration, and neither quality gains nor
speed gains have been demonstrated.

A Human vote measures perceived human-likeness of the conversation, not the
correctness or quality of every line. Human-authored training targets remain
future work requiring filtering and editorial review. Separate optional
transcript-training permission is implemented, but external captures/ratings
remain disabled; the synthetic experiment does not establish that capability.

The released Expo interface includes 25 animated characters, 60-second chat,
up to 10 seconds to vote, immediate reveal when all humans have voted, and
6–12 second bot reply pauses after generation, with private typing indicators.
[Release checks and canonical links](RELEASE.md) cover PRs #8 and #11.
Each round gets one shared
question from 289 starters/combinations, excluding each player's last 20.
Vote feedback is included in the [versioned playtest terms](PLAYTEST_TERMS.md).
The live game's replies use provider inference through Mubit.

The team's organizer instructions confirm a **two-minute video limit**, **300 MB maximum**,
and **08:00 London-time submission/code cutoff** on 25 October 2026. Judges read
`main`, the README and the uploaded video. See [submission details](judging/SUBMISSION.md).

## Review in five minutes

1. Read the four-criterion table below.
2. Inspect the [sanitised Mubit snapshot](judging/evidence/mubit-run.json) and
   [evidence boundaries](judging/EVIDENCE.md).
3. Run the credential-free verification command. Compare the new result with
   the [recorded local check receipt](judging/evidence/checks.json).
4. Follow the [demo runbook](judging/DEMO.md) for the main game and
   honest sub-two-minute walkthrough. The [integration report](INTEGRATION.md) identifies
   the current [main playtest](https://almost-human-playtest.vercel.app/) and
   the source revisions covered by earlier live checks.

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

Run from the repository root. Nix and npm may download pinned dependencies;
the verification steps themselves use mocked services and a network-call guard.
They do not need Mubit/Convex credentials, deploy services or launch training.
After the first locked install, omit `--install` for a faster repeat. `.envrc`
contains `use flake` for direnv users.

## Four criteria, equally weighted

The [organizer's event page](https://luma.com/nightshift-london), checked on
25 October 2026, confirms these four criteria and equal weighting.

| Criterion | Evidence available now | What is not established |
| --- | --- | --- |
| **Use of Mubit — 25%** | Real gateway calls; a reviewed conversational correction; 36 kept synthetic examples from 36 sessions; completed Qwen3-4B training job and v1 evaluation. [Snapshot](judging/evidence/mubit-run.json), [run report](MUBIT_TRAINING_RUN.md), [runner](scripts/mubit-learning-proof.py). | Fresh live trained-adapter answer; improved quality; automatic learning from real players; a replacement-target API. |
| **Usefulness — 25%** | Implemented text-dialogue generation and believability-feedback collection, aimed at improving voice-agent wording. [User/job rationale and validation protocol](judging/USEFULNESS.md), [bot behavior](backend/BOTS.md). | Voice-agent deployment, customer demand, spoken-dialogue improvement, latency gains or human-authored training-target ingestion. |
| **Technical execution — 25%** | Released Expo game, all 100 WebP assets checked, verified hosted chat/vote/reveal and replay, plus reproducible backend/client tests and builds. [Check receipt](judging/evidence/checks.json), [integration evidence](INTEGRATION.md), [responsive layout and concurrency checks](frontend/expo/MOBILE_MULTIPLAYER.md). | Comprehensive moderation, public-launch hardening, measured live concurrency capacity or physical-iPhone verification. |
| **Demo — 25%** | Public main playtest, earlier verified live rounds, diagnostic clients, labelled fixtures, a proposed timed walkthrough and a precise learning-blocker explanation. [Runbook](judging/DEMO.md), [integration report](INTEGRATION.md). | A timed presentation rehearsal or a live learned-model demo. |

Machine-readable mapping: [criteria.json](judging/evidence/criteria.json).
Statuses describe evidence coverage; they are not self-awarded judging scores.

For the boundary between working application code and the unresolved Mubit
workflow, see the [diagnostic evidence and conditional contract tests](judging/DIAGNOSTIC.md).

## Automated review

The public event page does not specify AI judge models, tools or access. This
package does not assume a particular judging agent. The live URL, source,
criterion-to-evidence JSON and verification command are independently readable.
Local checks need no account or service credentials. Live play requires the
game's adult eligibility declaration and terms acceptance; those are not needed
to inspect the code or run the offline checks.

## The Mubit result, without overclaiming

The hosted editor has Good/Bad and Comment, with no replacement-answer control.
We sent editorial feedback as the next user turn, captured the revised answer,
and approved that corrected **conversation**. The separate `feedback.correction`
field remains null. The instructions stayed unchanged and prompt lessons were off.

Mubit kept 36 examples and completed job `ftjob_e8f8c638`, producing
`ad_lane_b5f70965` v1 on `Qwen/Qwen3-4B-Instruct-2507`. Its evaluation has
12 literal `contains` checks requiring whole provider sentences. Both the
adapter and base scored 0/12, with no semantic judging. The console marks v1
`rules_only`, with no serving route, and disables Try it as prompt only.

There is also a genuine model problem: only **2/12 adapter replies** met both
the 3–12-word and 80-character limits (base 3/12; provider references 12/12).
The grading mismatch does not prove the adapter is good. Internal held-out
responses are not a new live demo question, and a provider fallback is not an
adapter response.

The corrected trace is outside the 12 held-out IDs. Its training membership is
supported by the source counts, dataset lineage and lack of recorded exclusions,
but the complete dataset-row manifest was not exposed. **Exact row membership
is inferred, not directly read.**

Next: obtain a supported dialogue/reference evaluation and re-evaluation path
from Mubit, improve brevity and relevance as needed, and then verify a fresh
version-pinned adapter response. No pass bar or rollout policy was weakened.

## What the verification command proves

It exits nonzero on a failed step and saves full logs only under ignored
`artifacts/judging-checks/`. Its sanitised summary names the source commit,
content fingerprint, runtime, step outcomes and actual test counts.

The public snapshot is an allowlisted maintainer summary of service observations
on **25 October 2026**, not an independently signed Mubit attestation. A passing
local check confirms code behavior and evidence consistency; it cannot establish
current service availability or turn the serving blocker into a pass.

The diagnostic build made by the check command uses an inert backend address.
Rebuild with the explicit live configuration in the runbook before a live demo.

## Source and branch scope

The judging source is [GitHub main](https://github.com/eliayousf/almost-human/tree/main).
[PR #5](https://github.com/eliayousf/almost-human/pull/5) brings together the
game, Mubit experiment, frontend and judging package while preserving their
commit history. [PR #4](https://github.com/eliayousf/almost-human/pull/4) records
the earlier training/evidence work. Record `git rev-parse HEAD` when presenting.
The check receipt names the checked source commit and content fingerprint;
the [integration report](INTEGRATION.md) separately records hosted observations.

The repository contains Ayo's `frontend/` and the diagnostic clients.
The check command builds the player frontend in live mode against an inert URL;
that build alone does not prove a live round. See [INTEGRATION.md](INTEGRATION.md)
for deployment and browser evidence. Earlier verification documents retain
their dates and historical test counts; the current receipt is authoritative
for the checks run here.
