import { computeFreshness } from "../data/freshnessEngine";
import type { FreshnessStatus } from "../data/dataContract";
import {
  getMarineModelGrid,
  type MarineModelGridPoint,
} from "../data/sourceAdapters/openMeteoAdapter";
import type { MarineArea } from "../../types/marine";

/*
 * The single place the marine decision path (weather agent -> risk
 * agent, used by /api/risk and chat) gets its wind / wave / visibility
 * values. Wind and waves come from the same cached Open-Meteo grid the
 * web app displays (/api/marine-model/grid -> getMarineModelGrid), using
 * the same point-selection rule as the web app's nearestModelPoint, so
 * the risk result and the displayed conditions share one source.
 *
 * Every value keeps its provenance. Model output is labelled as model
 * output - never an observation - and when no model value is available
 * the configured prototype value is used and labelled as fallback,
 * never silently substituted.
 */

/** Must match APP_CONFIG.marine.modelGrid.maxPointDistanceKm in the web
 * app - the same point is selected on both sides. */
export const MODEL_POINT_MAX_DISTANCE_KM = 40;

// Keeps a slow/unreachable Open-Meteo from stalling every risk/chat
// request: the grid request keeps running in the background (and fills
// the adapter's cache if it succeeds), but the decision path moves on
// with the labelled fallback.
const MODEL_WAIT_MS = 5000;
// After a failure, don't wait on the model again for this long.
const FAILURE_BACKOFF_MS = 60 * 1000;

const MODEL_SOURCE =
  "Open-Meteo marine model (forecast model output, not an observation)";
const CONFIGURED_SOURCE = "Sagar configured marine dataset (prototype)";

export type MarineInputKind = "model" | "configured";

export interface MarineDecisionValue {
  value: number;
  unit: "kn" | "m" | "km";
  kind: MarineInputKind;
  source: string;
  /** Model valid time for model values; the dataset's recorded time
   * for configured values. */
  timestamp?: string;
  freshness: FreshnessStatus;
}

/**
 * - model: wind and waves both from the model
 * - partial-model: one of wind/waves from the model, the other from the
 *   configured fallback (each value says which)
 * - configured-fallback: no usable model value; configured prototype
 *   values used
 * - unavailable: no wind or wave value from any source
 */
export type MarineConditionsBasis =
  | "model"
  | "partial-model"
  | "configured-fallback"
  | "unavailable";

export interface MarineDecisionInputs {
  basis: MarineConditionsBasis;
  /** Why the model was not (fully) used. */
  fallbackReason?: string;
  modelPoint?: {
    latitude: number;
    longitude: number;
    distanceKm: number;
    validAt?: string;
    fetchedAt: string;
  };
  windSpeedKnots?: MarineDecisionValue;
  waveHeightM?: MarineDecisionValue;
  /** The model has no visibility field - always configured. */
  visibilityKm?: MarineDecisionValue;
}

let lastFailureAt = 0;

function haversineDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) *
      Math.cos(toRad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Same rule as the web app's nearestModelPoint: the nearest grid point
 * that has a wave value, within MODEL_POINT_MAX_DISTANCE_KM - never
 * interpolated, never borrowed from farther away. */
function nearestWavePoint(
  points: MarineModelGridPoint[],
  target: { latitude: number; longitude: number }
): { point: MarineModelGridPoint; distanceKm: number } | null {
  let best: { point: MarineModelGridPoint; distanceKm: number } | null = null;

  for (const point of points) {
    if (typeof point.waveHeight !== "number") continue;

    const distanceKm = haversineDistanceKm(point, target);
    if (
      distanceKm <= MODEL_POINT_MAX_DISTANCE_KM &&
      (!best || distanceKm < best.distanceKm)
    ) {
      best = { point, distanceKm };
    }
  }

  return best;
}

async function loadGrid(): Promise<
  | { ok: true; grid: Awaited<ReturnType<typeof getMarineModelGrid>> }
  | { ok: false; reason: string }
> {
  if (Date.now() - lastFailureAt < FAILURE_BACKOFF_MS) {
    return { ok: false, reason: "Marine model unavailable (recent request failed)." };
  }

  let timer: NodeJS.Timeout | undefined;

  try {
    const grid = await Promise.race([
      getMarineModelGrid(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`Marine model did not respond within ${MODEL_WAIT_MS} ms.`)),
          MODEL_WAIT_MS
        );
      }),
    ]);

    if (grid.status !== "success" || grid.points.length === 0) {
      lastFailureAt = Date.now();
      return { ok: false, reason: grid.message ?? "Marine model returned no data." };
    }

    return { ok: true, grid };
  } catch (error) {
    lastFailureAt = Date.now();
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Marine model request failed.",
    };
  } finally {
    clearTimeout(timer);
  }
}

function configuredValue(
  value: number | undefined,
  unit: MarineDecisionValue["unit"],
  area: MarineArea
): MarineDecisionValue | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;

  return {
    value,
    unit,
    kind: "configured",
    source: CONFIGURED_SOURCE,
    timestamp: area.updatedAt,
    // No real observation time exists for configured data.
    freshness: computeFreshness("marine_observation", undefined),
  };
}

export async function resolveMarineDecisionInputs(
  area: MarineArea
): Promise<MarineDecisionInputs> {
  const configured = {
    wind: configuredValue(area.conditions?.windSpeedKnots, "kn", area),
    wave: configuredValue(area.conditions?.waveHeightM, "m", area),
    visibility: configuredValue(area.conditions?.visibilityKm, "km", area),
  };

  const loaded = await loadGrid();
  const nearest = loaded.ok ? nearestWavePoint(loaded.grid.points, area.coordinates) : null;

  let fallbackReason: string | undefined;
  if (!loaded.ok) {
    fallbackReason = loaded.reason;
  } else if (!nearest) {
    fallbackReason = `No marine model grid point with wave data within ${MODEL_POINT_MAX_DISTANCE_KM} km of ${area.name}.`;
  }

  const point = nearest?.point;
  const validAt = point?.generatedAt;
  const modelFreshness = computeFreshness("marine_forecast", validAt);

  const modelValue = (
    value: number | undefined,
    unit: MarineDecisionValue["unit"]
  ): MarineDecisionValue | undefined =>
    typeof value === "number" && Number.isFinite(value)
      ? { value, unit, kind: "model", source: MODEL_SOURCE, timestamp: validAt, freshness: modelFreshness }
      : undefined;

  const modelWave = modelValue(point?.waveHeight, "m");
  const modelWind = modelValue(point?.windSpeed, "kn");

  if (point && !modelWind && !fallbackReason) {
    fallbackReason = "Model wind unavailable for this request; configured wind used.";
  }

  const waveHeightM = modelWave ?? configured.wave;
  const windSpeedKnots = modelWind ?? configured.wind;

  const basis: MarineConditionsBasis =
    modelWave && modelWind
      ? "model"
      : modelWave || modelWind
        ? "partial-model"
        : waveHeightM || windSpeedKnots
          ? "configured-fallback"
          : "unavailable";

  return {
    basis,
    fallbackReason: basis === "model" ? undefined : fallbackReason,
    modelPoint:
      point && nearest && loaded.ok
        ? {
            latitude: point.latitude,
            longitude: point.longitude,
            distanceKm: Math.round(nearest.distanceKm * 10) / 10,
            validAt,
            fetchedAt: loaded.grid.fetchedAt,
          }
        : undefined,
    windSpeedKnots,
    waveHeightM,
    visibilityKm: configured.visibility,
  };
}
