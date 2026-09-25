import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { APP_CONFIG } from "../constants/config";
import {
  fetchMarineModelGrid,
  type MarineModelGridResponse,
} from "../services/api/sagarApiClient";

type UseMarineModelGridOptions = {
  /** Only fetch while something on screen actually uses the grid
   * (e.g. a map model layer is on, or a conditions panel is visible). */
  enabled: boolean;
  /** A real, already-known connectivity outcome - never fetched while
   * offline, so offline mode never pretends this external grid is
   * available. */
  offline?: boolean;
  /** Opt-in periodic refresh. Omitted = fetch once while enabled (the
   * original behaviour). Pauses while the tab is hidden. */
  pollIntervalMs?: number;
};

const { requestTimeoutMs, retryBaseDelayMs } = APP_CONFIG.marine.modelGrid;

// Without polling, a response this recent is reused rather than
// refetched when another screen mounts the hook.
const REUSE_WITHOUT_POLLING_MS = 5 * 60 * 1000;

/*
 * Module-level: every mounted consumer (Home panel, map layers, lab)
 * shares one last-good response and at most one request in flight, so
 * navigating between screens never multiplies requests to the backend.
 */
let shared: { data: MarineModelGridResponse | null; receivedAt: number } = {
  data: null,
  receivedAt: 0,
};
let inFlight: { promise: Promise<MarineModelGridResponse>; controller: AbortController } | null =
  null;
let subscribers = 0;

function requestGrid(): Promise<MarineModelGridResponse> {
  if (inFlight) {
    return inFlight.promise;
  }

  const controller = new AbortController();

  const promise: Promise<MarineModelGridResponse> = fetchMarineModelGrid({
    signal: controller.signal,
    timeoutMs: requestTimeoutMs,
  })
    .then((result) => {
      if (result.status === "success" && result.points.length > 0) {
        shared = { data: result, receivedAt: Date.now() };
      }
      return result;
    })
    .finally(() => {
      if (inFlight?.promise === promise) {
        inFlight = null;
      }
    });

  inFlight = { promise, controller };
  return promise;
}

function describeFailure(err: unknown): string | null {
  if (axios.isCancel(err)) {
    return null;
  }

  if (axios.isAxiosError(err) && err.code === "ECONNABORTED") {
    return "Marine model request timed out.";
  }

  return "Marine model unavailable.";
}

export function useMarineModelGrid({
  enabled,
  offline = false,
  pollIntervalMs,
}: UseMarineModelGridOptions) {
  // Last good response - kept through later failures so the UI can
  // show "last known" (clearly aged) instead of blanking.
  const [data, setData] = useState<MarineModelGridResponse | null>(shared.data);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    subscribers += 1;

    return () => {
      mountedRef.current = false;
      subscribers -= 1;

      // Nobody left to use the answer - cancel the request outright.
      if (subscribers === 0 && inFlight) {
        inFlight.controller.abort();
        inFlight = null;
      }
    };
  }, []);

  /** Resolves true only for a usable, successful response. */
  const load = useCallback(async (): Promise<boolean> => {
    if (offline) {
      setError("Marine model unavailable while offline.");
      return false;
    }

    setLoading(true);

    try {
      const result = await requestGrid();
      if (!mountedRef.current) return false;

      if (result.status === "success" && result.points.length > 0) {
        setData(result);
        setError(null);
        return true;
      }

      setError(result.message ?? "Marine model unavailable.");
      return false;
    } catch (err) {
      if (!mountedRef.current) return false;

      const message = describeFailure(err);
      if (message) {
        console.warn("Marine model grid request failed:", err);
        setError(message);
      }
      return false;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [offline]);

  useEffect(() => {
    if (!enabled || offline) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    let dueWhileHidden = false;

    const schedule = (delayMs: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, Math.max(0, delayMs));
    };

    async function run() {
      if (cancelled) return;

      if (pollIntervalMs && document.hidden) {
        dueWhileHidden = true;
        return;
      }

      const ok = await load();
      if (cancelled || !pollIntervalMs) return;

      if (ok) {
        failures = 0;
        schedule(pollIntervalMs);
      } else {
        failures += 1;
        schedule(Math.min(retryBaseDelayMs * 2 ** (failures - 1), pollIntervalMs));
      }
    }

    const reuseWindow = pollIntervalMs ?? REUSE_WITHOUT_POLLING_MS;
    const age = Date.now() - shared.receivedAt;

    if (shared.data && age < reuseWindow) {
      setData(shared.data);
      if (pollIntervalMs) schedule(pollIntervalMs - age);
    } else {
      void run();
    }

    const handleVisibility = () => {
      if (!document.hidden && dueWhileHidden) {
        dueWhileHidden = false;
        void run();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [enabled, offline, pollIntervalMs, load]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  // Offline hides the grid from anything that would render it as
  // current (e.g. map layers); lastKnown stays available for panels
  // that label it as last-known data.
  const current = offline ? null : data;

  return {
    data: current,
    points: current?.points ?? [],
    lastKnown: data,
    loading,
    error,
    lastFetchedAt: current?.fetchedAt ?? null,
    refresh,
  };
}

export default useMarineModelGrid;
