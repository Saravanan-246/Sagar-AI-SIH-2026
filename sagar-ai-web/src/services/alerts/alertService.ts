import alertsData from "../../data/alerts.json";
import type { Alert, AlertSeverity, AlertType } from "../../types/alert";

// Defensive array extraction
const rawAlertList: any[] = Array.isArray(alertsData)
  ? alertsData
  : Array.isArray((alertsData as any)?.alerts)
  ? (alertsData as any).alerts
  : [];

const SEVERITY_MAP: Record<string, AlertSeverity> = {
  low: "low",
  minor: "low",
  moderate: "moderate",
  warning: "high",
  high: "high",
  severe: "critical",
  critical: "critical",
  extreme: "critical",
};

function mapSeverity(value: unknown): AlertSeverity {
  const key = String(value ?? "").trim().toLowerCase();
  return SEVERITY_MAP[key] ?? "moderate";
}

const TYPE_MAP: Record<string, AlertType> = {
  cyclone: "cyclone",
  lightning: "lightning",
  thunderstorm: "lightning",
  "high waves": "high_waves",
  high_waves: "high_waves",
  "rough sea": "rough_sea",
  rough_sea: "rough_sea",
  squall: "strong_wind",
  "strong wind": "strong_wind",
  strong_wind: "strong_wind",
  visibility: "visibility",
  fog: "visibility",
  "restricted area": "restricted_area",
  restricted_area: "restricted_area",
  "rapid weather change": "rapid_weather_change",
};

function mapType(value: unknown): AlertType {
  const key = String(value ?? "").trim().toLowerCase();
  return TYPE_MAP[key] ?? "general";
}

function buildRecommendation(type: AlertType): string {
  switch (type) {
    case "cyclone":
      return "Do not proceed while cyclone risk is active.";
    case "lightning":
      return "Consider postponing operations while lightning activity remains active.";
    case "rough_sea":
    case "high_waves":
      return "Avoid unnecessary exposure to rough sea conditions and review a safer operating plan.";
    case "strong_wind":
      return "Reassess departure timing and route selection before operating.";
    case "visibility":
      return "Use additional navigation caution under reduced visibility.";
    case "restricted_area":
      return "Avoid entering the restricted area.";
    default:
      return "Review the current marine conditions before continuing operations.";
  }
}

function addHours(isoTime: string, hours: number): string {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
  }
  return new Date(date.getTime() + hours * 60 * 60 * 1000).toISOString();
}

function normalizeAlert(item: any, index: number): Alert {
  const type = mapType(item.type);
  const severity = mapSeverity(item.severity);
  const region = item.region || item.area || "Coastal Tamil Nadu";
  const latitude = item.latitude ?? item.lat ?? 8.7642;
  const longitude = item.longitude ?? item.lng ?? item.lon ?? 78.1348;
  const message = item.message || item.description || item.summary || "Active advisory in this sector.";
  const issuedAt = item.issuedAt || new Date().toISOString();

  return {
    id: item.id || `alert-${index}`,
    type,
    severity,
    status: item.status ?? "active",

    title: item.title || "Marine Alert",
    summary: item.summary || message,
    description: item.description || message,

    source: item.source || "Sagar Alert Dataset",

    location: {
      name: region,
      latitude,
      longitude,
      radiusKm: item.radiusKm,
    },

    issuedAt,
    validUntil: item.validUntil || addHours(issuedAt, 12),

    recommendation: item.recommendation || buildRecommendation(type),

    metadata: {
      region,
      rawType: item.type,
      rawSeverity: item.severity,
    },
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
      a.location.name.toLowerCase().includes(query) ||
      a.title.toLowerCase().includes(query) ||
      a.summary.toLowerCase().includes(query)
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