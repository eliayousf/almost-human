# Usefulness: better dialogue for voice agents

## Intended user and recurring job

Voice-agent builders repeatedly need concise, contextual wording that sounds
natural when spoken. Good speech synthesis alone does not guarantee a good
conversational response. Almost Human uses an engaging human-or-AI guessing game
as a proposed way to collect examples and feedback for this language-generation
problem.

The goal is a task-specific adapter that produces more natural dialogue with
lower latency. **Neither improvement has been demonstrated.** The current game
is text-only, with no speech recognition, speech synthesis or deployed voice-agent
integration. The completed Mubit training experiment used synthetic game-chat
conversations; it was not a voice benchmark or user study.

This proposal fits modular voice stacks with a separately selectable language
model and speech-synthesis stage; [Vapi documents that architecture](https://docs.vapi.ai/security-and-privacy/data-flow).
That is architectural feasibility, not an implemented integration or a claim of
compatibility with every end-to-end speech model.

## What the game currently measures

Players judge whether their conversation partner was human or AI. A Human vote
for an AI supplies a positive signal about **perceived human-likeness**, not
proof of factual correctness, usefulness, safety or spoken-dialogue quality.
The vote covers the opponent's conversation as a whole. The current backend
associates the seat's verdict with its bot-written lines; this is weak
conversation-level supervision, not an individual quality label for every reply.

Timing, topic and presentation can influence that judgement. The game deliberately
adds a 6–12-second display pause, so a higher Human-vote rate cannot by itself be
attributed to improved wording. Comparisons must control these effects.

Implemented evidence: [reply generation](../backend/convex/bots.ts),
[fixed prompt and per-turn context](../backend/convex/botlogic.ts),
[eligible-vote aggregation](../backend/convex/ratings.ts), and
[game tests](../backend/convex/game.test.ts). Eligible votes can select bot-written
lines for prompt lessons. Automatic player-vote-to-serving-weight improvement
has not been established.

## Intended training-data path

1. Keep conversation context and its believability label together; do not treat
   every line in a successful round as a gold target.
2. Review candidate bot replies for relevance, clarity, brevity and safety.
   Filter texting shortcuts, typos and game-specific identity bluffing before
   treating a reply as an example for ordinary voice agents.
3. Train on reviewed examples and evaluate on separate, frozen conversations.
4. Test the resulting dialogue as speech using a fixed voice system and matched
   conditions, then measure actual generation and end-to-end latency.

The first prototype supports game generation, vote collection and a separate
reviewed synthetic Mubit training experiment. The full voice-data pipeline above
is a proposed next step, not a completed capability.

Human-written player responses could eventually supply supervised context-to-reply
examples. That would require a separate, clearly explained permission workflow,
personal-data filtering, provenance and editorial review. The current
[playtest terms](../PLAYTEST_TERMS.md) explicitly do not authorize importing chat
messages as human-authored training targets, and this pipeline is not implemented.
Earlier opt-outs must not be converted into training permission.

## What would validate the benefit

| Question | Measurement to collect | Current evidence |
| --- | --- | --- |
| Do voice-agent builders want this recurring job handled? | Ask target builders about awkward responses, editing effort and latency constraints; record concrete feedback. | Not collected; no demand claim. |
| Are the words better when spoken? | Blind comparisons on unseen conversations using the same voice and audio settings; score naturalness, relevance, task completion, brevity and safety separately. | No spoken-dialogue study. v1 met the game's short-reply limits on 2/12 internal held-out cases. |
| Do game votes predict voice quality? | Compare conversation-level Human/AI votes with independent spoken-dialogue ratings; hold timing and presentation constant. | Not measured. |
| Is it faster or cheaper? | Compare matched inputs and model provenance; report first-token, full-reply and first-audio latency, cold/warm starts, errors and measured cost. Exclude the game's artificial pause. | No adapter-serving benchmark or savings result. |
| Does the game collect useful feedback repeatedly? | Record real-user completion, replay and abandonment rates with denominators, and review the resulting labels. | Game flow is implemented; no retention or data-quality result is claimed. |

Freeze evaluation conversations before training and exclude them from candidate
capture. Keep prompt lessons off when isolating the effect of trained weights.
Report failures, sample sizes and wins/ties/losses. A completed training job or a
small informal sample does not establish improvement or real-time voice readiness.
