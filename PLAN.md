# Almost Human: MVP plan

*Three participants. Two minutes. Who's human?*

Proposed plan, 24 October 2026. This document describes intended behaviour;
it is not a claim that the game or training integration already works.

**Owner update, 25 October:** the active Expo interface uses strict 1v1 rooms.
Vote-based bot improvement is included in the playtest terms, enabled on their
acceptance, with no separate feedback toggle. Earlier opted-out votes are not
reused retrospectively. [PLAYTEST_TERMS.md](PLAYTEST_TERMS.md) describes this
implementation. Human-authored training examples remain a separate scope;
the older proposed group flow below is retained as planning history.

For parallel frontend/backend work, use [TEAM_BRIEF.md](TEAM_BRIEF.md) and its
shared contract as the integration agreement. Cash owns `frontend/`; Elia and
Codex own `backend/`.

## Product and scope

Build a social guessing game that people want to replay. The intended useful
by-product is reviewed feedback for improving natural conversational responses.
Human-likeness, helpfulness, and safety are separate measures.

Chosen format: anonymous matchmaking into three-participant group chats. Each
room contains a randomised zero, one, or two AI participants, and therefore at
least one human. No invite code or real name is required. This replaces the
earlier one-to-one, invite-only proposal.

Launch scope: a publicly deployed site. Hackathon attendees and anyone else
online can join the same anonymous queue. No invite gate.

Initial UI should be basic and functional. **cashpointsoulja owns UI/UX.** Keep
the round logic, data, and realtime interfaces independent of presentation so
that the eventual UI can replace the basic views without rewriting the game.
No polished visual direction has been selected.

Players see generated aliases. A server-issued anonymous identity can preserve
scores and blocks without a real-name account. Anonymity to other players does
not mean the server holds no session identifiers or abuse records.

The public repository is source and documentation only. Conversations, reports,
training examples, credentials, and model artifacts stay outside Git.

## Learning gate: validate passive examples and feedback

Current result: [provider connectivity works, but accepted human training targets
and application adapter serving remain unverified](MUBIT_VERIFICATION.md).

The revised game collects human conversation examples and guesses, with no
rewrite task or correction form. Before claiming those data improve a model:

1. Send a small, controlled conversational example through Mubit from a server.
2. Retain its Mubit request receipt and identify its task in the console.
3. Verify the supported way to ingest a reviewed human reply with its preceding
   group-chat context as a training example. Inspect the actual accepted target.
   A captured provider response or a feedback comment does not establish this.
4. Collect enough eligible examples using a fixed task definition and separate
   conversation IDs, then observe a completed adapter training job.
5. Invoke the resulting adapter/version on a fresh conversation and obtain
   serving evidence linking the response to that version.

An existing adapter trained for a different task does not establish this path
for Almost Human. A provider reply, an accepted HTTP request, or a stored vote
is not evidence that the new adapter trained or served a response.

The current public model-ID guide describes trying adapters in the console,
rather than selecting one through the normal model ID. Supported application
access therefore remains a critical integration question.

Separately verify whether Mubit supports using per-bot guesses as a reward or
preference signal. Until then, treat guesses as evaluation metadata. A binary
guess is not a replacement answer or an automatic weight update.

Use a small capped verification batch before sending billable requests.
If application access is
unavailable, record that limitation and resolve it before promising a game that
uses its trained adapter. A console comparison may demonstrate training, but
does not prove in-game use.

## Game loop

1. **Join.** See the rules, adult eligibility, moderation/data notice, and a
   separate optional training choice. Enter the shared matchmaking queue.
2. **Match.** Receive an alias and enter a three-participant room. The server
   randomly chooses zero, one, or two bots and fills the other seats with humans.
   Keep the composition and identities hidden until the reveal.
3. **Countdown.** Once the assigned participants are ready, show a synchronised
   3, 2, 1 countdown. Reveal a randomly selected topic at the end.
4. **Chat.** All three participants use the same text interface for two minutes.
   The topic is visible throughout. The server controls the deadline.
5. **Guess.** Each human labels each of the other two participants Human or AI.
   Lock votes before any reveal. AI seats do not earn leaderboard scores.
6. **Reveal.** Show each participant's actual type and the player's correct
   guesses, points, and streak. Never reveal a person's real identity.
7. **Play again.** Offer immediate re-entry to the queue with a new room and topic.

If the selected composition needs more humans, show an honest waiting state.
Do not silently turn every quiet queue into two bots. All three compositions
must actually occur. A fixed voting deadline and hidden per-seat vote status
avoid exposing which seats are human while guesses are still editable.

Proposed base scoring: 100 points per correct classification, at most 200 per
round. A perfect round extends a streak. Publish generated aliases and
server-verified totals on a public leaderboard; do not publish conversations or
training consent. Leaving, blocking, or reporting carries no points penalty.

