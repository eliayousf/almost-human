import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "./styles.css";
import { App } from "./App";
import { BindingProvider, type AdapterModule } from "./game/binding";
import { trackVisualViewport } from "./ui/viewport";

// The adapter is fixed at build time by Vite's mode, so the unused adapter is
// dropped from the bundle: fixture builds contain no Convex client, and live
// builds contain no fixtures.
const adapter: Promise<{ default: AdapterModule }> = import.meta.env.MODE === "fixtures"
  ? import("./game/fixtures/binding")
  : import("./game/live");

trackVisualViewport();

void adapter.then(({ default: { binding, Root } }) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root>
        <BindingProvider value={binding}>
          <App />
        </BindingProvider>
      </Root>
    </StrictMode>,
  );
});
// END main.tsx
