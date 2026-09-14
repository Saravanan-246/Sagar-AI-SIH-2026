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
        result = getActiveAlerts(result);
      }

      if (areaId) {
        result = getAlertsByArea(result, areaId);
      }

      if (type) {
        result = getAlertsByType(result, type);
      }

      if (severity) {
        result = getAlertsBySeverity(result, severity);
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