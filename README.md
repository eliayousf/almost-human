# Almost Human

*One minute. One stranger. Human or machine?*

**[Play the game](https://almost-human-playtest.vercel.app/) · [Judging evidence](JUDGING.md) · [Two-minute video plan](judging/DEMO.md)**

<p>
  <img src="frontend/expo/assets/cast/loops/face25-04-idle.webp" width="96" alt="Animated portrait from the game's shared character cast" />
  <img src="frontend/expo/assets/cast/loops/face25-05-smile.webp" width="96" alt="Smiling portrait from the game's shared character cast" />
  <img src="frontend/expo/assets/cast/loops/face25-09-idle.webp" width="96" alt="Another animated portrait from the game's shared character cast" />
</p>

**Natural-sounding speech still needs natural conversation.** Almost Human uses
a one-minute human-or-AI guessing game to collect feedback on conversational
replies. Our goal is to help **voice-agent builders** train faster, more natural
dialogue models with Mubit.

Chat with an anonymous partner for one minute, decide whether they are human
or AI, then see the reveal and your score.
People and AI use the same character cast; portraits do not disclose their roles.

The recurring task is **generating short, natural replies that respond to the
current conversation**. The game makes repeated dialogue testing engaging and
supplies a perceived-human-likeness signal for selecting examples to review.
The current product is **text-only**: voice integration, better spoken dialogue,
lower latency and customer demand have not yet been demonstrated.

Canonical release: [GitHub main and the main playtest](RELEASE.md).

## Judging at a glance

| Criterion | What to inspect | Evidence and boundary |
| --- | --- | --- |
| **Use of Mubit · 25%** | Accepted conversational correction → completed adapter v1 | Adapter training completed. Game-vote feedback was accepted as trainable. Fresh adapter verification is pending amid reported Mubit capacity issues. |
| **Usefulness · 25%** | Conversational examples and feedback aimed at improving the words voice agents say | [User/task rationale](judging/USEFULNESS.md). Text-game collection is implemented; voice deployment, demand, quality and speed gains are unverified. |
| **Technical execution · 25%** | Live game, private rooms, authoritative scoring and reproducible tests | [Hosted checks](INTEGRATION.md) and [local check receipt](judging/evidence/checks.json). Local mocks are labelled; they do not prove live adapter inference. |
| **Demo · 25%** | Real game interaction plus recorded correction/training evidence | [Sub-two-minute walkthrough](judging/DEMO.md). The final recording still needs validation and upload. |

**Recorded validation:** 158 backend/client tests, 20 Python checks, all 100 WebP
assets, TypeScript and frontend/diagnostic builds. The command below reproduces
the checks and writes a new result with its own source fingerprint.
These checks cover the text game and its tooling, not spoken-audio quality or speed.

**Machine-readable evidence:** [rubric map](judging/evidence/criteria.json) ·
[Mubit training snapshot](judging/evidence/mubit-run.json) ·
[refresh audit](judging/evidence/mubit-refresh.json) ·
[verification receipt](judging/evidence/checks.json).
Each summary states its evidence scope and limitations; no judging score is self-awarded.

## What the demo shows

The submission walkthrough focuses on these verified behaviors and recorded
training results; the final video file must still be checked before upload.

1. **A real game round:** a shared question, conversation, Human/Machine vote,
   server-controlled reveal and points. A round may already be in progress when
   recording starts; the normal chat duration is 60 seconds. This demonstrates
   the text-based collection interface, not a deployed voice agent.
2. **A recorded Mubit training experiment:** an original synthetic reply,
   editorial correction, approval of the corrected conversation, and a completed
   adapter version. Training happened before the recording.
3. **The current boundary:** the deployed game works through Mubit, while the
   trained adapter remains unavailable for live inference. The video does not
   present provider replies as learned-adapter answers.

## What we built with Mubit

All game-model calls go through Mubit's gateway. Credentials stay on the server,
and request IDs link bot replies to their service receipts.

| Step | Verified result |
| --- | --- |
| Generate and correct | A synthetic reply received conversational editorial feedback; the revised conversation was saved and rated Good in Mubit. |
| Train a model update | Mubit kept 36 synthetic examples and completed Qwen3-4B adapter v1. [Training evidence](MUBIT_TRAINING_RUN.md). |
| Refresh the examples | A further reviewed batch and trigger example received 31 Good and 10 Bad ratings; the observed task count rose from 43 to 74 kept examples. [Refresh evidence](judging/evidence/mubit-refresh.json). |
| Serve the trained model | **Blocked:** v1 failed its evaluation and is marked Prompt only. No fresh trained-adapter answer or quality improvement is established. |

**Live game-vote proof:** two consented synthetic rounds produced stored votes
and matching Bad/Good ratings saved through the Mubit console. The task's kept
count rose from 81 to 82; the positive request shows **Trainable: yes**. This is a console-mediated
proof, not unattended learning or a fresh adapter answer.
[Evidence and limits](judging/GAME_VOTE_PROOF.md).

The game also uses eligible votes to identify passed/caught **bot-written** lines
for optional prompt lessons. That prompt-feedback path is separate from the
recorded adapter-training experiment. We do not claim that live player votes
already update the model weights serving the game.

## From game feedback to voice-agent dialogue

A Human vote for an AI partner is a **conversation-level believability signal**,
not proof that every reply is correct, useful or safe. The intended training
pipeline combines these signals with review of context, relevance, brevity,
safety and suitability for speech. Texting shortcuts and game-specific bluffing
would need filtering before use in ordinary voice agents.

Faster responses are a goal to benchmark, not a measured result. The game's
deliberate 6–12-second display pause is separate from model inference latency.
Voice validation would compare unseen conversations with a fixed speech system
and measure both reply quality and end-to-end response time.

Reviewed human-written replies could become another source of training targets
in future, with separate permission, personal-data filtering and provenance.
A separate optional transcript-training permission is implemented in the
[terms controls](PLAYTEST_TERMS.md); ordinary vote feedback never grants it.
External captures/ratings remain disabled. Selecting and importing human-written
replies as supervised targets is still future work. The completed Mubit experiment
used synthetic game conversations.

The [diagnostic report](judging/DIAGNOSTIC.md) separates verified
application behavior from the unresolved Mubit training/serving step.

## Working game features

- Anonymous 1v1 matchmaking with human or Mubit-powered AI partners.
- 60-second chat; up to 10 seconds to vote; immediate reveal when all humans vote.
- 289 question starters/combinations, excluding each player's last 20 questions.
- 25 animated character sets, responsive phone/laptop layouts and slower bot reply pacing.
- Server-scored points, private ballots, refresh recovery, replay, Leave, Block and Report.
- Versioned [playtest terms](PLAYTEST_TERMS.md) explaining vote-based bot feedback.

This is a development playtest. Use invented, nonpersonal messages. Physical-device
coverage, comprehensive public-launch safeguards and model-quality validation
remain limited; see the [revision-specific integration evidence](INTEGRATION.md).

## Reproduce the checks

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

The repository includes a pinned `flake.nix` and `.envrc` with `use flake`.
The command installs locked dependencies and runs local tests, fixtures, asset
checks and builds. The verification steps use mocked services and a network guard;
they require no Mubit or Convex credentials and do not train or deploy anything.
After the first install, omit `--install` for a faster repeat.

The [check receipt](judging/evidence/checks.json) identifies the checked source,
content fingerprint and actual results. Passing local checks are not proof of
remote adapter serving. The two Mubit response-contract tests are explicitly
mocked; they are not a substitute for a real adapter answer.

## Source and development

Judges should use this repository's **default `main` branch** and the main
playtest URL above. The submission instructions freeze judged source at 08:00
London time on 25 October 2026. The video is MP4/MOV, at most two minutes and
300 MB; see the [submission checklist](judging/SUBMISSION.md).

The active interface is [Expo web](frontend/expo/README.md), backed by
[Convex](backend/README.md) and the [shared contract](shared/game-contract.ts).
The older Vite and diagnostic clients remain as implementation history and
reproduction tools. [TEAM_BRIEF.md](TEAM_BRIEF.md) and
[CASH_HANDOFF.md](CASH_HANDOFF.md) contain the earlier team handoff.

For temporary tooling, use `nix shell nixpkgs#<package> -c <command>` rather than
a global install. Raw conversations, model artifacts and credentials are excluded
from Git; published evidence contains only the allowlisted summaries.
