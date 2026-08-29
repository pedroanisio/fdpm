import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "@fontsource/atkinson-hyperlegible/latin-400.css";
import "@fontsource/atkinson-hyperlegible/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
// KaTeX font CSS — bundles the Latin Modern fonts as base64 so math
// renders immediately, with no font-loading flash. Imported here once
// (instead of per-component) to dedupe.
import "katex/dist/katex.min.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
