import { useCallback, useState } from "react";

import { fetchMarineAreas, fetchAlerts } from "../services/api/sagarApiClient";
import {
  getOfflineSnapshot,
  saveOfflineSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  type OfflineSnapshot,
  type SnapshotSourceMeta,
} from "../services/offline/offlineSnapshot";

export type SyncStatus = "idle" | "syncing" | "success" | "failed";

interface UseOfflineSyncReturn {
  snapshot: OfflineSnapshot | null;
  syncStatus: SyncStatus;
  syncError: string | null;
  /** Fetches current marine/alert data and saves a new snapshot. Uses
   * Promise.allSettled so one source failing doesn't discard data the
   * other source successfully returned (Phase 4 Part 19 / test F). If
   * every source fails, the previous valid snapshot is left untouched
   * (Part 19 / test G) - sync never overwrites good data with empty
   * data. */
  sync: () => Promise<{ success: boolean; message: string }>;
}

/**
 * "Sync for offline" - a single controlled action, never a background
 * poller (Phase 4 Part 8/13/18: no automatic repeated requests). Only
 * fires when the user explicitly asks, or once on reconnect (wired by
 * the caller), matching the existing app's "explicit user action"
 * pattern rather than introducing new polling infrastructure.
 */
export function useOfflineSync(): UseOfflineSyncReturn {
  const [snapshot, setSnapshot] = useState<OfflineSnapshot | null>(() =>
    getOfflineSnapshot()
  );
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncError, setSyncError] = useState<string | null>(null);

  const sync = useCallback(async () => {
    setSyncStatus("syncing");
    setSyncError(null);

    const [marineResult, alertsResult] = await Promise.allSettled([
      fetchMarineAreas(),
      fetchAlerts(),
    ]);

    const marineMeta: SnapshotSourceMeta =
      marineResult.status === "fulfilled"
        ? { status: "success", recordCount: marineResult.value.length }
        : {
            status: "failed",
            recordCount: 0,
            error:
              marineResult.reason instanceof Error
                ? marineResult.reason.message
                : "Marine data request failed.",
          };

    const alertsMeta: SnapshotSourceMeta =
      alertsResult.status === "fulfilled"
        ? { status: "success", recordCount: alertsResult.value.length }
        : {
            status: "failed",
            recordCount: 0,
            error:
              alertsResult.reason instanceof Error
                ? alertsResult.reason.message
                : "Alert data request failed.",
          };

    // Both sources failed - nothing new to save. Keep the previous
    // snapshot exactly as it was (Part 19, test G: complete sync
    // failure retains the previous snapshot).
    if (marineMeta.status === "failed" && alertsMeta.status === "failed") {
      setSyncStatus("failed");
      const message =
        "Sagar could not reach the backend - staying on the last synced data.";
      setSyncError(message);
      return { success: false, message };
    }

    const previous = getOfflineSnapshot();

    // A source that failed this round keeps its last successfully
    // synced data rather than being wiped to an empty array (Part 19,
    // test F: one source failed, retain usable data from the other).
    const nextSnapshot: OfflineSnapshot = {
      schemaVersion: SNAPSHOT_SCHEMA_VERSION,
      snapshotVersion: (previous?.snapshotVersion ?? 0) + 1,
      createdAt: new Date().toISOString(),
      marineAreas:
        marineResult.status === "fulfilled"
          ? marineResult.value
          : (previous?.marineAreas ?? []),
      alerts:
        alertsResult.status === "fulfilled"
          ? alertsResult.value
          : (previous?.alerts ?? []),
      sources: {
        marine: marineMeta,
        alerts: alertsMeta,
      },
    };

    const outcome = saveOfflineSnapshot(nextSnapshot);

    if (!outcome.saved) {
      setSyncStatus("failed");
      const message = outcome.reason ?? "Could not save the offline snapshot.";
      setSyncError(message);
      return { success: false, message };
    }

    setSnapshot(nextSnapshot);
    setSyncStatus("success");

    const partial = marineMeta.status === "failed" || alertsMeta.status === "failed";

    return {
      success: true,
      message: partial
        ? "Synced with one source unavailable - the rest of the last good data was kept."
        : "Ready for offline use.",
    };
  }, []);

  return { snapshot, syncStatus, syncError, sync };
}

/**
 * Age of the snapshot in a short human-readable form, matching the
 * Phase 3 freshness engine's style ("N min ago" / "N h ago") - real
 * elapsed time from the snapshot's own createdAt, never fabricated.
 */
export function describeSnapshotAge(createdAt: string, now: number = Date.now()): string {
  const createdMs = Date.parse(createdAt);
  if (!Number.isFinite(createdMs)) return "unknown age";

  const minutes = Math.max(0, Math.round((now - createdMs) / 60000));

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) {
    return remMinutes > 0 ? `${hours}h ${remMinutes}m ago` : `${hours}h ago`;
  }

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default useOfflineSync;
