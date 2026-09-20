import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchMarineModelGrid,
  type MarineModelGridResponse,
} from "../services/api/sagarApiClient";

type UseMarineModelGridOptions = {
  /** Only fetch while at least one of the map's marine-model layers
   * (Wind/Waves/Current/SST/Tide) is actually toggled on - never on
   * page load, never on a timer. */
  enabled: boolean;
  /** A real, already-known connectivity outcome - never fetched while
   * offline, so offline mode never pretends this external grid is
   * available. */
  offline?: boolean;
};

export function useMarineModelGrid({
  enabled,
  offline = false,
}: UseMarineModelGridOptions) {
  const [data, setData] = useState<MarineModelGridResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasFetchedRef = useRef(false);

  const load = useCallback(async () => {
    if (offline) {
      setError("Marine model unavailable while offline.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await fetchMarineModelGrid();
      setData(result);

      if (result.status !== "success") {
        setError(result.message ?? "Marine model unavailable.");
      }
    } catch (err) {
      console.warn("Marine model grid request failed:", err);
      setError("Marine model unavailable.");
    } finally {
      setLoading(false);
    }
  }, [offline]);

  useEffect(() => {
    if (!enabled || offline || hasFetchedRef.current) {
      return;
    }

    hasFetchedRef.current = true;
    load();
  }, [enabled, offline, load]);

  // Going offline invalidates whatever was fetched while online - never
  // shown as if it were still current.
  useEffect(() => {
    if (offline) {
      hasFetchedRef.current = false;
      setData(null);
      setError(null);
    }
  }, [offline]);

  const refresh = useCallback(() => {
    hasFetchedRef.current = true;
    load();
  }, [load]);

  return {
    data,
    points: data?.points ?? [],
    loading,
    error,
    lastFetchedAt: data?.fetchedAt ?? null,
    refresh,
  };
}

export default useMarineModelGrid;
