# Frontend integration — 25 October 2026

## Current interface: Ayo's Expo/WebP UI

The owner selected the newer interface after upload `248643b` arrived on
`codex/react-native-webp-ui`. The previously supplied `e558` was the source
commit in `CashpointSoulja/almost-human`, not a commit in this repository.
The additive import includes all 25 character sets: 75 animated WebPs and 25
WebP posters, plus the original MP4/JPEG sources.

The root deployment now builds `frontend/expo/`. Its old polling Render client
and proxy were replaced by the existing shared Convex auth/game client. The
visual components are preserved in `frontend/expo/src/screens.tsx`; the live
controller and pure state mapping are separate. There are no client Mubit keys.

The hosted native-web preview at
https://almost-human-playtest-p8b3oyywi-eliayousfs-projects.vercel.app/
(`82191fb`) completed a real 1v1 round: explicit playtest choices, anonymous
profile, one bot partner, server topic/countdown, Mubit opener and contextual
reply, preserved transcript after refresh, blocked-contact rejection with input
preserved, locked vote, role reveal and the correct 100-point award. Recognition
was correctly unrated for a bot counterpart. Replay queue cancellation preserved
the 100-point profile. Browser error/warning logs were empty.

All 100 WebPs passed format/dimension/frame/size checks. Browser screenshots of
the same animated asset changed across frames, confirming playback rather than
only a loaded still. The gallery and labelled design preview remain separate
from live play. Character mood changes are decorative, not typing/audio evidence.

A compact-height bug found during verification was fixed: at 375×480 the chat
input now spans y=410–454, stays visible with an error banner, and the document
has no horizontal or vertical overflow. This is desktop viewport simulation,
not physical iPhone/Android verification. A missing vote is labelled unsubmitted
rather than falsely described as an incorrect guess.

The Vite frontend below is retained as previous work. The main production URL
has not been promoted; the tested builds remain protected Vercel previews.
The Mubit trained-adapter serving blocker is unchanged.

## Earlier Vite integration evidence

## Source and deployment findings

- Ayo's cast branch was `3519e85`; the geometry branch advanced from `6f6e7ec`
  to `ee192f3` during verification. Both are merged on
  `codex/frontend-integration`, preserving their history. The v4 layout first
  appeared in integration preview commit `3d0b334`.
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

## Hosted browser evidence

Preview `5975a93` completed the real flow: anonymous auth, explicit playtest
acceptance, strict two-seat matchmaking with one human test player and one bot,
Mubit-generated opener and contextual reply, message persistence, refresh recovery,
blocked contact-text rejection with input preserved, 30-second voting, role reveal,
100 points for the correct vote, leaderboard update, replay and clean Leave.
The replay cancellation awarded no extra points; the profile remained at 100.
Training consent stayed off. No browser warnings/errors were observed.

Read-only server verification matched that synthetic room's revealed result,
profile score, two Mubit request IDs and distinct face IDs (5 and 20). Raw chat,
screenshots and server QA receipts stay in ignored `artifacts/frontend-integration/`.

The newer v4 preview is
https://almost-human-playtest-matu28qzk-eliayousfs-projects.vercel.app/
at `3d0b334`. It also completed a real 1v1 chat, vote and reveal, awarding 100
points for the correct bot classification, with no browser warnings/errors.
At a 375px desktop viewport,
the document remained 375px wide, the portrait row was 335px wide and the v4
header size was 13px. This is responsive desktop verification, not a physical
iPhone test. The only integration adjustment to Ayo's v4 geometry clamps the
350px portrait row to the available width on narrower screens.

The stable branch preview alias is
https://almost-human-playtest-git-codex-fron-c8e447-eliayousfs-projects.vercel.app/
and follows future branch builds. An anonymous HTTP check redirected to Vercel
SSO, so the preview is not claimed to be publicly accessible to judges. Its
existing protection settings were preserved. Production promotion is a separate
owner decision.

Physical-iPhone validation remains separate.
The Mubit trained-adapter serving blocker described in `MUBIT_TRAINING_RUN.md`
is unchanged; game replies use provider inference through Mubit.
