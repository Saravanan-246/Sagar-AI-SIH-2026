import type { MarineArea } from "../../types/marine";
import type { Alert } from "../../types/alert";

/**
 * Sagar's offline snapshot - the minimum data needed to keep the
 * deterministic decision engines (hazard/risk, fishing-zone ranking,
 * route ranking) working when the backend is unreachable.
 *
 * Only marine-area conditions and alerts are captured here: they are
 * the genuinely dynamic parts of Sagar's data (the only fields the
 * backend can actually change between syncs). Fishing zones, routes
 * and marine boundaries are reference datasets that already ship
 * bundled with the app (src/data/*.json) and are available offline
 * with zero sync required - duplicating them into the snapshot would
 * only bloat it without adding real freshness, so they are
 * deliberately left out (see PHASE 4 report for the full rationale).
 */
export const SNAPSHOT_SCHEMA_VERSION = 1;

export type SourceSyncStatus = "success" | "failed";

export interface SnapshotSourceMeta {
  status: SourceSyncStatus;
  recordCount: number;
  /** Only present when status is "failed". */
  error?: string;
}

export interface OfflineSnapshot {
  schemaVersion: number;
  /** Increments on every successful sync - a simple, sufficient
   * version identifier for this project's scale (see Phase 4 Part 10:
   * "do not over-engineer delta sync unless there is a real need"). */
  snapshotVersion: number;
  /** When this snapshot was actually built - the sole basis for every
   * "Last synced" / age display. Never fabricated. */
  createdAt: string;

  marineAreas: MarineArea[];
  alerts: Alert[];

  sources: {
    marine: SnapshotSourceMeta;
    alerts: SnapshotSourceMeta;
  };
}

const STORAGE_KEY = "sagar-ai-offline-snapshot";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates the minimum shape/ranges needed to trust a snapshot before
 * it's used by the decision engines or allowed to overwrite the last
 * good one (Phase 4 Part 9 / Part 22). Deliberately conservative: any
 * structural doubt rejects the whole snapshot rather than risk feeding
 * malformed coordinates or scores into a safety decision.
 */
export function validateSnapshot(value: unknown): value is OfflineSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<OfflineSnapshot>;

  if (snapshot.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) return false;
  if (!isFiniteNumber(snapshot.snapshotVersion)) return false;

  if (typeof snapshot.createdAt !== "string") return false;
  const createdMs = Date.parse(snapshot.createdAt);
  if (!Number.isFinite(createdMs) || createdMs > Date.now() + 60_000) {
    // Reject a timestamp in the future (beyond a small clock-skew
    // allowance) - never trust a snapshot claiming to be from later
    // than now.
    return false;
  }

  if (!Array.isArray(snapshot.marineAreas)) return false;
  if (!Array.isArray(snapshot.alerts)) return false;

  const areasValid = snapshot.marineAreas.every(
    (area) =>
      area &&
      typeof area.id === "string" &&
      typeof area.name === "string" &&
      isFiniteNumber(area.coordinates?.latitude) &&
      isFiniteNumber(area.coordinates?.longitude) &&
      area.coordinates.latitude >= -90 &&
      area.coordinates.latitude <= 90 &&
      area.coordinates.longitude >= -180 &&
      area.coordinates.longitude <= 180 &&
      isFiniteNumber(area.safety?.riskScore)
  );

  if (!areasValid) return false;

  if (!snapshot.sources || typeof snapshot.sources !== "object") return false;

  return true;
}

let cachedSnapshot: OfflineSnapshot | null | undefined;

/** Reads the current snapshot from storage, validating it first. A
 * corrupted or malformed entry is treated as "no snapshot" rather than
 * risking bad data reaching a safety decision - it is never deleted
 * automatically (Part 9: "the old valid snapshot must remain
 * available"), so a later successful sync can still overwrite it. */
export function getOfflineSnapshot(): OfflineSnapshot | null {
  if (cachedSnapshot !== undefined) {
    return cachedSnapshot;
  }

  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedSnapshot = null;
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!validateSnapshot(parsed)) {
      console.warn(
        "Sagar: stored offline snapshot failed validation and was ignored."
      );
      cachedSnapshot = null;
      return null;
    }

    cachedSnapshot = parsed;
    return parsed;
  } catch {
    cachedSnapshot = null;
    return null;
  }
}

/** Persists a new snapshot only after validating it - a failed
 * validation never touches storage, so whatever snapshot was already
 * there (valid or absent) is left exactly as it was. */
export function saveOfflineSnapshot(
  snapshot: OfflineSnapshot
): { saved: boolean; reason?: string } {
  if (!validateSnapshot(snapshot)) {
    return { saved: false, reason: "Snapshot failed validation." };
  }

  if (typeof window === "undefined") {
    return { saved: false, reason: "No storage available." };
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    cachedSnapshot = snapshot;
    return { saved: true };
  } catch (error) {
    return {
      saved: false,
      reason:
        error instanceof Error ? error.message : "Unable to write to storage.",
    };
  }
}

export function clearOfflineSnapshot(): void {
  cachedSnapshot = null;

  if (typeof window === "undefined") return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors.
  }
}
