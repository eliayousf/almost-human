import { useState } from "react";
import type { CounterpartPlan, FixtureGameClient, QueuePlan } from "./client";

/** Dev-only controls; rendered only by the fixture adapter, never in live builds. */
export function FixturePanel({ client }: { client: FixtureGameClient }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<CounterpartPlan>(client.plan);
  const [queuePlan, setQueuePlan] = useState<QueuePlan>(client.queuePlan);
  return <aside className="fixture" aria-label="Fixture mode controls">
    <button type="button" className="fixture__tag" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      FIXTURE MODE · synthetic 2-seat data
    </button>
    {open && <div className="fixture__body">
      <p>Dev preview on synthetic fixtures. No backend, no real players. The 2-seat
        pairing is fixture-only; strict 1v1 matchmaking is a pending backend change.</p>
      <button type="button" onClick={() => client.skipPhase()}>Skip to next phase</button>
      <label>Next counterpart
        <select value={plan} onChange={event => {
          const next = event.target.value as CounterpartPlan;
          client.plan = next; setPlan(next);
        }}>
          <option value="alternate">Alternate</option>
          <option value="human">Human</option>
          <option value="ai">AI</option>
        </select>
      </label>
      <label>Queue
        <select value={queuePlan} onChange={event => {
          const next = event.target.value as QueuePlan;
          client.queuePlan = next; setQueuePlan(next);
        }}>
          <option value="pair">Pair after a short wait</option>
          <option value="wait">No counterpart (waits indefinitely)</option>
        </select>
      </label>
      <button type="button" onClick={() => client.seatWaiting()}>Seat waiting ticket now</button>
      <p>Send <code>/blocked</code> or <code>/ratelimit</code> to preview error fixtures.</p>
    </div>}
  </aside>;
}
