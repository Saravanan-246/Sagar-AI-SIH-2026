import { useCallback, useEffect, useState } from "react";

import { fetchMarineAreas } from "../services/api/sagarApiClient";

import {
  getMarineAreas as getLocalMarineAreas,
} from "../services/marine/marineData";

import type { MarineArea } from "../types/marine";

type UseMarineDataOptions = {
  areaId?: string;
};

async function resolveMarineAreas(): Promise<MarineArea[]> {
  try {
    const areas = await fetchMarineAreas();

    if (areas.length > 0) {
      return areas;
    }

    return getLocalMarineAreas();
  } catch (err) {
    console.warn(
      "Sagar backend is unavailable, using the local marine dataset:",
      err
    );

    return getLocalMarineAreas();
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

  const loadMarineData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const allAreas = await resolveMarineAreas();
      setAreas(allAreas);

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
    refresh,
    hasData: areas.length > 0,
  };
}

export function useMarineArea(areaId?: string) {
  return useMarineData({ areaId });
}
