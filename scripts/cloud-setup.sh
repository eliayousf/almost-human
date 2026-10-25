#!/usr/bin/env bash
set -euo pipefail

almost_human_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$almost_human_root"

almost_human_managed_cloud=false
if [[ "${1:-}" == "--managed-cloud" ]]; then
  almost_human_managed_cloud=true
  if [[ "$(node -p 'process.versions.node.split(".")[0]')" != "22" ]]; then
    echo "Select the managed Node.js 22 runtime before cloud verification." >&2
    exit 1
  fi
  echo "Managed cloud verification using existing $(node --version), npm $(npm --version); repository Nix files retained."
elif ! command -v nix >/dev/null 2>&1; then
  echo "Use the Nix devShell locally. In a managed VM with Node.js 22, explicitly pass --managed-cloud; see CLOUD_HANDOFF.md." >&2
  exit 1
fi
if [[ ! -f backend/package-lock.json ]]; then
  echo "Select the codex/backend branch; main does not yet contain the implemented backend." >&2
  exit 1
fi

# Public client configuration only. No deployment, signing, or Mubit keys needed.
export CONVEX_URL="${CONVEX_URL:-https://original-buzzard-860.eu-west-1.convex.cloud}"
almost_human_run() {
  if [[ "$almost_human_managed_cloud" == true ]]; then "$@"
  else nix --extra-experimental-features 'nix-command flakes' develop -c "$@"; fi
}
almost_human_run npm --prefix backend ci --ignore-scripts
almost_human_run npm --prefix backend run check
almost_human_run npm --prefix backend test
almost_human_run npm --prefix backend run build:playtest
almost_human_run node --experimental-strip-types scripts/check-shared-contract.mjs
echo "Almost Human cloud setup checks passed. No backend deployment or model training was performed."
