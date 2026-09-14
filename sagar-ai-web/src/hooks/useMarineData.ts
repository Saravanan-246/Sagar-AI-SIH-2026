import { useCallback, useEffect, useState } from "react";

import {
  getMarineAreas,
  getMarineArea,
  getDefaultMarineArea,
} from "../services/marine/marineData";

import type { MarineArea } from "../types/marine";

type UseMarineDataOptions = {
  areaId?: string;
};

export function useMarineData(
  options: UseMarineDataOptions = {},
) {
  const { areaId } = options;

  const [areas, setAreas] = useState<MarineArea[]>([]);
  const [area, setArea] = useState<MarineArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMarineData = useCallback(() => {
    setLoading(true);
    setError(null);

    try {
      const allAreas = getMarineAreas();
      setAreas(allAreas);

      if (areaId) {
        setArea(getMarineArea(areaId) ?? null);
      } else {
        setArea(getDefaultMarineArea());
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