/**
 * Shared vocabulary for describing where a piece of marine data
 * actually came from and how much it should be trusted - used by any
 * adapter/agent that wants to attach honest source metadata instead of
 * silently treating local prototype data and a real external reading
 * the same way.
 *
 * IMPORTANT: nothing here computes risk/route/zone decisions. This is
 * purely descriptive metadata layered on top of facts the deterministic
 * engines already produced.
 */

/**
 * LIVE is reserved for data observed within minutes, from a source
 * Sagar actually queried this request - no adapter currently qualifies
 * (IMD/ISRO require credentials Sagar doesn't have; INCOIS's public
 * ERDDAP data is a multi-week-old satellite/model composite by nature).
 * PROTOTYPE covers Sagar's local demo datasets, which have no real
 * observation timestamp at all - never assign a freshness like RECENT
 * or STALE to data that was never actually observed at a point in time.
 */
export type FreshnessStatus =
  | "LIVE"
  | "RECENT"
  | "AGING"
  | "STALE"
  | "OFFLINE"
  | "UNAVAILABLE"
  | "PROTOTYPE";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ConfidenceAssessment {
  level: ConfidenceLevel;
  /** Plain-language reason, always groundable in what actually happened
   * this request - never a fabricated precision figure. */
  explanation: string;
}

/**
 * A single reading pulled from a real external source (as opposed to
 * Sagar's local prototype dataset). Every field that could be
 * fabricated is optional and left undefined when the source didn't
 * actually provide it - never filled with a guess.
 */
export interface VerifiedSourceReading {
  source: string;
  parameter: string;
  area?: string;
  latitude?: number;
  longitude?: number;
  /** How far the actual queried point is from the requested area - set
   * whenever the source has no data at the requested location and the
   * nearest valid point was used instead, so the gap is never hidden. */
  distanceFromAreaKm?: number;
  value: number | string;
  unit?: string;
  /** The source's own observation/analysis timestamp - never fabricated. */
  observedAt?: string;
  /** When Sagar's backend actually made this request. */
  fetchedAt: string;
  freshness: FreshnessStatus;
  note?: string;
}

export default VerifiedSourceReading;
