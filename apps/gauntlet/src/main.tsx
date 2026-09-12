import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Deliberately not wrapped in React.StrictMode: every level fires a one-shot
// logEvent(N, "level_start") from a mount effect with no cleanup (there's
// nothing to "undo" once a WS message is sent). StrictMode's dev-only
// mount->unmount->remount double-invoke was firing that effect twice per
// page load, emitting two level_start events with near-identical
// performance.now() timestamps — visible in the scoreboard's trace log as
// "[0.02s] level_start" appearing back to back. This is dev-only (a
// production build doesn't double-invoke), but the team tests against
// `npm run dev`, so it was corrupting every trace. Fixing the effect itself
// (e.g. a per-mount ref guard) would need to be repeated in all 6 level
// components; removing StrictMode here is the single-point fix.
ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
