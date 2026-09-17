import type { FreshnessStatus } from "./dataContract";

/**
 * Different marine parameters go stale at very different rates - a
 * cyclone warning from 6 hours ago is dangerously out of date, while a
 * 10-day ocean-model composite is normal and expected to be days old.
 * Using one global threshold for everything would either call slow-
 * moving oceanographic data "STALE" constantly (crying wolf) or call
 * a genuinely outdated cyclone warning "RECENT" (actually dangerous).
 * Each domain gets its own thresholds instead, in minutes.
 */
export type FreshnessDomain =
  | "cyclone_alert"
  | "weather_observation"
  | "marine_observation"
  | "pfz_advisory"
  | "ocean_composite";

interface Thresholds {
  liveMinutes: number;
  recentMinutes: number;
  agingMinutes: number;
  // Beyond agingMinutes: STALE.
}

const THRESHOLDS: Record<FreshnessDomain, Thresholds> = {
  // A cyclone/hazard warning is safety-critical - even a couple of
  // hours old is worth flagging as aging.
  cyclone_alert: { liveMinutes: 15, recentMinutes: 60, agingMinutes: 180 },
  // Wind/wave/visibility observations change over a single fishing trip.
  weather_observation: { liveMinutes: 15, recentMinutes: 60, agingMinutes: 360 },
  marine_observation: { liveMinutes: 15, recentMinutes: 60, agingMinutes: 360 },
  // PFZ advisories are issued roughly once a day.
  pfz_advisory: { liveMinutes: 60, recentMinutes: 24 * 60, agingMinutes: 48 * 60 },
  // Satellite/ocean-model composites (SST, ARGO analyses) are normal
  // and expected to lag real time by days to a couple of weeks - the
  // INCOIS ERDDAP datasets Sagar can actually reach update roughly
  // every 10 days. "AGING" only kicks in well past that normal cadence.
  ocean_composite: { liveMinutes: 60, recentMinutes: 14 * 24 * 60, agingMinutes: 45 * 24 * 60 },
};

/**
 * Local prototype data (Sagar's configured demo datasets) has no real
 * observation timestamp at all - `observedAt` should be left undefined
 * for it, which this always resolves to "PROTOTYPE" rather than
 * guessing an age from a file-modified time or similar.
 */
export function computeFreshness(
  domain: FreshnessDomain,
  observedAt: string | undefined,
  fetchedAt: string = new Date().toISOString()
): FreshnessStatus {
  if (!observedAt) {
    return "PROTOTYPE";
  }

  const observedMs = Date.parse(observedAt);
  const fetchedMs = Date.parse(fetchedAt);

  if (!Number.isFinite(observedMs) || !Number.isFinite(fetchedMs)) {
    return "UNAVAILABLE";
  }

  const ageMinutes = (fetchedMs - observedMs) / 60000;

  if (ageMinutes < 0) {
    // A source timestamp in the future relative to our clock is a data
    // quality problem, not freshness - never present it as current.
    return "UNAVAILABLE";
  }

  const { liveMinutes, recentMinutes, agingMinutes } = THRESHOLDS[domain];

  if (ageMinutes <= liveMinutes) return "LIVE";
  if (ageMinutes <= recentMinutes) return "RECENT";
  if (ageMinutes <= agingMinutes) return "AGING";
  return "STALE";
}

/** Human-readable "updated N ago" for the given ISO timestamp, for UI
 * display - never a fake precision like exact seconds for old data. */
export function describeAge(observedAt: string, now: number = Date.now()): string {
  const observedMs = Date.parse(observedAt);
  if (!Number.isFinite(observedMs)) return "unknown age";

  const minutes = Math.max(0, Math.round((now - observedMs) / 60000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;

  const weeks = Math.round(days / 7);
  return `${weeks} wk ago`;
}

export default computeFreshness;
