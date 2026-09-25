import type { MarineModelGridPoint } from "../services/api/sagarApiClient";
import type { Coordinates } from "../types/marine";
import { haversineDistanceKm } from "./geo";

/**
 * UI-facing data state for a single marine value.
 *
 * - LIVE: an observation within minutes of now. Never used for model
 *   output or configured data - Sagar currently has no live marine
 *   observation feed, so nothing in the app reaches this today.
 * - RECENT: timestamped source data within its normal update cadence.
 * - STALE: timestamped source data older than its normal cadence (still
 *   shown - it's useful - but never presented as current).
 * - UNAVAILABLE: the source could not be reached / returned nothing.
 * - FALLBACK: Sagar's configured prototype dataset (or a bundled/offline
 *   copy of it) - not a measurement of the sea right now.
 */
export type DataState = "LIVE" | "RECENT" | "STALE" | "UNAVAILABLE" | "FALLBACK";

/** What kind of value this is - drives whether LIVE is even possible. */
export type DataKind = "observation" | "model" | "configured";

export interface MarineReading {
  value?: number | string;
  unit?: string;
  /** Short source name, e.g. "Open-Meteo marine model". */
  source: string;
  /** Model valid time / observation time. Never fabricated. */
  timestamp?: string | null;
  location?: string;
  kind: DataKind;
  state: DataState;
  note?: string;
}

/** Thresholds in minutes, matching the backend's freshnessEngine.ts
 * domains so the client never calls something fresher than the server
 * would. Recomputed client-side from the timestamp so a page left open
 * ages its data honestly instead of freezing the fetch-time label. */
const THRESHOLDS: Record<DataKind, { liveMinutes: number; recentMinutes: number }> = {
  // marine_observation domain
  observation: { liveMinutes: 15, recentMinutes: 60 },
  // marine_forecast domain: RECENT up to 6 h (its AGING bound is 24 h;
  // anything past 6 h means Sagar failed to refresh, so call it STALE)
  model: { liveMinutes: 0, recentMinutes: 6 * 60 },
  configured: { liveMinutes: 0, recentMinutes: 0 },
};

export function computeDataState(
  kind: DataKind,
  timestamp: string | null | undefined,
  now: number = Date.now(),
): DataState {
  if (kind === "configured") {
    return "FALLBACK";
  }

  if (!timestamp) {
    return "UNAVAILABLE";
  }

  const at = Date.parse(timestamp);
  if (!Number.isFinite(at)) {
    return "UNAVAILABLE";
  }

  // Model "current" values are the nearest forecast timestep, which can
  // sit slightly ahead of the clock; only real observations need a
  // strict no-future-timestamps rule.
  const ageMinutes = (now - at) / 60000;
  if (kind === "observation" && ageMinutes < 0) {
    return "UNAVAILABLE";
  }

  const { liveMinutes, recentMinutes } = THRESHOLDS[kind];
  const age = Math.max(0, ageMinutes);

  // LIVE is reserved for real observations - model output is never live.
  if (kind === "observation" && age <= liveMinutes) return "LIVE";
  if (age <= recentMinutes) return "RECENT";
  return "STALE";
}

export function dataStateTone(state: DataState): "normal" | "warning" | "muted" {
  switch (state) {
    case "LIVE":
    case "RECENT":
      return "normal";
    case "STALE":
    case "FALLBACK":
      return "warning";
    default:
      return "muted";
  }
}

const IST_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });

/** "14:32 IST" for today, "12 Sep, 14:32 IST" otherwise. */
export function formatIST(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;

  const sameDay = IST_DAY.format(at) === IST_DAY.format(new Date(now));
  return `${(sameDay ? IST_TIME : IST_DATE_TIME).format(at)} IST`;
}

/** "just now", "12 min ago", "3 h ago", "10 d ago", "7 wk ago" -
 * "in 20 min" for a forecast timestep slightly ahead of now. */
export function describeAge(iso: string | null | undefined, now: number = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;

  const diffMinutes = Math.round((now - at) / 60000);
  const minutes = Math.abs(diffMinutes);
  const ahead = diffMinutes < 0;

  let text: string;
  if (minutes < 1) return "just now";
  if (minutes < 60) text = `${minutes} min`;
  else if (minutes < 24 * 60) text = `${Math.round(minutes / 60)} h`;
  else if (minutes < 30 * 24 * 60) text = `${Math.round(minutes / (24 * 60))} d`;
  else text = `${Math.round(minutes / (7 * 24 * 60))} wk`;

  return ahead ? `in ${text}` : `${text} ago`;
}

/**
 * Nearest Open-Meteo grid point to a location, if one lies within
 * maxDistanceKm. Returns null rather than stretching a far-away point
 * to cover an area it doesn't describe - no interpolation, no guessing.
 */
export function nearestModelPoint(
  points: MarineModelGridPoint[],
  target: Coordinates | null | undefined,
  maxDistanceKm = 30,
  hasValue: (point: MarineModelGridPoint) => boolean = (point) =>
    typeof point.waveHeight === "number",
): { point: MarineModelGridPoint; distanceKm: number } | null {
  if (!target) return null;

  let best: { point: MarineModelGridPoint; distanceKm: number } | null = null;

  for (const point of points) {
    if (!hasValue(point)) continue;

    const distanceKm = haversineDistanceKm(
      { latitude: point.latitude, longitude: point.longitude },
      target,
    );

    if (distanceKm <= maxDistanceKm && (!best || distanceKm < best.distanceKm)) {
      best = { point, distanceKm };
    }
  }

  return best;
}
