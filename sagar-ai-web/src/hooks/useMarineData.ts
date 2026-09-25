import { useCallback, useEffect, useState } from "react";

import { fetchMarineAreas } from "../services/api/sagarApiClient";

import {
  getMarineAreas as getLocalMarineAreas,
} from "../services/marine/marineData";
import { getOfflineSnapshot } from "../services/offline/offlineSnapshot";

import type { MarineArea } from "../types/marine";

type UseMarineDataOptions = {
  areaId?: string;
};

/**
 * Where the area list actually came from. Every origin serves Sagar's
 * configured area dataset (the backend's /api/marine is the same
 * prototype dataset), so none of them is a live measurement - but the
 * UI still needs to know when it is looking at a local fallback copy
 * rather than what the backend returned just now.
 */
export type MarineDataOrigin = "backend" | "offline-snapshot" | "bundled";

function localOrigin(): MarineDataOrigin {
  const snapshot = getOfflineSnapshot();
  return snapshot && snapshot.marineAreas.length > 0
    ? "offline-snapshot"
    : "bundled";
}

async function resolveMarineAreas(): Promise<{
  areas: MarineArea[];
  origin: MarineDataOrigin;
}> {
  try {
    const areas = await fetchMarineAreas();

    if (areas.length > 0) {
      return { areas, origin: "backend" };
    }

    return { areas: getLocalMarineAreas(), origin: localOrigin() };
  } catch (err) {
    console.warn(
      "Sagar backend is unavailable, using the local marine dataset:",
      err
    );

    return { areas: getLocalMarineAreas(), origin: localOrigin() };
  }
}

export function useMarineData(
  options: UseMarineDataOptions = {},
) {
  const { areaId } = options;

  const [areas, setAreas] = useState<MarineArea[]>([]);
  const [area, setArea] = useState<MarineArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState<MarineDataOrigin | null>(null);

  const loadMarineData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { areas: allAreas, origin: resolvedOrigin } =
        await resolveMarineAreas();
      setAreas(allAreas);
      setOrigin(resolvedOrigin);

      if (areaId) {
        setArea(
          allAreas.find((item) => item.id === areaId) ?? null
        );
      } else {
        setArea(allAreas[0] ?? null);
      }
    } catch (err) {
      console.error("Failed to load marine data:", err);
      setAreas([]);
      setArea(null);
      setError("Unable to load marine conditions.");
    } finally {
      setLoading(false);
    }
  }, [areaId]);

  useEffect(() => {
    loadMarineData();
  }, [loadMarineData]);

  const refresh = useCallback(() => {
    loadMarineData();
  }, [loadMarineData]);

  return {
    areas,
    area,
    loading,
    error,
    origin,
    refresh,
    hasData: areas.length > 0,
  };
}

export function useMarineArea(areaId?: string) {
  return useMarineData({ areaId });
}
