# Almost Human training run — 25 October 2026

**A conversational correction was accepted and training completed. A fresh live
adapter answer remains blocked. Do not present this as a working deployed
learning loop or a quality improvement.**

## What was exercised

- The actual game prompt was frozen with prompt lessons disabled. A synthetic
  provider answer received editorial feedback in a subsequent user turn. The
  revised answer was captured through Mubit and explicitly rated Good in the
  signed-in console. No browser credential was extracted.
- This is conversational correction, not an API that overwrites a stored
  response: the trace's separate `feedback.correction` remains null.
- Forty additional distinct synthetic candidates were captured and reviewed:
  35 approved and five rejected. Each browser rating was checked against its
  server trace, gateway request ID, exact input and output. The corrected call
  brings the accepted total to **36 examples from 36 sessions**.
- Mubit counted those 36 kept examples and submitted the first training job.
  It moved from queued to running to completed. Its evaluation contains real,
  distinct adapter and base-model outputs on 12 held-out questions.

| Evidence | Identifier |
| --- | --- |
| Task | `ln_e39d1394f50cee0a22baa0e9` |
| Task fingerprint | `lk1_9d19f4d075e8120beb295d91bc6f6975` |
| Corrected trace | `01a170a6-21e6-74e0-b002-5073e43c47bc` |
| Dataset | `ds_lane_50a5b7cc` |
| Completed training job | `ftjob_e8f8c638` |
| Adapter/version | `ad_lane_b5f70965`, v1 |
| Base model | `Qwen/Qwen3-4B-Instruct-2507` |
| Version created | 2026-10-25 01:36:31 UTC |

The corrected trace is absent from the 12 held-out trace IDs. Together with the
36 kept examples, matching dataset ID and zero recorded policy exclusions, this
supports its training lineage. A full dataset-row manifest was not exposed by
the inspected interface; exact row membership is inferred, not directly read.

## Why the live proof is blocked

The generated check set contains **12 `contains` checks**, each requiring the
whole captured provider answer verbatim. No semantic judge ran (`judged: 0`).
Both adapter and untuned base scored 0/12. These checks do not establish the
quality of alternative valid dialogue responses.

Mubit consequently marked v1 `rules_only`; its serving field is null and rollout
is zero. The console disables Try it with `Not in Try models: prompt only`.
No fresh live adapter response was obtained. The 12 training-evaluation outputs
are held-out test evidence, not a new live demo question.

This is not solely a grading problem: an independent mechanical check found
only **2/12 adapter replies** met both the 3–12-word and 80-character limits,
versus 3/12 base replies and 12/12 provider references. Some adapter responses
were repetitive or off-topic. No improvement claim is justified.

`evals.judge` is already `auto`. The exposed task override can select existing
check kinds, but cannot turn `contains` checks into semantic `reference` checks.
Disabling those checks would leave no meaningful test. The judge rubric and
checklist controls are instance-owned, not project-writable. No pass bars,
evaluation policies, rollout settings or shared Convex configuration were changed.

## What is needed next

Mubit support must provide a supported way to regenerate this dialogue task's
checks as judged reference/rubric checks and re-evaluate the completed version,
or provide diagnostic inference for the trained weights without promotion.
Keep the frozen held-out questions out of training. A useful rubric checks
relevance, naturalness, the length limit and safety; it must allow different valid
wording instead of requiring the provider's exact sentence.

After that interface is available, improve the training curriculum for brevity
and relevance, rerun training if necessary, and verify a fresh response from the
actual adapter version with coaching and prompt lessons absent. Do not lower the
quality threshold or claim prompt-only/base inference is trained-adapter serving.

## Reproduction and evidence

The [experiment guide](scripts/learning-proof/README.md) covers the conversational
follow-up and separately bounded training batch. The discovery ledger is intact
at three calls (original, correction, held-out baseline); the batch captured 40
candidates without evaluation leakage or automatic rating.

Fifteen experiment tests passed in the pinned Nix shell (Node 22.22.3 and
Python 3), including provenance, evaluation exclusion, budgets and resume
behavior. `git diff --check` passed. No Convex code changed.

Raw model data, browser evidence, trace records, ratings and evaluation results
remain under ignored `artifacts/learning-proof/` and
`artifacts/learning-training-batch/`. They are intentionally absent from Git.
