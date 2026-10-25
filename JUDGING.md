# Almost Human: judging guide

**Review this branch's README and this guide first.** The submission is a real
multiplayer game backend plus a verified synthetic Mubit training experiment.
**The trained adapter cannot currently serve a fresh live answer.** This package
documents that blocker; it does not claim all four criteria are satisfied.

Almost Human is a disclosed human-or-AI guessing game. Its proposed recurring
task is generating short, natural NPC dialogue for game developers, with play
testing providing feedback. That developer benefit is a hypothesis, not a
validated customer result.

## Review in five minutes

1. Read the four-criterion table below.
2. Inspect the [sanitised Mubit snapshot](judging/evidence/mubit-run.json) and
   [evidence boundaries](judging/EVIDENCE.md).
3. Run the credential-free verification command. Compare the new result with
   the [recorded local check receipt](judging/evidence/checks.json).
4. Follow the [demo runbook](judging/DEMO.md) for the diagnostic client and
   honest 2:20 walkthrough. No verified public frontend URL is claimed here.

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

Run from the repository root. Nix and npm may download pinned dependencies;
the verification steps themselves use mocked services and a network-call guard.
They do not need Mubit/Convex credentials, deploy services or launch training.
After the first locked install, omit `--install` for a faster repeat. `.envrc`
contains `use flake` for direnv users.

## Four criteria, equally weighted

| Criterion | Evidence available now | What is not established |
| --- | --- | --- |
| **Use of Mubit — 25%** | Real gateway calls; a reviewed conversational correction; 36 kept synthetic examples from 36 sessions; completed Qwen3-4B training job and v1 evaluation. [Snapshot](judging/evidence/mubit-run.json), [run report](MUBIT_TRAINING_RUN.md), [runner](scripts/mubit-learning-proof.py). | Fresh live trained-adapter answer; improved quality; automatic learning from real players; a replacement-target API. |
| **Usefulness — 25%** | Implemented recurring dialogue generation and game feedback collection. [User/job rationale and validation protocol](judging/USEFULNESS.md), [bot behavior](backend/BOTS.md). | Customer demand, retention, willingness to pay, or measured improvement in the player experience. |
| **Technical execution — 25%** | Reproducible TypeScript, backend/client tests, experiment tests, two diagnostic builds and shared-contract checks. [Check receipt](judging/evidence/checks.json), [historical live verification](backend/VERIFICATION.md). | Current production readiness, comprehensive moderation, physical-iPhone verification, or the newest frontend's live integration. |
| **Demo — 25%** | Runnable diagnostic clients, synthetic screen fixtures, a timed walkthrough, and a precise failure explanation. [Runbook](judging/DEMO.md), [fixtures](shared/fixtures.ts). | A completed timed rehearsal of this exact branch, the event's confirmed time limit, or an end-to-end live learned-model demo. |

Machine-readable mapping: [criteria.json](judging/evidence/criteria.json).
Statuses describe evidence coverage; they are not self-awarded judging scores.

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

This guide and checks apply to the checkout that contains them. Record
`git rev-parse HEAD` when presenting. The implementation is proposed in
[PR #4](https://github.com/eliayousf/almost-human/pull/4), stacked on the earlier
learning-proof work; a judge opening `main` may see older code.

This branch contains `backend/playtest/`, not Cash's public `frontend/`.
The separately reviewed frontend branch was a fixture preview and is not
implicitly certified by these checks. Earlier verification documents retain
their dates and historical test counts; the current receipt is authoritative
for the checks run here.
