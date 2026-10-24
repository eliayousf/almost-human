#!/usr/bin/env bash
set -euo pipefail

almost_human_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$almost_human_root"

if ! command -v nix >/dev/null 2>&1; then
  echo "Prepare Nix with flakes enabled in this cloud environment first; see CLOUD_HANDOFF.md." >&2
  exit 1
fi
if [[ ! -f backend/package-lock.json ]]; then
  echo "Select the codex/backend branch; main does not yet contain the implemented backend." >&2
  exit 1
fi

# Public client configuration only. No deployment, signing, or Mubit keys needed.
export CONVEX_URL="${CONVEX_URL:-https://original-buzzard-860.eu-west-1.convex.cloud}"
nix --extra-experimental-features 'nix-command flakes' develop -c npm --prefix backend ci --ignore-scripts
nix --extra-experimental-features 'nix-command flakes' develop -c npm --prefix backend run check
nix --extra-experimental-features 'nix-command flakes' develop -c npm --prefix backend test
nix --extra-experimental-features 'nix-command flakes' develop -c npm --prefix backend run build:playtest
nix --extra-experimental-features 'nix-command flakes' develop -c node --experimental-strip-types scripts/check-shared-contract.mjs
echo "Almost Human cloud setup checks passed. No backend deployment or model training was performed."
