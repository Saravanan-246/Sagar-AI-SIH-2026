import { useEffect, useMemo, useState } from "react";

import { APP_CONFIG } from "../constants/config";
import type { MarineModelGridPoint } from "../services/api/sagarApiClient";
import type { MarineArea } from "../types/marine";
import {
  computeDataState,
  nearestModelPoint,
  type MarineReading,
} from "../utils/freshness";
import { useMarineModelGrid } from "./useMarineModelGrid";

export const MODEL_SOURCE_LABEL = "Open-Meteo marine model";
export const CONFIGURED_SOURCE_LABEL = "Sagar configured dataset (prototype)";

/**
 * - ok: current model data for this area
 * - last-known: model data kept from an earlier fetch because the
 *   latest refresh failed or the device is offline
 * - no-coverage: the model grid has no usable point near this area
 * - unavailable: no model data at all (failed and nothing kept)
 */
export type MarineConditionsStatus =
  | "loading"
  | "ok"
  | "last-known"
  | "no-coverage"
  | "unavailable";

export interface MarineModelReadings {
  waveHeight?: MarineReading;
  wavePeriod?: MarineReading;
  swellHeight?: MarineReading;
  wind?: MarineReading;
  seaSurfaceTemperature?: MarineReading;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildReadings(
  point: MarineModelGridPoint,
  location: string,
  now: number,
): MarineModelReadings {
  const timestamp = point.generatedAt ?? null;
  const state = computeDataState("model", timestamp, now);

  const reading = (value: number, unit: string, note?: string): MarineReading => ({
    value,
    unit,
    source: MODEL_SOURCE_LABEL,
    timestamp,
    location,
    kind: "model",
    state,
    note,
  });

  const readings: MarineModelReadings = {};

  if (typeof point.waveHeight === "number") {
    readings.waveHeight = reading(
      round(point.waveHeight, 1),
      "m",
      typeof point.waveDirection === "number"
        ? `From ${Math.round(point.waveDirection)}°`
        : undefined,
    );
  }

  if (typeof point.wavePeriod === "number") {
    readings.wavePeriod = reading(round(point.wavePeriod, 1), "s");
  }

  if (typeof point.swellHeight === "number") {
    readings.swellHeight = reading(round(point.swellHeight, 1), "m");
  }

  if (typeof point.windSpeed === "number") {
    readings.wind = reading(
      round(point.windSpeed, 0),
      "kn",
      typeof point.windDirection === "number"
        ? `From ${Math.round(point.windDirection)}°`
        : undefined,
    );
  }

  if (typeof point.seaSurfaceTemperature === "number") {
    readings.seaSurfaceTemperature = reading(round(point.seaSurfaceTemperature, 1), "°C");
  }

  return readings;
}

/**
 * Model-based marine conditions for one configured area: the nearest
 * Open-Meteo grid point (never interpolated, never borrowed from a
 * far-away point), refreshed on the configured interval, each value
 * carrying its own source, valid time and freshness state.
 */
export function useMarineConditions(
  area: MarineArea | null | undefined,
  { offline = false, enabled = true }: { offline?: boolean; enabled?: boolean } = {},
) {
  const { pollIntervalMs, maxPointDistanceKm } = APP_CONFIG.marine.modelGrid;

  const grid = useMarineModelGrid({
    enabled: enabled && Boolean(area),
    offline,
    pollIntervalMs,
  });

  // Re-evaluates freshness each minute so a page left open ages its
  // labels honestly between fetches.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const source = grid.lastKnown;

  const nearest = useMemo(
    () =>
      area && source
        ? nearestModelPoint(source.points, area.coordinates, maxPointDistanceKm)
        : null,
    [area, source, maxPointDistanceKm],
  );

  const readings = useMemo<MarineModelReadings | null>(() => {
    if (!area || !nearest) return null;

    const location = `${area.name} · grid point ${Math.round(nearest.distanceKm)} km away`;
    return buildReadings(nearest.point, location, now);
  }, [area, nearest, now]);

  const isCurrent = Boolean(grid.data) && !grid.error;

  const status: MarineConditionsStatus = !source
    ? grid.loading || (!grid.error && !offline)
      ? "loading"
      : "unavailable"
    : !nearest
      ? "no-coverage"
      : isCurrent
        ? "ok"
        : "last-known";

  return {
    readings,
    status,
    validAt: nearest?.point.generatedAt ?? null,
    distanceKm: nearest?.distanceKm ?? null,
    attribution: source?.attribution ?? null,
    error: offline ? "Offline" : grid.error,
    loading: grid.loading,
    refresh: grid.refresh,
    now,
  };
}

export default useMarineConditions;
