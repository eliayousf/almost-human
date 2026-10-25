/** Live build without VITE_CONVEX_URL: an explicit error, never a silent mock. */
export function ConfigError() {
  return <main className="screen screen--center">
    <p className="eyebrow">Configuration</p>
    <h1 className="title">Backend not configured</h1>
    <p className="dim">Set VITE_CONVEX_URL at build time and rebuild.</p>
  </main>;
}
// END ConfigError.tsx
