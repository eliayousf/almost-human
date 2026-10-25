# Almost Human agent guidance

- Use the root `flake.nix` devShell: `nix develop -c <command>`. `.envrc` must
  contain `use flake`. Temporary tools use `nix shell nixpkgs#<package> -c ...`;
  do not install global tools. Keep these Nix files in the repository.
- In a managed cloud VM where Nix cannot be provisioned, use its existing Node.js
  22 runtime with project-local dependencies via `bash scripts/cloud-setup.sh
  --managed-cloud`. Record that runtime explicitly; do not claim Nix ran there.
- Read `CLOUD_HANDOFF.md`, `TEAM_BRIEF.md`, and `CASH_HANDOFF.md` before work.
- Cash owns `frontend/` and the public UI/UX. Continue backend/client work in
  `backend/` and shared contracts in `shared/`; preserve other people's changes.
- Follow `backend/AGENTS.md` before editing Convex code. Do not deploy or
  reconfigure the shared Convex backend simply to run client tests.
- Default rooms have two to five seats and may include 0, 1, or 2 Mubit bots,
  with at least one human; strictPair is an opt-in two-seat source path. Keep
  roles and provider details private until reveal. All game LLM calls must route
  through Mubit. Synthetic adapter training completed; live trained-adapter
  serving remains blocked. See `JUDGING.md` and `MUBIT_TRAINING_RUN.md`.
- Keep credentials, player transcripts, test artifacts, and model data out of Git.
- `judging/evidence/` contains only explicitly allowlisted, content-free public
  summaries. Keep raw receipts and logs in ignored `artifacts/`; never call a
  local consistency check independent service verification.
- Make changes on a `codex/` branch and open/update a reviewable PR; do not merge
  to main or publish the public game without user direction.
- Do not send Discord, email, social posts, or teammate messages without explicit
  user authorization. Reports inside the game are private backend records.
