import { useCallback, useEffect, useState } from "react";

import {
  reportBackendReachable,
  useApiDiagnostics,
} from "../services/api/apiDiagnostics";

export type ConnectivityStatus = "online" | "degraded" | "offline" | "syncing";

/**
 * navigator.onLine only reflects whether the device has a network
 * interface at all - a phone on wifi with no real internet, or a
 * backend that's simply down, both still read "online" (Phase 4 Part
 * 11). This hook combines that signal with the actual outcome of real
 * backend requests, which every apiClient request records app-wide
 * (apiDiagnostics.ts) - so Home, Map and Chat all see the same truth
 * without any polling. reportRequestOutcome remains for callers that
 * learn reachability some other way.
 */
export function useConnectivity() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  // undefined until the app has actually made a backend request.
  const { backendReachable } = useApiDiagnostics();

  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const reportRequestOutcome = useCallback((succeeded: boolean) => {
    reportBackendReachable(succeeded);
  }, []);

  const status: ConnectivityStatus = isSyncing
    ? "syncing"
    : !browserOnline
      ? "offline"
      : backendReachable === false
        ? "degraded"
        : "online";

  return {
    status,
    browserOnline,
    backendReachable,
    reportRequestOutcome,
    setIsSyncing,
  };
}

export default useConnectivity;
