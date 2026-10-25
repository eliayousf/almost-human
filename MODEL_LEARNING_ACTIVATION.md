# Actual model learning: activation and proof

## State of this change

PR #8 adds a consent-gated path from game verdicts to Mubit adapter training.
The reviewed backend was deployed on 25 October; [RELEASE.md](RELEASE.md) records
the release checks. External full-record captures and ratings remain disabled:
no console credential or project is configured, and the ratings flag is off.
The optional permission control does not itself activate remote training.
No keys, Mubit quality gates or adapter rollouts were changed.

Mubit trains adapters in batches, not synchronously after every chat. A sent
rating, a local test, a new prompt example or a completed training job alone does
not establish that the game is using updated weights or that replies improved.
The earlier failed serving experiment remains documented in MUBIT_TRAINING_RUN.md.

## What the code does

1. A new authenticated `setChatTrainingConsent` command records a separate,
   voluntary permission and version. Existing players start without it; the
   standard vote-feedback terms cannot grant it. The optional setting appears
   inside the terms modal only when the backend advertises support. Play remains
   available without chat-training permission.
2. Matchmaking snapshots each human's grant revision before a room starts.
   Enabling the choice during a room or queue is refused. Withdrawal is allowed,
   and a later grant never revives permission for older rooms.
3. Each bot attempt, including a retry after a transient failure, rechecks all
   humans' grants. Full recording is requested only for an eligible room with ratings enabled and an explicit console/project
   configuration. Every other request sends `x-middleware-record: metadata`.
   A stable first user message carries the room's opaque ID for Mubit's
   documented automatic session grouping. Request metadata is omitted because
   the live provider requires `store` for it; no extra provider storage is enabled.
   Training/test splits can stay at the conversation boundary. Mubit may retain less than requested under its own
   recording policy; local eligibility is not proof of remote dataset inclusion.
4. Each published bot call retains its eligibility. Round verdicts still teach
   prompt lessons under the existing vote rules. Only eligible calls enter the
   external rating path, and consent is checked again immediately before rating.
5. Eligible verdicts use the existing Mubit console bridge to send Good/Bad on
   the exact gateway request ID. The bridge requires an explicit project slug;
   it never chooses the first project belonging to a broad console login.
   Only Mubit can decide which examples are kept, train a version and route it.
6. `ratings:progress` reports local configuration and bounded sampled eligibility,
   sent/failed ratings and observed serving routes. It is an internal operator
   query; no model, provider or consent details enter public room snapshots.

Existing records without the new grant/eligibility fields are not retroactively
used. No data migration enables training for old profiles or past calls.

## Remaining model-learning activation checklist

1. Review and deploy this backend/schema to the game project already serving
   `original-buzzard-860.eu-west-1.convex.cloud`; use that project's existing
   deployment procedure. This is not a request to create a new backend or replace
   its Mubit key. Then deploy the frontend with the matching shared client.
2. Open the Mubit workspace/project that receives the game's Mubit key. Check
   its recording/training policy and the game's task fingerprint. Preserve
   quality gates. Automatic grading must not overwrite the player labels; check
   the current supported controls in that account rather than blindly replaying
   an old undocumented policy request.
3. Set `MUBIT_PROJECT` explicitly and configure `MUBIT_CONSOLE_COOKIE` privately
   in Convex's Environment UI if using the existing experimental console bridge.
   That cookie is a broad, expiring account login, not a supported scoped rating
   credential. Keep it out of source, chat, screenshots and shell history; revoke
   it after the experiment. Prefer replacing this bridge with a supported scoped
   service credential when Mubit provides one.
4. Set `MUBIT_RATINGS_ENABLED=true` after confirming the project, permissions and
   account policy. Players must separately enable optional chat training in the
   lobby before joining. Every human in a room must have opted in.
5. Use invented conversations for the first bounded verification. Confirm the
   exact request IDs show full records in the intended task, and that eligible
   Good/Bad ratings arrive. Confirm unconsented calls have no retained request/answer text in Mubit.
   Check `npx convex run ratings:progress` in the authorised deployment context.
6. Accumulate varied, approved examples in distinct sessions. Mubit commonly
   starts at 25 kept examples, but use the console's actual threshold and count.
   Do not reset experiment ledgers, duplicate examples to pad counts, import
   held-out questions into training, or claim a rejected example was kept.
7. Verify a completed version and meaningful held-out dialogue evaluation.
   The old whole-answer `contains` checks are not semantic dialogue evaluation.
   If the console cannot provide valid rubric/reference evaluation or diagnostic
   inference, resolve that service blocker with Mubit. Do not disable tests,
   lower pass bars or promote an ungated version merely to make a demo pass.
8. Obtain a fresh game reply with prompt lessons absent for the proof. Inspect
   its server trace and verify `routing.served_by` identifies the trained adapter
   and the exact completed version. Provider output or shadow-only evaluation is
   not an adapter serving the user. Keep content-free IDs/status as evidence;
   keep raw traces, conversations and receipts in ignored artifacts.

## Stop/rollback

`MUBIT_RATINGS_ENABLED=false` stops future full-recording requests and external
ratings from this code. It does not delete earlier provider records, cancel a
remote training job, erase learned weights, or force Mubit back to provider
inference. Pause/revert adapter routing separately in the Mubit account if needed.
Retain the additive optional schema fields when disabling the feature.

Convex message retention and upstream provider retention are unchanged.
Retention/deletion and broader public-launch privacy work remain separate.
The new product permission is not a claim of legal or regulatory compliance.

## Checks and boundaries

The local tests cover default denial, explicit opt-in, incompatible terms,
mid-round enable rejection, withdrawal, grant revisions, multi-human gating,
metadata/full headers, session grouping, exact-call ratings and serving-route
provenance. Tests use synthetic data and a mocked Mubit. They do not train weights.
Current service docs:
- https://docs.mubit.ai/reference/api
- https://docs.mubit.ai/guides/tasks-and-sessions
- https://docs.mubit.ai/guides/first-adapter
- https://docs.mubit.ai/guides/model-ids
