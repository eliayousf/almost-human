# Almost Human — React Native UI

This is the React Native / Expo source for the current
https://almost-human-playtest-chi.vercel.app UI, imported from
`CashpointSoulja/almost-human` commit `e558ffdb9286fd9954ba8fe8a99c85f50fcdd8b5`.
It lives alongside the existing frontend work so importing it does not replace
backend code, shared contracts, or the Vite frontend on other branches.

## Run and build

```sh
cd frontend/expo
npm ci
npm test
npm run typecheck
npm run build:web
npm start
```

Use the repository's Nix shell when available. The imported source was checked
with Node 26.8.1 / npm 11.19.0; Nix was not available on the importing Mac.
The Expo build currently requires Node 22 or later.

The web app uses `/api` on the same origin. The scoped `vercel.json` builds this
folder and proxies those routes to the existing Render game service. To deploy
this exact version, select `frontend/expo` as the Vercel project's root directory.
This PR does not change the root deployment configuration or publish a site.

For a physical native device, copy `.env.example` to `.env` and set
`EXPO_PUBLIC_API_URL` to the reachable game server URL. No secret belongs in this
client. AI replies require the server's private Mubit configuration.

## Assets

All 25 characters are checked into this repository: 75 animated WebP loops plus
25 static WebP posters under `assets/cast/loops/`. Animated loops are 256 × 256,
8 fps, approximately 30 KB each on average and no more than 59 KB in this set.
Only visible gallery cards animate; reduced motion uses still portraits.
Original MP4/JPEG sources are retained for regeneration but are not referenced
or exported by the app. The app does not use a video player.

`/?cast=1` opens the asset gallery. `/?preview=1` shows explicitly labelled
synthetic screen examples. The normal route uses the existing live game API.

## Integration boundary

This preserves the current UI and its existing two-seat Node/Render API.
It is **not integrated with this repository's Convex GameClient** and must not
be presented as such. Adapting it to `shared/game-contract.ts` is separate work;
no shared types, Convex settings, consent flow, or backend implementation was
modified by this import. The existing Vite frontend and other feature branches
remain available.

Checks for this import: exact source-file comparison, asset validation,
TypeScript, and web export. Physical iOS/Android playback and mobile performance
remain unverified. The Expo CLI dependency advisories recorded in the source
project remain unresolved; no forced SDK downgrade was applied.