Human incentives are still a proposal: give 50 recognition-bonus points when
another real human correctly identifies the player as human. This rewards
natural conversation alongside accurate guessing, without policing writing style.
Only real human judgements count; do not manufacture bot votes for this reward.
Keep guessing points as the initial leaderboard ranking and show recognition
separately until the bonus has been playtested. Track recognition as a rate over
eligible human votes so that room composition does not determine the rating.
A two-bot room has no human recognition opportunity; record it as not eligible,
not a failed recognition. Never encourage personal disclosures as proof of humanity.

Choose composition weights with player exposure in mind: equally frequent room
types do not give equally frequent experiences to humans, because all-human
rooms contain three human seats and two-bot rooms contain one. Record room
composition when comparing scores and detection rates; do not assume a 50/50
human-versus-bot baseline from room randomisation alone.

## Where the fun comes from

- Players choose questions and look for clues in how the partner responds.
- A short timer creates an approaching decision without requiring fast typing.
- The countdown and random topic give each group a shared starting point.
- The reveal resolves the mystery and makes a surprising result shareable as a
  score card, without publishing conversation text.
- A public leaderboard makes points and repeat rounds meaningful. Confidence
  ratings and streak multipliers are outside the first scoring version.

Use a reviewed topic pool, selected randomly by the server. Examples: "What
ordinary object would be terrifying if it could talk?" or "Invent a terrible
name for a very good restaurant." Topic selection needs no live LLM call.

A first playtest should establish whether people choose another round without
needing the training story to persuade them.

## Screens

| Screen | Essential content |
| --- | --- |
| Welcome/join | Premise, Play, eligibility, data notice, optional training choice |
| Lobby/countdown | Assigned alias, readiness, matching status, 3–2–1 countdown |
| Conversation | Three aliases, topic, messages, composer, timer, Leave/Block/Report |
| Guess | A separate Human/AI choice for each of the other two participants |
| Reveal | All three types, correctness, points/streak, Play again |
| Public leaderboard | Generated aliases, verified totals, no chat text or real identities |
| Protected operator view | Reports, room controls, approved examples, actual training/version status |

Model IDs, internal request receipts, and training controls belong in the
operator view. The ordinary player screens should focus on the game.

## Passive feedback and training candidates

The game's ordinary actions produce the feedback; players do not rewrite
messages or fill in a separate feedback form. Record each guess against its
actual target participant and the server-known role:

- AI judged Human: the player guessed incorrectly; the AI appeared human-like.
- AI judged AI: the player guessed correctly; investigate what felt artificial.
- Human judged AI: an important control showing that guesses can be wrong about humans too.

Reviewed human replies, paired with the preceding conversation and topic, are
candidate supervised examples. Human authorship does not automatically make a
message useful: remove identifying information, abuse, spam, and poor examples.
Keep speaker order and turn context. Include no future messages or final reveal
in the context used to predict a training reply.

Use a group conversation for training only when every human whose text appears
in that example has opted in. An opt-out must also exclude that person's words
from other participants' training context. The game should still work for them.

A guess rates the impression of a participant over a whole conversation. Do not
label every individual AI message good or bad from that one result. Two humans
judging the same bot in one room are related observations, not two independent
conversations. Preserve the bot/model version and context behind each outcome.

Candidate states are collected, consent-checked, redacted, reviewed, accepted by
Mubit, and included in a specific version. Track the actual state. Successful
human-like perception alone does not establish helpfulness, safety, or learning.

## Minimum safeguards

- Public anonymous random matchmaking, retaining the proposed adults-only scope.
  Test all compositions before deployment and have an operator available for
  the first public playtest. No invite-code step in the product.
- Participants know at entry that their partner may be an AI and that messages
  undergo the disclosed moderation and provider processing.
- Text only. Disable attachments, active links, contact exchange, searchable
  profiles, and post-round messages.
- Apply server-side contact-information checks and content moderation to both
  human and AI messages before delivery. Filters reduce risk; they do not
  guarantee anonymity or prevent all abuse.
- Keep Leave, Block, and Report available. End cancelled rounds without awarding
  a guess result. Blocked participants must not be paired again.
- Provide report review, room removal, rate limits, and a host shutdown control.
  Retain only the limited evidence needed for reviewing a report.
- The AI may participate in the disclosed guessing game but must not claim a
  real person's identity, solicit personal details or money, seek contact outside
  the game, or pressure someone to stay. Safety takes priority over its game score.
- Training is optional. Keep full automatic Mubit capture off for ordinary live
  chat until consent, review, and the ingestion path are verified. Disclose the
  model/provider processing needed for playing separately from optional training.
- Proposed prototype raw-chat retention: 24 hours. Proposed report-evidence
  retention: seven days, with restricted access. Confirm the policy before any
  real participant joins; neither period is a statement of legal requirements.
- Reviewed, redacted training examples need their own disclosed retention and
  withdrawal policy. Do not retain raw conversations by calling them training data.
