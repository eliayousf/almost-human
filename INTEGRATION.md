# Frontend integration — 25 October 2026

## Source and deployment findings

- Ayo's cast branch was `3519e85`; the latest geometry branch was `6f6e7ec`.
  Both are merged on `codex/frontend-integration`, preserving their history.
- Our judging package was already committed and pushed at `4709a3d`.
- Ayo's Vercel previews showed Ready but performed no frontend install/build;
  the cast preview returned HTTP 404. The public playtest domain still served
  the old diagnostic build from `5101272` when this investigation began.

## Integration fixes

- Root `vercel.json` installs the locked frontend dependencies, runs the live
  Vite build, and publishes `frontend/dist`. Missing public backend configuration
  now fails the build rather than publishing a misleading empty site.
- The preview branch uses public `VITE_CONVEX_URL` and `VITE_STRICT_PAIR` values.
  Mubit/auth credentials stay on the existing Convex development backend.
- The live client imports the shared 1v1 request type. The tested strict-pair
  functions were pushed to `dev:original-buzzard-860` with Convex reporting
  functions ready. Existing default matchmaking remains available to old clients.
- The backend emits stable role-independent `faceId` values. Every viewer of a
  room gets the same distinct cast assignments, including after refresh/reveal.
  No schema backfill or player-data change is required for these derived values.
- Placeholder consent slots were replaced with an explicit synthetic-data
  development playtest notice; optional feedback remains unchecked by default.

## Cast videos

Ayo is uploading the actual media separately. The current manifest expects 25
sets of idle/talk/smile videos and poster images under `frontend/public/cast/`.
The build checks that every referenced file exists and is nonempty. Until all
files are included in the build, it deliberately uses neutral portraits and
makes no requests for missing cast files. Once the media is available, rebuild
to enable it. Do not mistake missing artwork for missing backend connectivity.

## Verification

Backend TypeScript and 124 tests passed, including consistent cast assignment.
The frontend live build and typecheck passed against the real development URL.
The judging command now also builds the player frontend against an inert URL.

Live preview/browser results will be recorded here after verification. A passing
build is not a completed chat round. Physical-iPhone validation remains separate.
The Mubit trained-adapter serving blocker described in `MUBIT_TRAINING_RUN.md`
is unchanged; game replies use provider inference through Mubit.
