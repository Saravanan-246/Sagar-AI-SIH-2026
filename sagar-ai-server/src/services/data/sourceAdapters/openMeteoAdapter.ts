import { computeFreshness } from "../freshnessEngine";
import { computeConfidence } from "../confidenceEngine";
import type { ConfidenceAssessment, FreshnessStatus } from "../dataContract";

/*
 * ------------------------------------------------------------------
 * REAL, VERIFIED INTEGRATION - Open-Meteo's free, no-API-key Marine
 * Weather API (https://marine-api.open-meteo.com/v1/marine) and its
 * companion Weather Forecast API (https://api.open-meteo.com/v1/forecast,
 * used only for wind, which the Marine API does not provide). Both
 * confirmed reachable with Node's global fetch (no TLS workaround
 * needed, unlike incoisAdapter.ts) by directly querying the real pilot
 * grid during implementation (2026-09-20).
 *
 * Every value returned here is Open-Meteo's own forecast MODEL output
 * (their own blend of wave/ocean/atmospheric models), never a local
 * sensor reading or AIS-style observation - callers must never relabel
 * it as "live"/"observed". Confirmed live: a handful of the pilot
 * grid's 20 points fall on/immediately next to land (e.g. near
 * Rameswaram) and Open-Meteo legitimately returns null for every
 * marine field there - those fields are left undefined on the
 * normalized point rather than guessed or interpolated from neighbors.
 * ------------------------------------------------------------------
 */

const MARINE_BASE = "https://marine-api.open-meteo.com/v1/marine";
const WEATHER_BASE = "https://api.open-meteo.com/v1/forecast";

const MARINE_CURRENT_VARS = [
  "wave_height",
  "wave_direction",
  "wave_period",
  "wind_wave_height",
  "swell_wave_height",
  "swell_wave_direction",
  "swell_wave_period",
  "ocean_current_velocity",
  "ocean_current_direction",
  "sea_surface_temperature",
  "sea_level_height_msl",
].join(",");

const WEATHER_CURRENT_VARS = "wind_speed_10m,wind_direction_10m";

const FETCH_TIMEOUT_MS = 8000;

// Re-fetching more often than this only asks Open-Meteo for an
// unchanged answer - their marine/weather models refresh on an
// hourly-ish cadence, not every few seconds. Also keeps this well
// within Open-Meteo's free-tier fair use.
const CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Bounded Gulf of Mannar pilot grid - 5 latitude steps x 4 longitude
 * steps, covering Thoothukudi and the Southern/Central/Northern Gulf
 * of Mannar in one single batched request per endpoint (Open-Meteo
 * accepts comma-separated latitude/longitude lists), rather than one
 * request per point. Deliberately modest (20 points) for browser
 * rendering/performance - not meant to be a dense oceanographic mesh.
 */
const GRID_LAT_STEPS = [8.4, 8.625, 8.85, 9.075, 9.3];
const GRID_LON_STEPS = [78.05, 78.4667, 78.8833, 79.3];

export interface MarineModelGridPoint {
  latitude: number;
  longitude: number;

  waveHeight?: number;
  waveDirection?: number;
  wavePeriod?: number;
  windWaveHeight?: number;
  swellHeight?: number;
  swellDirection?: number;
  swellPeriod?: number;

  /** Converted from Open-Meteo's native km/h to knots, matching the
   * unit already used everywhere else in Sagar (windSpeedKnots etc.). */
  currentVelocity?: number;
  currentDirection?: number;

  seaSurfaceTemperature?: number;
  seaLevelHeight?: number;

  /** Requested in knots directly (wind_speed_unit=kn), no separate
   * conversion needed. */
  windSpeed?: number;
  windDirection?: number;

  provider: "Open-Meteo";
  model: string;

  /** The model's own forecast valid time for this "current" reading -
   * never fabricated, left undefined if neither source returned a
   * usable time for this point. */
  generatedAt?: string;
  fetchedAt: string;

  freshness: FreshnessStatus;
  confidence: ConfidenceAssessment;
}