- Provide a deletion/withdrawal route and explain the limits after data has
  already been used for training. Do not promise selective erasure from weights.

Moderation, abuse controls, and report handling must work before opening the
public queue. The public launch scope is agreed; the data and retention policy
still needs to be settled before real participants join.

## Architecture

Keep one frontend and one authoritative application backend for the MVP.

- **Browser:** renders the room and conversation, sends messages/guesses, and
  displays only information that the server has authorised for that phase.
- **Backend:** issues anonymous sessions; owns matchmaking, the three seats,
  hidden roles, countdown, topic selection, timers, messages, votes, scoring,
  leaderboard, moderation, blocks, and consent.
- **Realtime channel:** carries authorised room events for both human and AI
  conversations using the same client-visible format.
- **Database:** stores participant/session identifiers, rooms, rounds, messages
  with expiry, per-participant guesses, consent, leaderboard totals, training
  candidates, and restricted reports.
- **Mubit integration:** makes server-side LLM calls; preserves request receipts
  and actual model/version evidence. All game-model LLM calls route through Mubit.
- **Operator controls:** review reports and proposed examples; record only real
  training and serving states.

Use server-only credentials and authenticated room access. Never send hidden
participant types, bot count, model identities, or another player's guess before
the reveal, including through browser/network payloads. Give AI seats only the
public transcript, topic, and their own alias. Keep task instructions fixed;
put changing group context into the request context.
Render chat as untrusted text, not executable HTML. Repeated sends and guesses
must not produce duplicate messages, scores, or training examples. Briefly allow
reconnection; if a human permanently leaves, void the round rather than secretly
replacing them with a bot. Do not penalise the remaining players.

Select the exact hosting and realtime implementation after the Mubit proof.
The build must support authenticated realtime connections and durable state;
a static page with browser-only storage cannot supply the multiplayer game.
Develop through the existing pinned Nix shell.

## Build order and acceptance

| Stage | Deliverable | Required evidence |
| --- | --- | --- |
| 1. Playable skeleton | Anonymous queue, three seats, countdown, topic, chat, vote, reveal | Three real browsers complete an all-human round |
| 2. AI and scoring | Zero/one/two bots, Mubit calls, points, public leaderboard | All compositions run; both guesses score correctly; no hidden roles leak |
| 3. Playtest readiness | Consent, moderation, reports, blocks, disconnect handling | Blocked delivery, operator queue, no leave penalty, no non-consented training capture |
| 4. Passive data and learning proof | Human-example review and bot-detection outcomes | Accepted intended training targets, completed job, fresh adapter response, version lineage |
| 5. Playtest and evaluation | Independent new rounds with frozen model versions | Replay observations; real counts for naturalness, helpfulness, safety, cost, and latency |
| 6. Submission | Three-minute MP4/MOV, PDF deck, updated public source | A complete game explanation and a verified example-to-model-update demonstration if the learning gate passes |

## Evaluation and demo

Use different conversations for training and evaluation. Keep evaluation calls
out of the training corpus and keep the task prompt fixed across model versions.
Exclude practice rounds and cancelled games from the blind-test results.

Measure the proportion of AI participants judged Human, per room composition,
context-following/helpfulness, unsafe-message rate, latency, and cost. Track
human-round judgements as a control for player response bias. Version changes
must be measured with blinded assignments and reported sample counts; a few
selected exchanges do not demonstrate a general improvement.

The first demo should show random matchmaking, 3–2–1, the topic, a real group
chat, guesses, the reveal, points, and the leaderboard. Show passive feedback
and the human-example review queue. A learning claim additionally needs an
accepted example, completed training version, and a fresh response from it.
Clearly identify a previously completed run if training exceeds the demo time.

Capture the MP4/MOV and PDF before the target midnight submission. The supplied
organiser instructions set Sunday 25 October at 05:00 as the hard freeze; confirm
the event's timezone and latest timing with Max. Complete both Saturday check-ins.
Public source must exclude chat transcripts, secrets, participant records,
reports, training data, and private model artifacts.

## Out of scope for the first version

Voice/video, contact exchange, public transcript sharing, payments, persistent
social profiles, multiple game modes, manual reply-rewrite tasks, and automatic
unreviewed retraining.

## Sources and outstanding decisions

- [Mubit API: server calls and capture controls](https://docs.mubit.ai/reference/api)
- [Mubit adapter training and testing](https://docs.mubit.ai/guides/first-adapter)
- [Mubit task/session grouping](https://docs.mubit.ai/guides/tasks-and-sessions)
- [Mubit model IDs and current adapter-access limitation](https://docs.mubit.ai/guides/model-ids)

Resolve: supported ingestion of reviewed human replies and use of guess outcomes;
adapter-serving interfaces;
actual trainable context/output limits; training
turnaround and experiment call ceiling; hosting; and the consent/retention
policy appropriate for the initial participants.
