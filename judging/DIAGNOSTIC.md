# Mubit diagnostic: what is proved and what remains unproved

Observed 25 October 2026. **The evidence supports an unresolved Mubit-side
training/serving dependency. It does not prove an internal vendor bug, that a
new adapter would be good, or that a trained adapter has answered the game.**

## Evidence by boundary

| Boundary | Evidence | What it establishes |
| --- | --- | --- |
| Game → Mubit → model reply | Earlier hosted chat/vote/reveal checks, real gateway request receipts, and the console's provider attribution. [Integration report](../INTEGRATION.md). | The deployed game can call Mubit and use replies. It is currently provider inference, not verified trained-adapter inference. |
| Corrected data → Mubit | 33 new synthetic conversations and eight corrective follow-ups; 31 Good and 10 Bad ratings saved and checked against the visible request/reply. The task's kept count rose from 43 to 74. | The refresh data reached the intended task and the approved targets were counted. These are not the size or contents of a new training dataset. |
| Compatible model output → working game | Two local integration tests use synthetic provider and Qwen model labels, run the actual bot scheduling/publication path, preserve the request receipt, and complete voting/reveal with 100 points. | Conditional compatibility with a standard completion response. These tests do not call a real model or prove adapter availability, quality or latency. |
| Kept examples → new training → serving | The console still reports Reviewing examples and No version answers. No new training job or fresh adapter answer has been verified. | This is the unresolved boundary; neither a saved rating nor a passing local test completes it. |

The [content-free refresh summary](evidence/mubit-refresh.json) records the
observations and source hashes. It is a maintainer summary, not an independent
Mubit attestation. Raw prompts, replies, screenshots and rating receipts remain
in ignored local artifacts.

## Configuration checks

- The refresh retained the original system-prompt fingerprint and model ID.
  Mubit grouped the visible requests into task `ln_e39d1394f50cee0a22baa0e9`.
- The 41 rated records are all synthetic training candidates or their
  corrections. None is a held-out evaluation case. All 31 approved targets
  meet the 3–12-word, 80-character and plain-punctuation checks.
- One separate evaluation call used recording off. The fresh cloud-rental
  demo question remains unsent and outside training.
- Settings show a new version after 25 new examples, no daily training limit
  and no task overrides. The pass bar was not changed.
- A further recorded, non-held-out call was made after the first 30 approvals
  and rated Good. This exercises the documented request path; it is not a
  verified manual training-job submission.

Keeping `gpt-6-luna` in the application's request is intentional: Mubit says to
[keep the original model IDs](https://docs.mubit.ai/guides/model-ids), and does
not provide an adapter model ID to substitute. Its
[public API reference](https://docs.mubit.ai/reference/api) describes provider
calls, not a public training-job control endpoint. We found no manual train or
re-evaluate action in the inspected hosted controls.

## Reproduce the conditional integration proof

```sh
nix develop -c npm --prefix backend run check
nix develop -c npm --prefix backend test -- --maxWorkers=1 -t 'Mubit response contract'
```

The tests live in [bots.test.ts](../backend/convex/bots.test.ts). Both response
labels follow the same path; the request still goes to the Mubit URL under the
original model ID. The tests also ensure that an arbitrary returned model name
does not become a claim of serving provenance.

Run the [full local check command](../JUDGING.md#review-in-five-minutes) for the
broader game, fixture, asset and build checks. All model/network effects in the
local tests are mocked.

## Important practical limits

The game gives each inference attempt 10 seconds. A genuinely served adapter
must be tested against that deadline and the one-minute round, including cold
starts. The contract tests establish neither real adapter latency nor successful
warm-up. See [botTiming.ts](../backend/convex/botTiming.ts).

The existing v1 also had a real quality weakness: only 2 of its 12 held-out
answers met the short-reply constraints. Its literal-answer grading problem
does not establish that the model was otherwise good. See the
[training report](../MUBIT_TRAINING_RUN.md).

The next decisive evidence is a new job/version tied to the kept data, followed
by an independently held-out answer with adapter/version provenance. Mubit needs
to explain the missing retraining step or expose supported diagnostic inference;
we should not claim that disabling checks or substituting a provider reply proves
the learning loop.
