# How the bots learn from each round

At the end of every round, the votes decide whether each bot passed as human or got found out. That verdict feeds two loops.

```
round settles ──► votes from training-opted-in players only
                  most said "human" → passed 👍   most said "AI" → caught 👎   tie → no verdict
        │
        ├─► fast loop (next round): the newest passed and caught bot lines go into the
        │   next bot prompts ("sound more like these, less like those")
        │
        └─► slow loop (Mubit): each verdict is sent to Mubit as a Good/Bad rating on that
            exact call; Mubit trains its adapter from the calls it keeps
```

- Code: `backend/convex/ratings.ts` (verdicts, lessons, progress) and `backend/convex/mubitConsole.ts` (Mubit ratings).
- Every bot line is stored in `botCalls` with its Mubit request ID (`mreq_…`), verdict, rating status and the model that served it.
- The bot system prompt is now identical for every call. Mubit groups calls into one task, and trains one adapter, only when the instructions match exactly. The alias, style, difficulty and lessons travel in the user message.
- Lessons are bot-written lines only, never players' messages.

## Switches (Convex environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `BOT_LESSONS_ENABLED` | on | `false` stops passed/caught lines being shown to the bots |
| `MUBIT_RATINGS_ENABLED` | off | `true` sends verdicts to Mubit after each round |
| `MUBIT_CONSOLE_COOKIE` | none | `__client=…` cookie from a Mubit console login (see below) |
| `MUBIT_PROJECT` | first project | Mubit project slug holding the game's calls |

Mubit has no public rating API: the game's Mubit key is refused (403) by the rating route. Ratings go through the console's own API with a console login, which is undocumented and can change. The login can do everything in that Mubit account, so keep it only as a Convex secret, use it for the demo, and sign out of that console session afterwards. It must belong to the Mubit account whose project receives the game's calls.

To get the cookie: sign in at app.mubit.ai, open the browser developer tools → Application → Cookies → `https://clerk.mubit.ai`, and copy the `__client` value. Then:

```
npx convex env set MUBIT_CONSOLE_COOKIE "__client=<value>"
npx convex env set MUBIT_RATINGS_ENABLED true
```

Mubit's project settings must also allow training (Settings → Training) for ratings to turn into adapter versions.

## Mubit trains only on the 👍 lines

Confirmed in Mubit's console code and on a live task: a task's "kept examples", the calls Mubit trains on (first training at 25), are exactly its `rated_up` calls. So "passed as human" lines (👍) are kept and trained on, and "found out" lines (👎) are not. Ratings work as latest entry wins, and Mubit's own automatic rater (`adapters.rate.max_per_day`, 200 a day by default) could otherwise add or overwrite ratings. Set it to 0 so that only players' verdicts decide what is kept:

```
PATCH https://app.mubit.ai/mapi/engine/v2/loop/policy?project=<slug>&env=production
{"adapters.rate.max_per_day": 0}
```

Leave Grading (`evals.judge`) off as well.

## Is it getting more human?

```
npx convex run ratings:progress
npx convex run ratings:progress '{"bucket": 5}'
```

The fooled rate is the share of opted-in votes on bot seats that said "human". The report gives:

- `trend`: fooled rate per group of bot seats, oldest first. It should rise.
- `byServedBy`: `provider` versus a Mubit adapter (`adapter:<version>`) once Mubit starts serving one.
- `byLessons`: seats that had lessons in their prompt versus those that didn't.
- `mubitRatings`: how many verdicts reached Mubit.

Validated on a local Convex backend against real Mubit across three rounds: every verdict reached Mubit as the matching rating, later prompts carried earlier lessons, all calls landed in one Mubit task, and the task's kept-example count rose with each 👍.
