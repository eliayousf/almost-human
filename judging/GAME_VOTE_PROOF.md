# Game vote → Mubit feedback: controlled live proof

**25 October 2026, checked through 07:06 UTC.** Two synthetic game rounds
produced real Mubit calls and real stored ballots. Their derived Bad/Good
ratings were saved through Mubit's console and verified after reopening.
The positive request explicitly reports **Trainable: yes**, and the game's
task then showed **82 kept examples, up from 81**.

This is a bounded, operator-reviewed proof. It is not a blind human study,
unattended feedback submission, a newly completed training job or an adapter
answering the game. Public-player uploads and the experimental cookie bridge
remain disabled. Both single-round capture grants were revoked and verified
ineligible afterwards.

## Evidence chain

| Step | Observed result | Boundary |
| --- | --- | --- |
| Permission | Each new synthetic player explicitly granted separate chat-training permission before matchmaking. | Standard vote terms alone cannot grant it. |
| Capture | One internal grant per round permitted only turn zero, with expiry by chat end. Real requests and replies appeared in the intended Mubit task. | At most two HTTP attempts per granted turn; no other room's prompt lessons were included. |
| Negative control | The first reply failed the editorial review. Its actual AI ballot generated a pending `down` rating; Mubit persisted Bad. | The poor example was not relabelled Good to make the proof pass. |
| Positive candidate | A clearer brevity instruction produced a relevant five-word, 32-character reply. Its actual Human ballot generated a pending `up` rating; Mubit persisted Good. | An operator chose the synthetic vote after reviewing the reply. This is pipeline validation, not measured player preference. |
| Training eligibility | The positive request reports `Trainable: yes`. The task showed 81 kept before positive feedback and 82 afterwards. | Trainability is directly observed; exact kept dataset-row membership is inferred from the isolated count change because no row manifest was exposed. |
| Serving | The task still showed “Reviewing examples” and “No version answers.” | No new trained-adapter answer or quality gain is claimed. |

The backend's automatic `mubitRating: sent` field was not fabricated: the
submission happened through the console, so the local automatic-sender count
remains zero. Manual submission receipts are stored separately.

## Content-free identifiers

Project: `ws-c1ceb04caf9a7083`.
Task: `ln_e39d1394f50cee0a22baa0e9`.

| Case | Gateway request ID recorded by game | Console request ID | Game vote → saved rating |
| --- | --- | --- | --- |
| Negative | `mreq_01a171da167c7921806dc49bffb4d150` | `01a171da-168c-79a0-be7b-e5929075c26e` | AI → Bad |
| Positive | `mreq_01a171dc457c7110b4ebc820cc3fafe2` | `01a171dc-4887-7aa3-bf64-1dbdc8376099` | Human → Good |

The console uses a different request ID from the gateway. The association was
checked against the exact synthetic user message and reply, task and time;
the gateway ID independently comes from the server's published bot-call row.
Raw conversations, player/round IDs, console screenshots and receipts remain
in ignored `artifacts/game-vote-proof-20261025/`.

## Main-game regression checks

The control did not alter game timing, scoring, prompts for ordinary rooms,
frontend screens or service credentials. An ordinary non-captured live bot
round completed: 100 points for a correct AI guess, a 9,041 ms typing pause,
and 97 ms from vote submission to reveal. A further ordinary metadata-only
call worked after the ratings were saved; it did not add a training candidate.

Local verification covers 158 backend/client tests, 20 Python tests, shared
fixtures, types, asset checks and frontend/diagnostic builds. The local suite
mocks service calls; the live observations above are separate.

## Reproducing this safely

Use [the bounded operator procedure](../MODEL_LEARNING_ACTIVATION.md#bounded-proof-without-a-console-credential).
Keep automatic external ratings off. Use a new invented conversation, a named
synthetic player with pre-round permission, one expiring internal grant, and an
independently reviewed game vote. Inspect and reopen the saved console rating,
then check kept data separately. Revoke the grant, preserve failed candidates
and never retry by resetting a ledger or duplicating accepted examples.

Mubit documents [Good/Bad in the console](https://docs.mubit.ai/guides/requests),
[recording controls](https://docs.mubit.ai/reference/api), and
[session grouping](https://docs.mubit.ai/guides/tasks-and-sessions).
A supported scoped feedback API and end-to-end operational validation are still
needed before enabling unattended public-player training uploads.
