# Usefulness: the recurring job and the missing validation

## Proposed user and job

A small game team repeatedly needs short NPC replies that respond to the
conversation, stay in character and fit its interaction limits. Almost Human
provides a play-testing environment: people chat with disclosed possible AI
partners and vote at the reveal. The backend records opted-in feedback and
can place earlier bot lines in subsequent prompts.

Implemented evidence: [bot generation](../backend/convex/bots.ts),
[fixed prompt and per-turn context](../backend/convex/botlogic.ts),
[opted-in verdict aggregation](../backend/convex/ratings.ts), and
[game/client tests](../backend/convex/game.test.ts).

The completed training experiment used **authored synthetic conversations and
assistant editorial review for the project owner**. It was not a user study,
and it does not prove that ordinary player votes train the deployed game.

## What would count as useful

| Question | Measurement to collect | Current evidence |
| --- | --- | --- |
| Do developers want this repeated task handled? | Interview target game developers; record their existing workflow, review time and repeated dialogue problems. | Not collected. No customer or demand claim. |
| Are replies better for players? | Blind comparison on unseen conversations; relevance, naturalness, safety and short-reply compliance scored separately. Report sample size and wins/ties/losses. | No external player study. Current adapter length compliance is 2/12 on its internal held-out cases. |
| Does it reduce editorial work? | Time to approve a fixed number of comparable replies, with the same review rubric. | Not measured. |
| Is the game replayable? | Consented real-user completion, replay and abandonment rates, with denominators. | Game flow implemented; no retention result claimed. |
| Does adaptation improve cost or latency? | Compare the same inputs and serving provenance, keeping provider, base and adapter distinct. Include cold starts and failures. | No end-to-end savings result established. |

## Small validation protocol

Freeze unseen evaluation conversations before the next training run. Keep them
out of training and turn prompt lessons off. Give reviewers anonymised answers
in random order, using the same relevance, naturalness, length and safety rubric.
Report failures as well as successes. Do not tune on the test cases or infer
adapter improvement from changed prompts or different audiences.

Player votes about who seemed human measure believability. They do not alone
measure usefulness, safety or learning in model weights. The intended benefit
is worth testing; it has not been established by the current experiment.
