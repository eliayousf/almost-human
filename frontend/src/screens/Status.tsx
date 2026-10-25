/** Connecting / loading / error states. Errors are explicit; nothing is faked. */
export function StatusScreen({ title, detail, action }: {
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}) {
  return <main className="screen screen--center">
    <p className="wordmark wordmark--small">ALMOST HUMAN</p>
    <h1 className="title" role="status">{title}</h1>
    {detail && <p className="dim">{detail}</p>}
    {action && <button type="button" className="btn btn--primary" onClick={action.onClick}>{action.label}</button>}
  </main>;
}
// END Status.tsx
