import { useEffect, useRef, useState } from "react";
import type { ReportReason, Seat } from "@game/game-contract";
import { command, type PlayClient } from "../../game/binding";

const REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harassment" },
  { value: "personal_information", label: "Personal information" },
  { value: "unsafe_content", label: "Unsafe content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

/** Report / Block / Leave. Reports are private backend records. */
export function SafetySheet({ game, roundId, others, onClose }: {
  game: PlayClient;
  roundId: string;
  others: readonly Seat[];
  onClose: () => void;
}) {
  const [target, setTarget] = useState(others[0]?.id ?? "");
  const [reason, setReason] = useState<ReportReason>("other");
  const [detail, setDetail] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [reported, setReported] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    return () => el?.close();
  }, []);

  async function run<T>(work: () => Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>, done: () => void) {
    if (pending) return;
    setPending(true);
    try {
      const result = await work();
      if (result.ok) done(); else setNotice(result.error.message);
    } finally {
      setPending(false);
    }
  }

  const alias = others.find(seat => seat.id === target)?.alias ?? "them";
  return <dialog ref={dialog} className="sheet" aria-label="Safety" onCancel={onClose}>
    <div className="sheet__body">
      {others.length > 1 && <label className="field">
        <span className="label">Seat</span>
        <select value={target} onChange={event => { setTarget(event.target.value); setReported(false); }}>
          {others.map(seat => <option key={seat.id} value={seat.id}>{seat.alias}</option>)}
        </select>
      </label>}
      {reported ? <p role="status">Report recorded. You can leave the round if you'd like.</p> : <>
        <label className="field">
          <span className="label">Report {alias}</span>
          <select value={reason} onChange={event => setReason(event.target.value as ReportReason)}>
            {REASONS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span className="label">Details (optional)</span>
          <textarea value={detail} maxLength={500} rows={2} onChange={event => setDetail(event.target.value)} />
        </label>
        <button type="button" className="btn btn--ghost btn--block" disabled={pending} onClick={() => {
          void run(() => game.reportParticipant(roundId, {
            ...command(), participantId: target, reason, ...(detail.trim() ? { detail: detail.trim() } : {}),
          }), () => setReported(true));
        }}>Send report</button>
      </>}
      <button type="button" className="btn btn--danger btn--block" disabled={pending || !target}
        onClick={() => { void run(() => game.blockParticipant(roundId, { ...command(), participantId: target }), onClose); }}>
        Block {alias} and leave
      </button>
      <button type="button" className="btn btn--danger btn--block" disabled={pending}
        onClick={() => { void run(() => game.leaveRound(roundId, command()), onClose); }}>
        Leave round
      </button>
      {notice && <p className="notice" role="alert">{notice}</p>}
      <button type="button" className="btn btn--plain btn--block" onClick={onClose}>Close</button>
    </div>
  </dialog>;
}
// END SafetySheet.tsx
