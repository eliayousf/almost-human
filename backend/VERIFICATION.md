# All-human multiplayer verification

Verified 24 October 2026 against the separate Convex development deployment.

Story: three independent anonymous browser sessions join one room, exchange
messages for the full 120-second window, classify the other two participants,
and receive server-scored results and a shared leaderboard.

| Boundary | Result | Evidence |
| --- | --- | --- |
| Browser → anonymous auth | Passed | Three independent tabs received separate generated aliases and seats using actual Convex Auth JWTs. |
| Queue → persistent room | Passed | All three joined the same room and saw the same topic/deadlines. |
| Message → Agent storage → subscription | Passed | A synthetic message from each tab appeared in all three transcripts. A contact-detail message was rejected. |
| Refresh → auth/session recovery | Passed | Refreshing one tab restored the same alias, seat, transcript, and remaining time. |
| Server timer → voting | Passed | The real two-minute chat closed and all clients received the fixed voting window. No accelerated server configuration was used. |
| Ballot → score → browser | Passed | Human/Human, Human/AI, and AI/AI ballots produced 200, 100, and 0 points against all-human truth. |
| Score → leaderboard subscription | Passed | All three tabs showed the same ordering and one completed round per player. |

Automated checks: **23 passing tests** (13 Convex game tests and 10 client
transport tests), TypeScript check, typed Convex
compilation/push, playtest bundle build, shared fixture checks, and zero reported
production dependency vulnerabilities. The tests additionally exercise outsider
denial, hidden topic/roles, private/immutable ballots, missing ballots,
idempotency, duplicate settlement, late Leave at the deadline, cancellation,
blocking/rematching, optional consent, abandoned queues, and dropped connections.
Client tests cover native and React subscriptions, cached/updated results,
sanitized errors, server-clock calibration, and heartbeat/unsubscribe cleanup.

These were three automated browser sessions using synthetic text, not a usability
test with three people. The diagnostic UI is backend-owned test tooling. Cash's
public frontend, AI rooms, comprehensive public moderation, and Mubit learning
are outside this verified milestone. No training was performed.

Screenshots and transient test artifacts remain in ignored `artifacts/`; no
credentials, raw player logs, or training datasets are committed.