export interface MarineModelGridResult {
  status: "success" | "empty" | "failed";
  provider: "Open-Meteo";
  points: MarineModelGridPoint[];
  bounds: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  generatedAt: string | null;
  fetchedAt: string;
  cacheTtlMs: number;
  attribution: string;
  message?: string;
}

const ATTRIBUTION = "Weather data by Open-Meteo.com (CC BY 4.0)";
const MODEL_LABEL = "Open-Meteo Marine Weather API (wave/ocean model blend) + Open-Meteo Weather Forecast API (wind model)";

function buildGridCoordinates(): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  for (const latitude of GRID_LAT_STEPS) {
    for (const longitude of GRID_LON_STEPS) {
      points.push({ latitude, longitude });
    }
  }
  return points;
}

const GRID = buildGridCoordinates();

interface OpenMeteoCurrentResponse {
  latitude: number;
  longitude: number;
  current?: Record<string, number | string | null>;
}

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`Open-Meteo request failed with status ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function toNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeTime(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) {
    return undefined;
  }

  // Open-Meteo's "current.time" is a UTC-offset-less local string
  // (e.g. "2026-09-20T03:15") when timezone=UTC was requested - append
  // the Z so Date.parse treats it as the real UTC instant it is,
  // rather than silently parsing it in the server's own local zone.
  const isoLike = value.endsWith("Z") ? value : `${value}Z`;
  const parsed = Date.parse(isoLike);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

async function fetchMarineGrid(): Promise<OpenMeteoCurrentResponse[] | null> {
  const latitudes = GRID.map((p) => p.latitude).join(",");
  const longitudes = GRID.map((p) => p.longitude).join(",");

  const url =
    `${MARINE_BASE}?latitude=${latitudes}&longitude=${longitudes}` +
    `&current=${MARINE_CURRENT_VARS}&timezone=UTC`;

  const body = await fetchJson(url, FETCH_TIMEOUT_MS);
  return Array.isArray(body) ? (body as OpenMeteoCurrentResponse[]) : null;
}

async function fetchWindGrid(): Promise<OpenMeteoCurrentResponse[] | null> {
  const latitudes = GRID.map((p) => p.latitude).join(",");
  const longitudes = GRID.map((p) => p.longitude).join(",");

  const url =
    `${WEATHER_BASE}?latitude=${latitudes}&longitude=${longitudes}` +
    `&current=${WEATHER_CURRENT_VARS}&wind_speed_unit=kn&timezone=UTC`;

  const body = await fetchJson(url, FETCH_TIMEOUT_MS);
  return Array.isArray(body) ? (body as OpenMeteoCurrentResponse[]) : null;
}

function buildEmptyResult(message: string): MarineModelGridResult {
  return {
    status: "failed",
    provider: "Open-Meteo",
    points: [],
    bounds: {
      minLatitude: Math.min(...GRID_LAT_STEPS),
      maxLatitude: Math.max(...GRID_LAT_STEPS),
      minLongitude: Math.min(...GRID_LON_STEPS),
      maxLongitude: Math.max(...GRID_LON_STEPS),
    },
    generatedAt: null,
    fetchedAt: new Date().toISOString(),
    cacheTtlMs: CACHE_TTL_MS,
    attribution: ATTRIBUTION,
    message,
  };
}

async function fetchGridFromOpenMeteo(): Promise<MarineModelGridResult> {
  const fetchedAt = new Date().toISOString();

  const [marineOutcome, windOutcome] = await Promise.allSettled([
    fetchMarineGrid(),
    fetchWindGrid(),
  ]);

  const marineRows = marineOutcome.status === "fulfilled" ? marineOutcome.value : null;
  const windRows = windOutcome.status === "fulfilled" ? windOutcome.value : null;

  if (!marineRows) {
    const reason =
      marineOutcome.status === "rejected"
        ? marineOutcome.reason instanceof Error
          ? marineOutcome.reason.message
          : "unknown error"
        : "Open-Meteo returned an unexpected response shape";

    return buildEmptyResult(
      `Open-Meteo Marine API request failed: ${reason}. Marine model layers are unavailable this request.`
    );
  }

  let representativeGeneratedAt: string | null = null;

  const points: MarineModelGridPoint[] = marineRows.map((row, index) => {
    const current = row.current ?? {};
    const windRow = windRows?.[index];
    const windCurrent = windRow?.current ?? {};

    const generatedAt = normalizeTime(current.time);
    if (generatedAt && !representativeGeneratedAt) {
      representativeGeneratedAt = generatedAt;
    }

    const freshness = computeFreshness("marine_forecast", generatedAt, fetchedAt);
    const confidence = computeConfidence({
      coreIsPrototype: false,
      isDirectModelReading: true,
      verifiedFreshness: freshness,
    });

    const currentVelocityKmh = toNumberOrUndefined(current.ocean_current_velocity);

    return {
      latitude: toNumberOrUndefined(row.latitude) ?? GRID[index]?.latitude ?? 0,
      longitude: toNumberOrUndefined(row.longitude) ?? GRID[index]?.longitude ?? 0,

      waveHeight: toNumberOrUndefined(current.wave_height),
      waveDirection: toNumberOrUndefined(current.wave_direction),
      wavePeriod: toNumberOrUndefined(current.wave_period),
      windWaveHeight: toNumberOrUndefined(current.wind_wave_height),
      swellHeight: toNumberOrUndefined(current.swell_wave_height),
      swellDirection: toNumberOrUndefined(current.swell_wave_direction),
      swellPeriod: toNumberOrUndefined(current.swell_wave_period),

      currentVelocity:
        currentVelocityKmh !== undefined
          ? Math.round(currentVelocityKmh * 0.539957 * 100) / 100
          : undefined,
      currentDirection: toNumberOrUndefined(current.ocean_current_direction),

      seaSurfaceTemperature: toNumberOrUndefined(current.sea_surface_temperature),
      seaLevelHeight: toNumberOrUndefined(current.sea_level_height_msl),

      windSpeed: toNumberOrUndefined(windCurrent.wind_speed_10m),
      windDirection: toNumberOrUndefined(windCurrent.wind_direction_10m),

      provider: "Open-Meteo",
      model: MODEL_LABEL,

      generatedAt,
      fetchedAt,

      freshness,
      confidence,
    };
  });

  const windFailed = windOutcome.status === "rejected" || !windRows;

  return {
    status: "success",
    provider: "Open-Meteo",
    points,
    bounds: {
      minLatitude: Math.min(...GRID_LAT_STEPS),
      maxLatitude: Math.max(...GRID_LAT_STEPS),
      minLongitude: Math.min(...GRID_LON_STEPS),
      maxLongitude: Math.max(...GRID_LON_STEPS),
    },
    generatedAt: representativeGeneratedAt,
    fetchedAt,
    cacheTtlMs: CACHE_TTL_MS,
    attribution: ATTRIBUTION,
    message: windFailed
      ? "Wind data unavailable this request (Open-Meteo Weather Forecast API lookup failed); wave/current/SST/tide fields are otherwise unaffected."
      : undefined,
  };
}

let cache: { result: MarineModelGridResult; expiresAt: number } | null = null;
let inFlight: Promise<MarineModelGridResult> | null = null;

export async function getMarineModelGrid(): Promise<MarineModelGridResult> {
  if (cache && cache.expiresAt > Date.now()) {
    return cache.result;
  }

  if (inFlight) {
    return inFlight;
  }

  const promise = fetchGridFromOpenMeteo()
    .then((result) => {
      // Never cache a failed fetch as if it were a valid answer - the
      // next request should retry rather than silently repeating an
      // "unavailable" result for the full TTL. Same for a partial
      // success (e.g. wind lookup failed): caching it would leave the
      // wind layer empty for the full 30-minute TTL even though only
      // one of the two upstream endpoints had a transient failure.
      if (result.status === "success" && !result.message) {
        cache = { result, expiresAt: Date.now() + CACHE_TTL_MS };
      }
      return result;
    })
    .finally(() => {
      inFlight = null;
    });

  inFlight = promise;
  return promise;
}

export function isOpenMeteoAdapterConfigured(): boolean {
  return true;
}

export default getMarineModelGrid;
