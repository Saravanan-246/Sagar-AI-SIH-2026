import alertsData from "../../data/alerts.json";
import type { Alert } from "../../types/alert";

// Defensive array extraction
const rawAlertList: any[] = Array.isArray(alertsData)
  ? alertsData
  : Array.isArray((alertsData as any)?.alerts)
  ? (alertsData as any).alerts
  : [];

function normalizeAlert(item: any, index: number): Alert {
  return {
    id: item.id || `alert-${index}`,
    title: item.title || "Marine Alert",
    type: item.type || "Weather",
    severity: item.severity || "Moderate",
    region: item.region || item.area || "Coastal Tamil Nadu",
    latitude: item.latitude ?? item.lat ?? 8.7642,
    longitude: item.longitude ?? item.lng ?? item.lon ?? 78.1348,
    message: item.message || item.description || "Active advisory in this sector.",
    issuedAt: item.issuedAt || new Date().toISOString(),
  };
}

const normalizedAlerts: Alert[] = rawAlertList.map(normalizeAlert);

export function getAlerts(): Alert[] {
  return [...normalizedAlerts];
}

export function getActiveAlerts(): Alert[] {
  return [...normalizedAlerts];
}

export function getAlertsByArea(areaName?: string): Alert[] {
  if (!areaName || !areaName.trim()) {
    return [...normalizedAlerts];
  }
  const query = areaName.trim().toLowerCase();
  const matched = normalizedAlerts.filter(
    (a) =>
      a.region.toLowerCase().includes(query) ||
      a.title.toLowerCase().includes(query) ||
      a.message.toLowerCase().includes(query)
  );
  return matched.length > 0 ? matched : [...normalizedAlerts];
}

export function getAlertsByRegion(region: string): Alert[] {
  return getAlertsByArea(region);
}

export function getAlertsBySeverity(severity: string): Alert[] {
  if (!severity || !severity.trim()) {
    return [...normalizedAlerts];
  }
  const target = severity.trim().toLowerCase();
  return normalizedAlerts.filter((a) => a.severity.toLowerCase() === target);
}

export function getAlertsByType(type: string): Alert[] {
  if (!type || !type.trim()) {
    return [...normalizedAlerts];
  }
  const target = type.trim().toLowerCase();
  return normalizedAlerts.filter((a) => a.type.toLowerCase() === target);
}

export function getActiveAlertCount(): number {
  return normalizedAlerts.length;
}

export function getAlertById(id: string): Alert | undefined {
  if (!id) return undefined;
  return normalizedAlerts.find((a) => a.id.toLowerCase() === id.trim().toLowerCase());
}

export function getCriticalAlerts(): Alert[] {
  return normalizedAlerts.filter(
    (a) =>
      a.severity.toLowerCase() === "high" ||
      a.severity.toLowerCase() === "severe" ||
      a.severity.toLowerCase() === "critical"
  );
}

export function hasActiveWarnings(): boolean {
  return normalizedAlerts.length > 0;
}

export default {
  getAlerts,
  getActiveAlerts,
  getAlertsByArea,
  getAlertsByRegion,
  getAlertsBySeverity,
  getAlertsByType,
  getActiveAlertCount,
  getAlertById,
  getCriticalAlerts,
  hasActiveWarnings,
};