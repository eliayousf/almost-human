import { useRef, useState, type FormEvent } from "react";
import type { ApiResult, CreateSessionInput, SessionView } from "@game/game-contract";
import { Copy } from "../components/Copy";
import { consentCopy, POLICY_VERSION } from "../copy/consent";

/**
 * Pre-Play gate. Both required boxes must be checked by the player before a
 * profile is created; nothing is auto-accepted. Training opt-in is NOT asked
 * here: it is stored separately via setTrainingConsent from the lobby, so this
 * call records the player's actual state at this point (not opted in).
 */
export function ConsentGate({ onAccept }: {
  onAccept: (input: CreateSessionInput) => Promise<ApiResult<SessionView>>;
}) {
  const [adult, setAdult] = useState(false);
  const [rules, setRules] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const request = useRef<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!adult || !rules || pending) return;
    setPending(true);
    request.current ??= crypto.randomUUID();
    try {
      const result = await onAccept({
        clientRequestId: request.current, adultConfirmed: true, rulesAccepted: true,
        policyVersion: POLICY_VERSION, trainingOptIn: false,
      });
      if (result.ok) return;
      setNotice(result.error.message);
      // Keep the UUID only for a network retry of the same payload.
      if (result.error.code !== "SERVICE_UNAVAILABLE") request.current = null;
    } finally {
      setPending(false);
    }
  }

  return <main className="screen screen--scroll consent">
    <p className="wordmark">ALMOST HUMAN</p>
    <form className="consent__card" onSubmit={event => { void submit(event); }}>
      <Copy as="h1" slot={consentCopy.heading} />
      <Copy as="p" slot={consentCopy.aiDisclosure} />
      <Copy as="p" slot={consentCopy.processingNotice} />
      <Copy as="p" slot={consentCopy.conductRules} />
      <label className="check">
        <input type="checkbox" checked={adult} onChange={event => setAdult(event.target.checked)} required />
        <Copy slot={consentCopy.adultCheckbox} />
      </label>
      <label className="check">
        <input type="checkbox" checked={rules} onChange={event => setRules(event.target.checked)} required />
        <Copy slot={consentCopy.rulesCheckbox} />
      </label>
      {notice && <p className="notice" role="alert">{notice}</p>}
      <button className="btn btn--primary btn--block" disabled={!adult || !rules || pending}>
        <Copy slot={consentCopy.continueButton} />
      </button>
    </form>
  </main>;
}
// END Consent.tsx
