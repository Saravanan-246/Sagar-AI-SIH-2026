/**
 * Feature engineering shared by training and live inference. Having a
 * single `buildFeatureVector` used by both `buildTrainingDataset`
 * (sstResearchService.ts, historical data) and the live prediction path
 * is what guarantees the trained model and the inference call agree on
 * feature order/units/meaning - the "identical schema" requirement
 * from the ML validation task, enforced by construction rather than by
 * convention.
 */

import type { HourlyRow } from "./sstDataSources";

export const FEATURE_NAMES = [
  "air_temperature_c",
  "wind_speed_kn",
  "wind_direction_sin",
  "wind_direction_cos",
  "humidity_pct",
  "solar_radiation_wm2",
  "pressure_hpa",
  "current_velocity_kn",
  "current_direction_sin",
  "current_direction_cos",
  "wave_height_m",
  "sst_lag_1h_c",
  "sst_lag_24h_c",
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export const FEATURE_LABELS: Record<FeatureName, string> = {
  air_temperature_c: "Air Temperature",
  wind_speed_kn: "Wind Speed",
  wind_direction_sin: "Wind Direction (sin)",
  wind_direction_cos: "Wind Direction (cos)",
  humidity_pct: "Humidity",
  solar_radiation_wm2: "Solar Radiation",
  pressure_hpa: "Surface Pressure",
  current_velocity_kn: "Ocean Current Velocity",
  current_direction_sin: "Ocean Current Direction (sin)",
  current_direction_cos: "Ocean Current Direction (cos)",
  wave_height_m: "Wave Height",
  sst_lag_1h_c: "SST (1h ago)",
  sst_lag_24h_c: "SST (24h ago)",
};

export const FEATURE_UNITS: Record<FeatureName, string> = {
  air_temperature_c: "°C",
  wind_speed_kn: "kn",
  wind_direction_sin: "",
  wind_direction_cos: "",
  humidity_pct: "%",
  solar_radiation_wm2: "W/m²",
  pressure_hpa: "hPa",
  current_velocity_kn: "kn",
  current_direction_sin: "",
  current_direction_cos: "",
  wave_height_m: "m",
  sst_lag_1h_c: "°C",
  sst_lag_24h_c: "°C",
};

const LAG_1H = 1;
const LAG_24H = 24;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Builds one feature vector, or null if any required input is missing
 * (nulls are never filled/interpolated - a row with any gap is simply
 * not used, per the "handle nulls honestly" rule). */
export function buildFeatureVector(row: HourlyRow, sstLag1h: number | null, sstLag24h: number | null): number[] | null {
  const required = [
    row.airTemp,
    row.windSpeed,
    row.windDirection,
    row.humidity,
    row.solarRadiation,
    row.pressure,
    row.currentVelocity,
    row.currentDirection,
    row.waveHeight,
    sstLag1h,
    sstLag24h,
  ];
  if (required.some((v) => v === null || v === undefined || Number.isNaN(v))) {
    return null;
  }

  return [
    row.airTemp!,
    row.windSpeed!,
    Math.sin(degToRad(row.windDirection!)),
    Math.cos(degToRad(row.windDirection!)),
    row.humidity!,
    row.solarRadiation!,
    row.pressure!,
    row.currentVelocity!,
    Math.sin(degToRad(row.currentDirection!)),
    Math.cos(degToRad(row.currentDirection!)),
    row.waveHeight!,
    sstLag1h!,
    sstLag24h!,
  ];
}

export interface TrainingExample {
  timestamp: string;
  x: number[];
  y: number; // SST at t+horizonHours
  currentSst: number; // SST at t, for the persistence baseline
}

export interface DatasetDiagnostics {
  totalHourlyRowsFetched: number;
  droppedMissingTarget: number;
  droppedMissingFeature: number;
  usableRows: number;
}

/**
 * Builds (feature, target) pairs from a contiguous hourly series.
 * `rows` must be sorted ascending by time with no assumed gap-filling -
 * Open-Meteo returns one row per hour with no skipped slots for these
 * endpoints, which was checked directly (see sstDataSources.ts), so
 * index offsets of 1/24/horizonHours reliably mean 1h/24h/horizon hours.
 *
 * No leakage: the target for the row at index i is always rows[i + horizonHours],
 * strictly in the future relative to every feature used for that row -
 * never a value the model could not have known yet.
 */
export function buildTrainingDataset(
  rows: HourlyRow[],
  horizonHours: number
): { dataset: TrainingExample[]; diagnostics: DatasetDiagnostics } {
  const dataset: TrainingExample[] = [];
  let droppedMissingTarget = 0;
  let droppedMissingFeature = 0;

  for (let i = LAG_24H; i < rows.length - horizonHours; i++) {
    const row = rows[i]!;
    const targetRow = rows[i + horizonHours]!;

    if (targetRow.sst === null) {
      droppedMissingTarget++;
      continue;
    }
    if (row.sst === null) {
      droppedMissingFeature++;
      continue;
    }

    const x = buildFeatureVector(row, rows[i - LAG_1H]!.sst, rows[i - LAG_24H]!.sst);
    if (!x) {
      droppedMissingFeature++;
      continue;
    }

    dataset.push({ timestamp: row.timestamp, x, y: targetRow.sst, currentSst: row.sst });
  }

  return {
    dataset,
    diagnostics: {
      totalHourlyRowsFetched: rows.length,
      droppedMissingTarget,
      droppedMissingFeature,
      usableRows: dataset.length,
    },
  };
}

/** Parses Open-Meteo's UTC-offset-less local timestamp string
 * ("2026-09-20T05:00", requested with timezone=UTC) as the real UTC
 * instant it represents. */
function parseOpenMeteoUtc(timestamp: string): number {
  const isoLike = timestamp.endsWith("Z") ? timestamp : `${timestamp}Z`;
  return Date.parse(isoLike);
}

/** Builds the single feature vector for "right now" from a recent hourly
 * series (see fetchRecentHourly, requested with past_days + a small
 * forecast_days window). SST/current/wave fields are Open-Meteo's own
 * model output, so they are never null even for hours later than the
 * real current time - picking "the last row with a non-null SST" would
 * silently pick a future, forecast-only hour and mislabel it as
 * "current". Instead this finds the latest row whose own timestamp is
 * not after `asOf` (defaults to now), which is the real most-recent
 * actually-elapsed hour. Returns null if there isn't 24h of lookback
 * available or a required field is missing. */
export function buildLiveFeatureVector(
  rows: HourlyRow[],
  asOf: Date = new Date()
): { x: number[]; nowRow: HourlyRow; nowIndex: number } | null {
  const asOfMs = asOf.getTime();

  let nowIndex = -1;
  for (let i = rows.length - 1; i >= 0; i--) {
    const rowMs = parseOpenMeteoUtc(rows[i]!.timestamp);
    if (Number.isFinite(rowMs) && rowMs <= asOfMs) {
      nowIndex = i;
      break;
    }
  }
  if (nowIndex < LAG_24H) return null;

  const nowRow = rows[nowIndex]!;
  if (nowRow.sst === null) return null;

  const x = buildFeatureVector(nowRow, rows[nowIndex - LAG_1H]!.sst, rows[nowIndex - LAG_24H]!.sst);
  if (!x) return null;

  return { x, nowRow, nowIndex };
}
