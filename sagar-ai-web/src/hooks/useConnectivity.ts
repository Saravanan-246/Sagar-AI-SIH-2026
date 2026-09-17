import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectivityStatus = "online" | "degraded" | "offline" | "syncing";

/**
 * navigator.onLine only reflects whether the device has a network
 * interface at all - a phone on wifi with no real internet, or a
 * backend that's simply down, both still read "online" (Phase 4 Part
 * 11). This hook combines that signal with the actual outcome of real
 * requests the app makes: any caller can report a request's success
 * or failure via reportRequestOutcome, which is exactly what
 * useSagar's existing backend-unreachable catch path already detects -
 * no new polling, just listening to failures that already happen.
 */
export function useConnectivity() {
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  // Tracks whether the most recent real backend request succeeded -
  // undefined until the app has actually tried one.
  const [backendReachable, setBackendReachable] = useState<boolean | undefined>(
    undefined
  );

  const [isSyncing, setIsSyncing] = useState(false);

  const lastFailureAt = useRef<number | null>(null);

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
    setBackendReachable(succeeded);
    if (!succeeded) {
      lastFailureAt.current = Date.now();
    }
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
