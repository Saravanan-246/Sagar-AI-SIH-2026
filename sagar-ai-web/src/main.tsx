import React from "react";
import ReactDOM from "react-dom/client";

import App from "./app/App";
import "./styles/globals.css";
import "./styles/theme.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

/*
 * Registered only for a production build - Vite's dev server serves
 * modules on demand via its own HMR pipeline, which a caching service
 * worker would fight with (stale cached modules during active
 * development). The offline app-shell capability this exists for
 * (Phase 4) is only meant to apply to the real deployed/built app.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.warn("Sagar: service worker registration failed:", error);
    });
  });
}