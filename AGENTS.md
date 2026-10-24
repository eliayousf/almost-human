# Almost Human agent guidance

- Use the root `flake.nix` devShell: `nix develop -c <command>`. `.envrc` must
  contain `use flake`. Temporary tools use `nix shell nixpkgs#<package> -c ...`;
  do not install global tools. Prepare Nix in the cloud image before verification.
- Read `CLOUD_HANDOFF.md`, `TEAM_BRIEF.md`, and `CASH_HANDOFF.md` before work.
- Cash owns `frontend/` and the public UI/UX. Continue backend/client work in
  `backend/` and shared contracts in `shared/`; preserve other people's changes.
- Follow `backend/AGENTS.md` before editing Convex code. Do not deploy or
  reconfigure the shared Convex backend simply to run client tests.
- Current game milestone is three humans; AI players and learning are separate.
  All future game LLM calls must route through Mubit. Adapter training is not verified.
- Keep credentials, player transcripts, test artifacts, and model data out of Git.
- Make changes on a `codex/` branch and open/update a reviewable PR; do not merge
  to main or publish the public game without user direction.
- Do not send Discord, email, social posts, or teammate messages without explicit
  user authorization. Reports inside the game are private backend records.
