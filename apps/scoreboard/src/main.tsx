import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import StatsPage from "./stats/StatsPage";
import "./styles.css";
import "./cockpit.css";

// Two pages, one app (PRD v2 §20): "/" is the game view / live board, "/stats" is the
// stats page (§10). No router dependency — a path check is enough for two routes.
const Page = window.location.pathname.startsWith("/stats") ? StatsPage : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Page />
  </React.StrictMode>
);
