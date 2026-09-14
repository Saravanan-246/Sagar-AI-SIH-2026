import { useCallback, useEffect, useState } from "react";

import {
  getAlerts,
  getActiveAlerts,
  getAlertsByArea,
  getAlertsBySeverity,
  getAlertsByType,
} from "../services/alerts/alertService";

import type { Alert } from "../types/alert";

type UseAlertsOptions = {
  areaId?: string;
  type?: string;
  severity?: string;
  activeOnly?: boolean;
};

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

  const loadAlerts = useCallback(() => {
    setLoading(true);
    setError(null);

    try {
      let result: Alert[] = getAlerts();

      if (activeOnly) {
        result = getActiveAlerts().filter((alert) =>
          result.some((item) => item.id === alert.id)
        );
      }

      if (areaId) {
        const areaFiltered = getAlertsByArea(areaId);
        result = result.filter((alert) =>
          areaFiltered.some((item) => item.id === alert.id)
        );
      }

      if (type) {
        const typeFiltered = getAlertsByType(type);
        result = result.filter((alert) =>
          typeFiltered.some((item) => item.id === alert.id)
        );
      }

      if (severity) {
        const severityFiltered = getAlertsBySeverity(severity);
        result = result.filter((alert) =>
          severityFiltered.some((item) => item.id === alert.id)
        );
      }

      setAlerts(result);
    } catch (err) {
      console.error("Failed to load marine alerts:", err);
      setAlerts([]);
      setError("Unable to load marine alerts.");
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