# Almost Human: cloud agent handoff

**Historical handoff.** For the current submission, use [JUDGING.md](JUDGING.md)
and its source-fingerprinted checks. Synthetic training has since completed;
trained-adapter serving remains blocked. Deployment claims below describe their
recorded milestone, not a new verification of this checkout.

**Local continuation:** `codex/mubit-bots` adds server-side Mubit bot rooms to
the backend base below. Read `backend/README.md` and the new milestone in
`backend/VERIFICATION.md` for current behavior. Local development and a real
two-bot browser round are verified; the earlier cloud runtime's unavailable
proxy did not verify cloud model access. Mubit bot inference runs on Convex,
whose server credential is separate from a Codex Cloud personal secret. The
historical all-human baseline below remains useful but is not the latest scope.

Repository: <https://github.com/eliayousf/almost-human>.
Source branch: **codex/backend**, containing draft [PR 1](https://github.com/eliayousf/almost-human/pull/1).
Verified implementation base: `6589ea6`; use the latest pushed branch, which also
contains this handoff and cloud setup script. The backend has not been merged to main.

## Assignment

Take over Elia's backend/integration work in a repository-backed Codex Cloud
environment. First prove the remote environment can reproduce the passing
baseline, then inspect and fix genuine backend/client integration regressions
that block Cash's frontend. Keep the handoff accurate and report the next
public-launch gates. Do not independently build or redesign Cash's frontend.

Read `AGENTS.md`, `TEAM_BRIEF.md`, `CASH_HANDOFF.md`, `backend/README.md`, and
`backend/VERIFICATION.md`. Review the existing branch before changing anything.
Use a new `codex/` work branch if implementing fixes, and state that its base is
codex/backend rather than main. Preserve the existing PR and teammate work.

## What exists

- A hosted Convex backend with official anonymous auth, atomic three-human
  matchmaking, a 3-second countdown, 120-second chat, 15-second voting, private ballots, single score
  settlement, leaderboard, presence, Leave/Block/Report, and optional consent.
- 100 points per correct guess, max 200. Missing ballot earns 0. No Humanity bonus.
- A framework-neutral GameClient plus an optional React auth provider and live
  hooks in `shared/react-game.ts`. Cash owns frontend screens and styling.
- Vanilla and React diagnostic clients under `backend/playtest/`; build outputs
  and screenshots are ignored. Public frontend is not present on this source branch.
- 27 tests passed locally, including auth acknowledgement, StrictMode startup,
  session recovery, private ballots, deadline/idempotency and scoring behavior.
- Actual independent browser sessions completed full 120-second rounds through both
  clients, including 200/100/0 scores, refresh recovery, replay and cancellation.
- A separate Vite 8.3.5 consumer build verified dependency deduplication. The
  iPhone/Safari checklist is supplied; physical-device testing has not occurred.

Cash's recommended demo is React+Vite+TypeScript on an HTTPS URL, opened in Safari.
Give Cash the `CASH_HANDOFF.md` instructions; do not send him messages yourself.

## Cloud environment configuration

Name: **Almost Human**. Attach only `eliayousf/almost-human`. Select codex/backend
as the source for this handoff. Keep environment visibility private to the user
unless they request sharing. Reuse an existing suitable environment if one exists.

The repository retains its pinned root Nix devShell and `.envrc` containing
`use flake` for local development. Use it in the cloud if available. This managed
cloud image lacks Nix provisioning privileges; use its existing Node.js 22
runtime with `bash scripts/cloud-setup.sh --managed-cloud`. This explicit mode
checks the Node major version, prints runtime/package-manager versions, and uses
project-local npm dependencies. Do not install global npm tools, weaken TLS or
Nix verification, or claim Nix was used in this managed mode.

Public environment values:

```dotenv
CONVEX_URL=https://original-buzzard-860.eu-west-1.convex.cloud
VITE_CONVEX_URL=https://original-buzzard-860.eu-west-1.convex.cloud
```

No credentials are required for component tests or browser-client use of the
existing development backend. Local ignored `.env.local` files, auth caches,
Mubit keys and deployment keys were not uploaded or committed. Do not assume
the cloud task can deploy Convex or train models.

Allow package-manager and GitHub source/archive hosts, plus the exact development
Convex cloud/site hostnames if doing live client verification. Add Nix cache and
official installer/download hosts only for an environment that can actually use
Nix. Keep permissions and destinations limited to this work. Browser use is not guaranteed in a cloud
task; use supported tests/API checks and accurately label any untested UI steps.

Run setup from the selected source branch:

```sh
bash scripts/cloud-setup.sh
# Managed cloud image without Nix provisioning:
bash scripts/cloud-setup.sh --managed-cloud
```

The script performs project-local dependency installation, TypeScript, 27 tests,
both diagnostic builds, and shared fixture checks using the selected runtime. It does not
deploy functions or call a model. If environment setup starts on main, explicitly
fetch/check out codex/backend in the fresh setup workspace first; it contains
the implemented backend and this script. Do not discard existing task changes.

Publish the environment only after the selected setup mode's checks pass. Record its actual
environment ID/link and start a new cloud task from the published setup. Do not
claim a GitHub-backed environment exists just because a projectless task can clone
a public repository. Saving a draft is not successful environment publication.

## Reproduce the baseline locally

```sh
nix develop -c npm --prefix backend run check
nix develop -c npm --prefix backend test
CONVEX_URL=https://original-buzzard-860.eu-west-1.convex.cloud nix develop -c npm --prefix backend run build:playtest
nix develop -c node --experimental-strip-types scripts/check-shared-contract.mjs
```

In the managed cloud VM, use the explicit cloud setup command above for the same
checks. Record blocked live-service access separately from offline component
tests; a permitted domain alone does not guarantee the platform proxy allows it.

If a supported browser is available, the loopback reference server starts with
`nix develop -c npm --prefix backend run playtest`. Vanilla reference is `/`;
React reference is `/react.html`. Each diagnostic tab uses sessionStorage for a
separate test identity. Use synthetic text. Localhost URLs are not public phone URLs.

## Remaining scope and boundaries

Public launch still requires comprehensive moderation, operator report review
and room shutdown, anti-abuse controls, and agreed retention/deletion/withdrawal
rules. Existing contact/threat filters are baseline development checks only.
UI integration and recorded training consent do not satisfy those gates.

Mubit provider chat was previously verified separately. There is no verified
path from human examples/corrections through adapter training to calling that
adapter. Do not invent training support or show improvement without evidence.
Current live rooms contain humans only. No bot fallback or early role exposure.

Do not publish the frontend, merge PRs, change shared service access, send external
messages, or ingest real conversations without explicit user direction. Finish
with the actual source commit, checks and results, any fixes, PR link if created,
and concrete blockers. Do not claim work is running in the cloud unless a real
cloud task was created and its status was checked.
