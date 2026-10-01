import { lazy, Suspense } from "react";
import { BrowserRouter } from "react-router-dom";

import Router from "./router";
import { SHOW_DIAGNOSTICS } from "../services/api/apiConfig";

// Development only (or VITE_SHOW_DIAGNOSTICS=true): never loaded in a
// normal production build.
const DevDiagnostics = SHOW_DIAGNOSTICS
  ? lazy(() => import("../components/dev/DevDiagnostics"))
  : null;

export default function App() {
  return (
    <BrowserRouter>
      <Router />
      {DevDiagnostics && (
        <Suspense fallback={null}>
          <DevDiagnostics />
        </Suspense>
      )}
    </BrowserRouter>
  );
}
