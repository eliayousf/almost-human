# Almost Human frontend: handoff (DEV / FIXTURE PREVIEW)

> **This is a dev/fixture preview, not a production-ready build.** It runs the
> 1v1 game loop on synthetic fixtures. It has not been run against the live
> Convex backend, has not been tested on a physical iPhone, and must not be
> published to players until every launch blocker below is cleared.

| | |
| --- | --- |
| Base commit | `510127256827dcad1e6b7f90f5cb5d9de911628b` (`codex/playtest-ratings-merge`) |
| Branch | `feat/ayo-1v1-ui` (no PR opened) |
| Scope | `frontend/` only; `backend/` and `shared/` are untouched |
| Toolchain | Root Nix devShell (`nix develop`), Node 22.22.3, npm 10 |

## LAUNCH BLOCKERS

1. **Consent gate copy is dev-preview PLACEHOLDER only.** Every gate string
   (and the training opt-in label/detail in the lobby) renders as
   `PENDING OWNER-APPROVED COPY — [slot]` with a dashed, hazard-striped amber
   treatment, so it cannot be mistaken for final copy. The stale playtest-v1
   copy was deliberately not reused or paraphrased. Owner-approved copy is
   required before this ever ships to players: replace the slots in
   `src/copy/consent.ts` (set `isPlaceholder: false`) and set
   `POLICY_VERSION` to the version the backend accepts for that copy.
2. **Counterpart typing signal is unbound.** No backend typing API exists. The
   counterpart's mouth moves only when a message *lands*, for a duration
   proportional to its length; your own mouth moves only from real local
   input events. `src/game/speech.ts` is the single isolated signal module
   and is explicitly marked "awaiting verified backend typing API - do not
   guess the shape". It assumes no remote field, function, or payload.
3. **strictPair is not deployable yet.** `strictPair` is accepted only by a
   NOT-yet-deployed backend branch and is not declared in
   `shared/game-contract.ts`. The deployed validator (backend at `5101272`)
   rejects the field, so it must never be sent against it. The
   flagged live adapter (`src/game/live.tsx`) sends it only when
   `VITE_STRICT_PAIR=true`, using exactly
   `JoinQueueInput extends CommandInput { strictPair?: boolean }` declared
   locally. That flag must stay off (absent) until the strict backend is
   deployed and the contract declares the field. With the flag absent the
   field is compiled out and `joinQueue` sends the plain `CommandInput`.
4. **Portraits are procedural dev placeholders,** not production-cleared art
   (`src/assets/portraits/*.svg`). Final cleared photographic portraits are
   a drop-in via `src/assets/portraits.ts` (see "Portraits" below).

Further items the owner should know before launch:

