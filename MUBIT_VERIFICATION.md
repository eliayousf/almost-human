# Mubit integration verification

Checked 24 October 2026 against the hosted service and signed-in console.

**The corrected-reply → trained adapter → application response path is not
verified. Do not make it a dependency of the game yet.**

Follow-up: the engine record has a separate `correction` field, but it is
`null` for our saved feedback. The processed chat task has **0 kept examples,
1 rejected example, and first training not started**. Direct server probes of
the console's feedback and adapter-chat routes both returned **403 `invalid
admin token`** with the existing project inference key.

## Results

| Check | Result |
| --- | --- |
| Server makes a chat call through Mubit | Verified: HTTP 200, recorded in Requests |
| Console stores a rating and suggested replacement | Verified: saved as Bad plus a comment |
| Replacement becomes the actual training target | Failed through the tested form: `correction: null`; example rejected |
| App key submits a separate correction to the console route | Rejected: HTTP 403 `invalid admin token` |
| Adapter trains from those corrected chat targets | Unverified: no chat training batch or job was started |
| App key calls the console's adapter inference route | Rejected: HTTP 403 `invalid admin token` |
| Application receives a fresh reply from a new chat adapter | Unverified: no new chat adapter exists; automatic routing not exercised |

The successful call's console details identify **Your provider**, decision
`direct`, model `gpt-6-luna`, and no adapter version. It is provider connectivity
evidence, not adapter serving evidence.

## Live experiment

The server probe in `scripts/mubit-preflight.mjs` sends a fixed synthetic
conversation. It keeps the key in the server process, makes no automatic retries,
caps inference attempts at three, and saves receipts under ignored `artifacts/`.

Three potentially billable inference attempts were reserved:

1. HTTP 400: the provider rejected `metadata` without provider-side storage.
2. HTTP 200 after removing that field. Mubit derived a session from the
   conversation prefix; this was visible in the console.
3. HTTP 403 from the console's adapter-chat route with the inference key. A
   pre-existing, unrelated diagnostic adapter was used only to test access.
   No adapter reply was obtained; this is not chat training evidence.

No provider-storage setting was enabled to work around the first error.
The successful request was explicitly marked for full Mubit recording because
the conversation is synthetic and this experiment needs inspectable content.

In the signed-in console, the successful reply was rated Bad with a suggested
replacement in the Comment field. The saved Rating section showed that comment;
the Response section still showed the original provider answer. This establishes
feedback storage. It does **not** establish what a later training dataset uses.
The raw trace subsequently confirmed `feedback[0].correction: null`. After task
discovery, its details reported one usable call, zero kept, one rejected, zero
sessions with kept examples, and first training not started. The comment did
not become an accepted corrected example in this test. `Trainable: yes`
describes capture eligibility; it did not mean the example was accepted.

The console's public feedback-form implementation constructs a payload with
`rating` and optional `comment`. No separate replacement field is sent by that
form. The public SDK inspected (`mubit-sdk` 0.13.2) did not establish a
corrected-chat-target training method; its feedback interfaces concern memory
and agent handoffs.

The inference key reached the provider model-list endpoint. Requests to the
console's adapter configuration, health, feedback, and adapter-chat routes
returned HTTP 403 (`invalid admin token`). The relevant POST routes were:

- `https://app.mubit.ai/mapi/engine/v2/traces/{trace_id}/feedback`
- `https://app.mubit.ai/mapi/playground/chat`

The feedback probe included a separate `correction` value. Authorization failed
before payload semantics could be verified; that proposed payload is not a
verified correction-submission contract.

The adapter-chat probe used the console client's selector format,
`adapter:{adapter_id}@v{version}`. That format belongs to the comparison route;
it has not been established as a model ID for the normal provider gateway.

Signed-in browser navigation could read health and trace records with the
existing console session. Health reported `edition: hosted`, `serving.on: true`,
and `console_auth.mode: session`. No session credential was exported. Automatic
adapter rollout remains a separate potential application-serving path; it was
not tested because no corrected target was accepted and no chat adapter exists.

Other paths inspected: the public console client, official GitHub examples,
the SDK wheel, and the checksum-verified official CLI archive's command
reference. That CLI covers account/runtime management, not corrected chat
training or adapter inference. The client references a local file-training
page, gated out of the hosted edition. Neither established an alternative
for this hosted app. No CLI was installed or executed.

## What the current documentation establishes

- [First adapter](https://docs.mubit.ai/guides/first-adapter): recorded, kept
  examples can trigger automatic training; the default first threshold is
  25 kept examples. Training and passing are separate outcomes.
- [Plain HTTP](https://docs.mubit.ai/guides/connect-http): training uses kept
  recorded calls. This does not specify a human replacement-target API.
- [Model IDs](https://docs.mubit.ai/guides/model-ids): the normal hosted API
  does not accept an adapter name as its model ID; the documented comparison
  path is Try models in the console.
- [API reference](https://docs.mubit.ai/reference/api): the app should use a
  server-side provider-prefixed gateway URL. The project's Connect page matched
  the URL used by the successful probe.

Private, self-hosted, or newly introduced capabilities may differ. The absence
of a documented operation is not proof that Mubit has no internal capability.
It is insufficient evidence for promising this integration in the game.

## Remaining acceptance gate

Obtain the supported payload/endpoint that submits an approved replacement as
the supervised target, and a supported app-serving route for the resulting
adapter/version. Then:

1. Inspect an accepted dataset row containing the intended replacement.
2. Collect enough independent, eligible synthetic conversations for the same
   task; keep evaluation conversations separate.
3. Observe the completed job and its evaluation, preserving dataset and version IDs.
4. Call that version from server code on fresh input. Verify serving provenance
   linking the response to the trained adapter; a provider fallback fails this check.

One corrected reply can demonstrate ingestion semantics, but is not enough to
meet the documented default training threshold or demonstrate general improvement.

The unresolved integration requirement is an application credential authorized
to submit corrected targets, plus a verified serving mechanism for the resulting
version. Console-session access and an inference-only key are distinct. A
personal console session should not become the game's permanent backend credential.

## Reproduce provider connectivity

Use the existing Nix devShell. Supply an existing key through `MUBIT_API_KEY` or
an explicit local environment file; never put the key in source or command arguments.

```sh
nix develop -c node scripts/mubit-preflight.mjs models --env-file /absolute/path/to/.env
nix develop -c node scripts/mubit-preflight.mjs chat --env-file /absolute/path/to/.env
```

The `chat` command consumes one of the three local attempts even if the provider
rejects it or it times out. The probe does not submit replacement training
targets, launch jobs, or claim an adapter answered. `adapter-access` reproduces
the comparison-route authentication check when `MUBIT_DIAGNOSTIC_ADAPTER` names
an existing adapter selector; it also consumes an attempt. There is no hardcoded
workspace adapter in the shared source. The original local three-attempt counter
has been reached and is not automatically reset. It is a local counter, not an
account-wide Mubit quota. For frontend work, use the synthetic fixtures instead
of sending live model requests.

Local receipts and UI evidence are in `artifacts/mubit-chat-verification/`,
including `request-feedback.txt`, `request-feedback.png`, `raw-trace.txt`,
`task-after-correction.txt`, `task-after-correction.png`,
`correction-api-probe.json`, and `adapter-access-*.json`. Those files are
excluded from Git. No game code or deployment was added during this check.
