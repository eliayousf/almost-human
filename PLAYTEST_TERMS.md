# Playtest terms and vote feedback

Version: `playtest-v2-vote-feedback`, dated 25 October 2026.

The active Expo game includes vote-based bot improvement as a standard feature.
The entry screen explains it and links to **Terms & conditions**. Players accept
the general playtest terms; there is no separate optional feedback checkbox.
The same terms remain readable from the lobby. The displayed text is defined
once in [shared/playtest-policy.ts](shared/playtest-policy.ts).

The terms cover AI partners, use of Human/AI guesses and bot-written replies for
style improvement, message processing needed to play, conduct, player controls,
and the experimental nature of the service. They do not authorize importing
players' messages as human-authored training examples.

## Existing accounts and evidence

- A new profile accepting this version starts with vote feedback enabled.
- Existing profiles keep their earlier preference until they accept the updated
  terms. The UI waits until their current round or queue has ended before asking.
- Acceptance preserves the player's alias and score. The backend stores the
  policy version and acceptance timestamp; repeated requests do not reset them.
- Each new ballot privately records eligibility at submission. Earlier opted-out
  ballots remain excluded, even if acceptance occurs in the same millisecond.
  Historical ballots without this field use a conservative timestamp cutoff.
- The legacy preference endpoint remains compatible with older clients, including
  explicit withdrawals. It cannot claim acceptance of or downgrade the new terms.
  The retained Vite/diagnostic clients still use their earlier optional flow.

The legacy database/API name `trainingOptIn` remains for compatibility. In this
flow it governs vote/bot-reply feedback; it is not a blanket human-chat training
permission. General terms acceptance is not asserted to establish GDPR consent
or a lawful basis. Public-release privacy, retention and deletion work remains
separate from this product change.

## Reproducible checks

```sh
nix develop -c python3 scripts/verify-judging.py
```

Backend tests cover default eligibility, explicit version updates, preserved
scores, repeated requests, legacy withdrawals, historical ballots and votes cast
before acceptance. Expo checks cover policy-version detection alongside the
existing round presentation and media checks. These use synthetic, in-memory
data; they do not accept terms for real players or send data to Mubit.

Mubit external ratings remain disabled by default. The trained-adapter serving
blocker is unchanged; see [JUDGING.md](JUDGING.md). Default vote feedback is not
evidence of a trained adapter answering live questions.