- **Strict 1v1 is not enforced by this UI.** The deployed backend seats 2-5
  participants with 0-2 bots. The UI renders `participants` by array length:
  2 seats get the 1v1 layout; larger rooms get one tile and one verdict
  card per seat (the reference sheet's multi-seat layout), and the mouth and
  burst follow the last counterpart to speak. Only the fixture adapter forces
  2 seats, and it is labelled
  fixture-only in the UI and in `src/game/fixtures/twoSeat.ts`.
- **Contract note:** `YourRoundResult.votes` is typed `Two<Guess> | null`
  (deprecated tuple), but a 2-seat room casts one guess. The UI reads it as
  `readonly Guess[]`; the fixture client casts at one commented line. The
  contract itself was not changed.
- **Not yet verified:** live-backend integration, physical iPhone Safari
  (keyboard, safe areas, 60fps), and real network conditions. Desktop
  Chromium automation at iPhone viewport size is not an iPhone test.
- Public-launch gates from `CASH_HANDOFF.md` (moderation, operator review,
  retention/deletion) are backend-owned and are not addressed by UI work.

## Commands

From the repository root (inside `nix develop`, or the managed Node 22 runtime):

```sh
npm --prefix frontend install       # or: cd frontend && npm install
npm --prefix frontend run dev       # fixture mode: synthetic 2-seat loop, no network
npm --prefix frontend run typecheck
npm --prefix frontend run build:fixtures   # static fixture preview -> frontend/dist
npm --prefix frontend run build     # live mode; needs VITE_CONVEX_URL (owner, at deploy)
npm --prefix frontend run budget    # soft ~100 KB gz critical-path report (warning only)
```

`backend/` needs no `npm install`: the shared sources resolve `react`,
`convex`, and `@convex-dev/auth` from `frontend/node_modules` (Vite
`resolve.dedupe` plus matching `tsconfig.json` paths).

## Modes and env flags

| Mode | How | Adapter | Network |
| --- | --- | --- | --- |
| fixtures | `vite --mode fixtures` (`dev`, `build:fixtures`) | `src/game/fixtures/*` | none |
| live | `vite --mode live` (`dev:live`, `build`) | `src/game/live.tsx` | `VITE_CONVEX_URL` only |

The mode is fixed at build time; the other adapter is tree-shaken out
(fixture builds contain no Convex client; live builds contain no fixtures).
A live build without `VITE_CONVEX_URL` renders an explicit "Backend not
configured" screen. It never falls back to mock data.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_CONVEX_URL` | unset | Public Convex cloud URL, injected by the repo owner at deploy. |
| `VITE_INDEPENDENT_PLAYTEST_TABS` | unset | Desktop testing only: sessionStorage identity per tab. |
| `VITE_STRICT_PAIR` | unset | `true` ONLY after the strict backend is deployed and integration is permitted (blocker 3). |

The live adapter uses the shared `AlmostHumanProvider` and hooks verbatim.
`createSession`, `getSession`, `setTrainingConsent`, `joinQueue`,
`getQueue`, `leaveQueue`, `getRound`, `sendMessage`, `submitVotes`,
`leaveRound`, `reportParticipant`, `blockParticipant`, and `getLeaderboard`
go through it. `heartbeat` and `clockNow` are driven internally by the shared
client while queue/round hooks are mounted. Every command uses a fresh
`clientRequestId`, reused only to retry the same payload after
`SERVICE_UNAVAILABLE`.

## Dependency manifest (all exact versions)

| Package | Version | Kind | Why |
| --- | --- | --- | --- |
| react | 19.3.1 | runtime | per CASH_HANDOFF.md |
| react-dom | 19.3.1 | runtime | per CASH_HANDOFF.md |
| convex | 1.48.0 | runtime | per CASH_HANDOFF.md (live mode only) |
| @convex-dev/auth | 0.0.96 | runtime | per CASH_HANDOFF.md (live mode only) |
| vite | 8.3.5 | dev | build/dev server (version verified in CASH_HANDOFF.md) |
| @vitejs/plugin-react | 6.1.2 | dev | React transform |
| typescript | 7.0.2 | dev | typecheck (matches backend) |
| @types/react | 19.3.0 | dev | types |
| @types/react-dom | 19.3.0 | dev | types |
| @types/node | 22.20.5 | dev | types for `vite.config.ts` |
| @fontsource/space-grotesk | 5.3.0 | dev | self-hosted display font (OFL), latin 500/700 |
| @fontsource/ibm-plex-mono | 5.3.0 | dev | self-hosted label font (OFL), latin 400/500 |

The lockfile resolves every package from `https://registry.npmjs.org` only.

## Network manifest

| When | Origin | Purpose |
| --- | --- | --- |
| Install (build time) | `https://registry.npmjs.org` | npm packages (lockfile) |
| Runtime, live mode | the `VITE_CONVEX_URL` origin (HTTPS + WSS) | game API, anonymous auth, heartbeat, clock |
| Runtime, fixture mode | none | fully offline after page load |

Fonts and portraits are bundled and served from the app's own origin. There
are no CDNs, no analytics, no external images, and no third-party scripts.
Strings such as `docs.convex.dev` or `react.dev` inside the bundles appear
only in library error messages and are never fetched.

(`npm run dev` also opens Vite's local HMR WebSocket to the dev server
itself; that is loopback tooling, not an app origin.)

## Screens (routed purely by server state)

Connecting → **Consent gate** (UNAUTHENTICATED session; both required boxes
must be checked; `createSession` sends `trainingOptIn: false`; training opt-in
is stored separately from the lobby via `setTrainingConsent`) → **Lobby**
(alias, score, Play, training toggle, leaderboard) → **Waiting for a
counterpart** (elapsed time counts up from `joinedAt`; no countdown, ETA, or
fallback; Cancel calls `leaveQueue`, and a closed ticket shows "Ticket closed"
with Join again) → round:

The round screens follow the charcoal 4-screen reference sheet (Room / On
air / Verdict / Reveal), adapted to 1v1. Every screen has a header strip with
a red on-air dot, a centred mono label, and MENU (Report / Block / Leave).

1. **Room** (`countdown`): "Your room", portrait tiles facing each other
   (stranger, then your hatched, amber-edged seat), a big 3-2-1, and the
   tonight's-topic card sealed until start.
2. **On air** (`chat`): "ROUND n · m:ss" with an amber progress bar,
   portrait tiles, the amber topic card, the transcript (mono speaker label
   over each line; your lines bold), and a "Convince them…" field with SEND
   inside.
3. **Verdict** (`voting`): "Who's human?", segmented amber timer dashes, a
   card per other seat with a HUMAN|MACHINE pill, your amber card ("The
   room's read on you ? ? ?"), then an explicit Lock (ballots are immutable;
   an unsubmitted ballot scores 0). The locked state follows `ownBallot`.
4. **Reveal** (`reveal`): "Who was real?", a card per seat with "You said X
   ✓/✗" and an outline stamp from the server-provided `kind`, one
   reciprocal line, +points (100 per correct call), streak, total, a
   recognition bar, and Next room. With `fraction === null` the line reads
   "Unrated. No human judged you this round." and the bar is empty and
   marked "Not rated" (never a verdict).

Deliberate deviations from the reference sheet, required by the brief:
- No "is typing…" line (no typing API; blocker 2).
- No audio waveform (no audio exists).
- No per-person attribution ("X voted you the machine"); only the aggregate.
- No TELL flags (not in the API).
- An explicit Lock replaces "all votes lock when the timer hits zero".
- Your seat keeps a face under the hatching so own-typing mouth feedback shows.
- Round numbers are a display-only, per-browser-session counter; the API
  has none.
- Rooms with 3+ seats render one tile/card per seat, the sheet's multi-seat
  layout.

Cancelled rounds show the server message with Next room. A settled reveal
is kept on screen after the server clears `activeRoundId`. There is no
betting/wager UI, no multi-room mechanics, and no audio.

Fixture-only controls sit behind the dashed "FIXTURE MODE" strip: skip to
the next phase, choose the next counterpart (alternate/human/AI), choose the
queue behaviour (pair, or wait indefinitely), and send `/blocked` or
`/ratelimit` to preview the shared error fixtures.

## Animations (both fully off under `prefers-reduced-motion`)

**Mouth flap**: `src/fx/mouth.ts`. A separate layer over the portrait does a
3-frame stepped `scaleY` flap, rAF-driven, writing only transform/opacity,
and stops cleanly. Your seat's mouth is driven by local input/keydown events.
The counterpart's mouth is driven by message arrival via `src/game/speech.ts`
(`clamp(len × 55ms, 650ms, 6.5s)`). Messages already present on
resume/refresh stay silent.

**Datamosh burst**: `src/fx/datamosh.ts`. It runs for 480ms on the stranger
portrait panel only, on round start, verdict lock, and reveal; resumed
snapshots don't burst. It uses one shared WebGL2 context/canvas, moved into
the bursting frame, and both portraits in a single texture atlas uploaded
once. The fragment shader does block motion vectors with directional smear,
stale macroblocks, and chroma bleed under an intensity uniform. The rAF loop
runs only during the burst, and frames allocate nothing. It falls back to
CSS clip-path slices animated with `translateX` when there is no WebGL2,
`failIfMajorPerformanceCaveat` trips, `deviceMemory < 2`, the context is lost,
or the atlas is tainted. Text and controls render above the burst layer and
are never distorted.

## Portraits

`src/assets/portraits.ts` is the only module that knows about portrait
files. To drop in final cleared photographs: add the AVIF (+ optional WebP
`fallbackSrc`) files, change the two imports, set `placeholder: false`, and
re-measure each `mouth` anchor (centre x/y and size as fractions of a 4:5
plate). The UI, the mouth layer, and the WebGL atlas all read from that
module. Images load lazily and are prefetched once a player exists. Portrait
choice is by seat position only and never encodes a role.

## Performance

- Critical path (gz): fixtures ≈ 77.5 KB, live ≈ 96.6 KB (react-dom alone
  is ≈ 60 KB). The round screens are a lazy chunk (≈ 8 KB JS + 2.5 KB CSS),
  prefetched once the session exists. `npm run budget` reports this (soft goal, warning only).
- Animations are transform/opacity only. The film grain is a restrained static
  overlay (3% opacity).
- Layout uses safe-area insets and 100dvh, refined by `visualViewport`
  (`src/ui/viewport.ts`), so the keyboard compresses the portrait and
  transcript and the composer stays visible. Inputs are ≥ 16px, touch targets
  ≥ 44px, and nothing depends on hover.

## Full file list (all under `frontend/`)

| File | Role |
| --- | --- |
| `package.json`, `package-lock.json` | manifest + lockfile (exact pins) |
| `index.html` | viewport-fit=cover, interactive-widget, theme colour |
| `vite.config.ts` | `@game` alias, dedupe, fs.allow, Safari 16.4 target |
| `tsconfig.json` | strict TS; shared-source package paths |
| `.env.example` | documented env flags (no values) |
| `HANDOFF.md` | this file |
| `scripts/check-budget.mjs` | soft gzip budget report |
| `src/main.tsx` | build-time adapter choice, mount |
| `src/App.tsx` | server-state routing; lazy round chunk |
| `src/styles.css` | tokens, grain, shell screens, sheet, fixture strip, reduced motion |
| `src/vite-env.d.ts` | env typings |
| `src/game/binding.tsx` | adapter interface (`GameBinding`, `PlayClient`) |
| `src/game/live.tsx` | live adapter: shared provider/hooks; strictPair gate |
| `src/game/speech.ts` | counterpart speech signal (typing API UNBOUND) |
| `src/game/fixtures/client.ts` | synthetic in-memory game client |
| `src/game/fixtures/binding.tsx` | fixture provider + hooks |
| `src/game/fixtures/twoSeat.ts` | fixture-only 2-seat composition from `shared/fixtures.ts` |
| `src/game/fixtures/FixturePanel.tsx` | dev controls behind the FIXTURE MODE strip |
| `src/assets/portraits.ts` | the single portrait assets module |
| `src/assets/portraits/stranger.svg`, `self.svg` | procedural DEV PLACEHOLDERS |
| `src/fx/datamosh.ts` | shared WebGL2 burst + atlas |
| `src/fx/mouth.ts` | mouth flap driver |
| `src/fx/motion.ts` | reduced-motion source |
| `src/ui/viewport.ts` | visual-viewport sizing for the keyboard |
| `src/copy/consent.ts` | PLACEHOLDER copy slots + `POLICY_VERSION` |
| `src/components/Portrait.tsx` | plate, mouth layer, burst layers |
| `src/components/Copy.tsx` | placeholder-aware copy renderer |
| `src/screens/Consent.tsx`, `Lobby.tsx`, `Waiting.tsx`, `Status.tsx`, `ConfigError.tsx` | shell screens |
| `src/screens/round/Round.tsx` | round shell: focus, bursts, speech, menu |
| `src/screens/round/Paired.tsx`, `OnAir.tsx`, `Verdict.tsx`, `Reveal.tsx` | the four reference screens |
| `src/screens/round/parts.tsx` | header strip, topic card, seat tiles |
| `src/screens/round/Composer.tsx`, `Transcript.tsx`, `SafetySheet.tsx` | chat input, log, Report/Block/Leave |
| `src/screens/round/round.css` | round-screen styles (lazy) |

## How this was verified (desktop automation, not an iPhone)

Run in the root Nix devShell (Node 22.22.3) with Playwright's preinstalled
Chromium at a 390×844 mobile viewport, against `npm run dev` (fixtures):

- `npm run typecheck` is clean, including the shared backend client sources.
- `vite build` passes in fixtures and live mode. The live bundle contains
  the shared client (`game:joinQueue`, `game:heartbeat`, `game:clockNow`) and
  no fixtures; with `VITE_STRICT_PAIR` unset it contains no `strictPair`. The
  fixture bundle contains no Convex client.
- The full loop ran twice: consent → lobby → waiting (lone ticket) → Cancel
  (`QUEUE_CLOSED` path) → Play → Room → On air → Verdict lock → Reveal, with
  zero console errors or warnings. Both reveal states were shown: rated
  ("They believed you.") and the AI-counterpart unrated empty state.
- Bursts: 3 WebGL bursts (start, lock, reveal) with SwiftShader WebGL2, and 3
  CSS-slice bursts with WebGL disabled.
- Mouths: your-seat flap fires while typing (open mouth ≈ 19px on the tile);
  the counterpart flap fires on message arrival.
- `prefers-reduced-motion: reduce`: 0 bursts, 0 mouth frames, loop intact.
- Keyboard simulation (viewport height − 336px): the composer stays visible
  and inside the visible area.
- The live backend was never contacted. No physical iPhone was tested.

