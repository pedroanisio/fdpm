import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
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
