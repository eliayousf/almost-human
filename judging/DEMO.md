# Demo runbook

**Play here: [almost-human-playtest.vercel.app](https://almost-human-playtest.vercel.app/).**
The released Expo interface includes all 25 animated characters and uses the
shared Convex client. Hosted chat/vote/reveal and replay have been verified;
see [INTEGRATION.md](../INTEGRATION.md) for exact revisions and evidence scope.
Use [GitHub main](https://github.com/eliayousf/almost-human/tree/main) for the
submission source. This is not a timed presentation
rehearsal. The trained adapter is blocked from serving, and the event's actual
time limit has not been confirmed in this package.

## Run the checks first

From the repository root:

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

This builds against an inert address and does not contact the game or Mubit.
It is local verification, not a live demo. Logs stay in ignored artifacts.

## Optional live diagnostic client

Use the existing development backend only for an intentional playtest. The
address below is public client configuration, not a credential. Its deployment
can change independently of this checkout; this guide does not assert that the
current backend matches the submitted commit. A live round can consume Mubit
inference credit and send synthetic chat content to the service.

```sh
nix develop -c env CONVEX_URL=https://original-buzzard-860.eu-west-1.convex.cloud npm --prefix backend run build:playtest
nix develop -c npm --prefix backend run playtest
```

Open **http://127.0.0.1:3219/react.html**. The server binds only to loopback.
Use separate tabs for separate diagnostic identities. Read and deliberately
accept the playtest's eligibility/rules as appropriate; leave training consent
off for the game demonstration. Send only invented, nonpersonal text.

In normal matchmaking, a solo player can receive bot partners after the waiting
period when server bot inference is enabled and available. With bots disabled,
human matching may wait. Do not promise an instant match. The main Expo game
requests strict pairs and uses the current terms flow; this diagnostic client
retains the earlier optional feedback control.

Verify visible behavior: a shared countdown/topic, a real reply, server timer,
one vote per other seat, reveal and server-scored points, then refresh/replay.
Leave and report controls must be accessible. Treat provider failures and room
cancellation as failures, not as successful replies.

## A proposed 2:20 walkthrough

New rounds use 3 seconds countdown + 60 seconds chat + at most 10 seconds
voting, plus queue time. The server reveals as soon as all humans vote; a
bot round reveals immediately on your vote. Start matchmaking during the
introduction, allow time for service delays, and rehearse against the organiser's
actual time limit. Bot messages deliberately pause 6–12 seconds after generation.
Do not change the server clock to fit the presentation.

| Time | Show and say | Evidence boundary |
| --- | --- | --- |
| 0:00–0:15 | Explain the NPC-dialogue job and the guessing-game interface. | Developer usefulness is proposed; no demand or improvement claim. |
| 0:15–0:45 | Send a synthetic message in the main game and show a response. | Label it provider inference through Mubit. It is not the trained adapter. |
| 0:45–1:10 | Show the conversational correction and completed training lineage. | Training happened earlier. Use the public summary or owner-held receipts; do not simulate live training. |
| 1:10–1:40 | Cast guesses, wait for the server reveal, show points. | Actual timings can vary; do not fabricate a reveal or award. |
| 1:40–2:05 | Show the serving blocker and 2/12 length-compliance result. | Fresh learned-model inference is unavailable. Explain the literal-string checks and genuine quality issue. |
| 2:05–2:20 | Show the recorded check receipt and the next acceptance gate. | Local passing tests do not make the service blocker pass. |

If a live service is unavailable, show dated recorded evidence with an explicit
recorded label and report the failure. Synthetic fixtures demonstrate screen
states only. Neither is a live-game or live-adapter substitute.

## Questions the presenter should be able to answer

- **What changed?** A follow-up editorial correction changed the synthetic
  response; the corrected conversation was approved, and Mubit trained v1.
  The separate replacement-target field stayed null.
- **Which model is playing now?** The game integration routes provider chat
  through Mubit. No trained-version game serving was verified.
- **Did it improve?** Not established. The internal evaluation is unsuitable
  for alternative dialogue wording, and the adapter also misses length limits.
- **Can I reproduce it without your account?** The code/tests and sanitised
  summary checks, yes. A new remote training job or console trace read needs
  the owner's authorised Mubit access and is not run by the judging command.

## Operator rehearsal checklist — not yet completed for this submission

- [ ] Record source commit, actual live backend and demo configuration.
- [ ] Complete a synthetic live round, including refresh and replay.
- [ ] Verify the intended presentation device and network.
- [ ] Rehearse within the confirmed time limit.
- [ ] Keep the serving blocker visible and all model provenance accurate.
- [ ] Keep credentials, account details and player transcripts off-screen.
