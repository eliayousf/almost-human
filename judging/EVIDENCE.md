# Evidence catalogue and sanitisation

## Public review material

| File | What it establishes | What it cannot establish |
| --- | --- | --- |
| [criteria.json](evidence/criteria.json) | Maps all four equally weighted criteria to evidence and limits. | A judge's score or confirmation that every criterion passes. |
| [mubit-run.json](evidence/mubit-run.json) | Allowlisted identifiers, states, counts and content hashes from the observed synthetic training run. | Independent service attestation, raw dataset-row access or current live availability. |
| [checks.json](evidence/checks.json) | The recorded local verification outcome, runtimes, source fingerprint and actual test counts. | Deployment, user demand, mobile usability or remote adapter serving. |
| [Training run report](../MUBIT_TRAINING_RUN.md) | Explains the completed job, inference blocker and quality limitations. | A working production learning loop. |
| [Historical backend verification](../backend/VERIFICATION.md) | Dated reports of full synthetic browser rounds and earlier checks. | A new browser/device test on today's submitted branch. |

These are maintainer-collected observations and reproducible code checks. They
are not Mubit-signed attestations. Service IDs let an authorised workspace owner
locate the corresponding records; judges are not asked to sign in to a private
account or accept an inaccessible dashboard link as the sole evidence.

## What was removed

The public Mubit export is constructed from an explicit allowlist. It omits
account names, emails, cookies, keys, headers, prompts, replies, transcripts,
raw trace records and local filesystem paths. It contains no player data.
The public check receipt contains summaries, not console output or test logs.
Raw service data, model outputs, screenshots and logs remain in ignored artifacts.

Content hashes support comparison against the owner-held originals; a hash
alone does not prove that the source is authentic. The exact correction's
training-row membership is inferred from lineage and exclusion of its trace
from the held-out checks. The full dataset manifest was not exposed.

## Reproduce the public checks

```sh
nix develop -c python3 scripts/verify-judging.py --install
```

The script writes a fresh local summary and logs under `artifacts/judging-checks/`.
The fingerprint covers sorted repository file names and content hashes, excluding
the public receipt itself so publishing the receipt does not change its subject.
It includes uncommitted, nonignored files; keep the tree stable during a run.
The receipt's commit identifies the checkout at verification time, and the
fingerprint identifies the actual checked contents.

The Node guard rejects accidental fetch, HTTP and TCP calls in checks; tests
use their explicit mocks. It permits only Metro's named temporary Unix logging
socket so Expo build workers can report locally. Other socket endpoints remain
blocked. It is a test guard, not an OS sandbox. Dependency
installation is a separate registry operation before the guard applies.

## Maintainer-only regeneration

With the original ignored receipts available locally:

```sh
nix develop -c python3 scripts/export-judging-evidence.py
nix develop -c python3 scripts/check-judging-evidence.py
nix develop -c python3 scripts/verify-judging.py --install --write-receipt judging/evidence/checks.json
```

The exporter checks cross-record IDs, corrected context/response identity,
prompt fingerprint and accepted counts before emitting its content-free summary.
It does not read credentials or call Mubit. A fresh clone can validate the
published summary but cannot re-export absent private source records.

The public validator rejects raw-content fields, credential/account patterns,
broken local links, inconsistent counts and claims that serving or improvement
has been verified. If the service blocker is genuinely resolved later, update
the evidence, validator and guide together with new receipts; do not simply
flip a success flag.
