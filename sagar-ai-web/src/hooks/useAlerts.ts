import { useCallback, useEffect, useState } from "react";

import { fetchAlerts } from "../services/api/sagarApiClient";

import {
  getAlerts,
  getActiveAlerts,
  getAlertsByArea,
  getAlertsByType,
  getAlertsBySeverity,
} from "../services/alerts/alertService";

import type { Alert } from "../types/alert";

type UseAlertsOptions = {
  areaId?: string;
  type?: string;
  severity?: string;
  activeOnly?: boolean;
};

function resolveAlertsLocally(
  options: UseAlertsOptions
): Alert[] {
  let result: Alert[] = getAlerts();

  if (options.activeOnly ?? true) {
    result = getActiveAlerts().filter((alert) =>
      result.some((item) => item.id === alert.id)
    );
  }

  if (options.areaId) {
    const areaFiltered = getAlertsByArea(options.areaId);
    result = result.filter((alert) =>
      areaFiltered.some((item) => item.id === alert.id)
    );
  }

  if (options.type) {
    const typeFiltered = getAlertsByType(options.type);
    result = result.filter((alert) =>
      typeFiltered.some((item) => item.id === alert.id)
    );
  }

  if (options.severity) {
    const severityFiltered = getAlertsBySeverity(options.severity);
    result = result.filter((alert) =>
      severityFiltered.some((item) => item.id === alert.id)
    );
  }

  return result;
}

export function useAlerts(options: UseAlertsOptions = {}) {
  const {
    areaId,
    type,
    severity,
    activeOnly = true,
  } = options;

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAlerts({
        areaName: areaId,
        type,
        severity,
      });

      setAlerts(result);
    } catch (err) {
      console.warn(
        "Sagar backend is unavailable, using local alert data:",
        err
      );

      try {
        setAlerts(
          resolveAlertsLocally({ areaId, type, severity, activeOnly })
        );
      } catch (localErr) {
        console.error("Failed to load marine alerts:", localErr);
        setAlerts([]);
        setError("Unable to load marine alerts.");
      }
    } finally {
      setLoading(false);
    }
  }, [activeOnly, areaId, type, severity]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const refresh = useCallback(() => {
    loadAlerts();
  }, [loadAlerts]);

  return {
    alerts,
    loading,
    error,
    refresh,
    hasAlerts: alerts.length > 0,
  };
}

export function useActiveAlerts() {
  return useAlerts({
    activeOnly: true,
  });
}
