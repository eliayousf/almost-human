# Almost Human — Ayo's Expo interface with Convex

The owner selected this newer single-portrait interface. Its original visual
source came from `CashpointSoulja/almost-human` commit
`e558ffdb9286fd9954ba8fe8a99c85f50fcdd8b5`, imported here in `248643b`.
The import is preserved in history. The live controller now uses this repository's
shared Convex GameClient instead of the separate Render API.

## Build from the repository root

```sh
nix develop -c npm --prefix backend ci --ignore-scripts
nix develop -c npm --prefix frontend/expo ci --ignore-scripts
nix develop -c npm --prefix frontend/expo test
nix develop -c npm --prefix frontend/expo run typecheck
nix develop -c env EXPO_PUBLIC_CONVEX_URL=https://original-buzzard-860.eu-west-1.convex.cloud npm --prefix frontend/expo run build:web
```

Root `vercel.json` performs the install, checks and web export and publishes
`frontend/expo/dist`. Keep repository root as the deployment context so shared
sources are present. Supply `EXPO_PUBLIC_CONVEX_URL` as public build configuration;
Mubit and authentication secrets stay on Convex. There is no Render proxy.
Missing backend configuration fails the build rather than falling back to mocks.

The Nix shell supplies Node 22. Shared client types use the locked dependencies;
Metro resolves shared React/Convex imports to this app's runtime to avoid duplicate
providers. No root npm-workspace restructuring is required.

## Live behavior

- Official anonymous Convex auth and the existing session/queue/round subscriptions.
- Adult eligibility and versioned playtest terms before joining. Vote-based bot
  improvement is included by default after acceptance, with no separate toggle.
  Returning players review updated terms once; earlier opted-out votes remain
  excluded. See [terms behavior](../../PLAYTEST_TERMS.md).
  Aliases are assigned by the server, not supplied as identity.
- Strict 1v1 matchmaking; honest queue waiting, server countdown and random topic.
- Fresh server-generated questions from reviewed combinations, excluding each
  player's last 20 questions. The live UI never falls back to a fixed demo question.
- Server-calibrated one-minute chat and at most 10 seconds for voting. The server
  reveals as soon as all human ballots are locked, immediately against a bot.
  Reaching zero never
  submits an unselected vote or invents a reveal.
- Immutable server votes and 100 points per correct classification. Recognition
  is based on human ballots; bot opponents never invent a reciprocal vote/bonus.
- Refresh recovery, error messages with input preservation, replay, Leave, Block
  and private Report controls. Old multi-seat rooms are rejected explicitly,
  with a Leave control, rather than silently dropping participants.

`src/game.tsx` connects the shared client; `src/game-state.ts` maps server snapshots
without inventing roles or scores. `src/screens.tsx` retains Ayo's visual components.
The state-mapping checks cover phases, concealed roles, topic, ballots, points,
recognition and incompatible old rooms.

## Media and preview routes

All 25 characters are committed: 75 animated WebP loops and 25 WebP posters.
Asset checks verify the WebP format, animation flags, frame counts, loop setting,
256px dimensions and size bound. Original MP4/JPEG sources remain for regeneration;
the app exports only the WebP files. Mood changes and decorative bars are visual
cues, not remote typing or audio signals. Reduced motion uses still portraits.

`/?cast=1` opens the asset gallery. `/?preview=1` shows labelled synthetic design
examples. Neither route mounts the live game provider or silently substitutes
for a failed service. The normal root route uses Convex.

See ../../INTEGRATION.md for hosted verification and the exact tested preview.
Physical iOS/Android token persistence, playback and mobile performance remain
unverified; this delivery targets the Expo web build. The trained Mubit adapter
serving blocker remains separate from working provider replies through Mubit.
