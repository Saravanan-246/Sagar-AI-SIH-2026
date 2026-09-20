import alertsData from "../../data/alerts.json";
import { getMarineAreaById, getMarineAreaByName } from "../marine/marineData";
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

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

// How close an alert's own coordinates must be to a configured area's
// centre to count as geographically relevant to it - these are compact
// coastal advisories (e.g. "within 15 nautical miles of the coast"),
// not basin-wide warnings, so a tight radius keeps a real nearby alert
// (e.g. Palk Strait for Northern Gulf of Mannar) while still excluding
// one from a genuinely different stretch of coast (e.g. Chennai for
// Thoothukudi).
const ALERT_RELEVANCE_RADIUS_KM = 75;

/**
 * Resolves `areaIdOrName` to a real configured marine area's real
 * coordinates - by id, then by name - or `null` if it doesn't match
 * any configured area. Never defaults to "the first configured area"
 * the way getMarineArea() does elsewhere: doing so here would silently
 * geo-match an unrecognised area query against the wrong place.
 */
function resolveAreaCoordinates(
  areaIdOrName: string
): { latitude: number; longitude: number } | null {
  const area =
    getMarineAreaById(areaIdOrName) ?? getMarineAreaByName(areaIdOrName);

  return area ? area.coordinates : null;
}

/**
 * Alerts explicitly naming the requested area (by id/name text, or by
 * real geographic proximity to it) - never every active alert. A
 * caller that wants everything should call getAlerts()/getActiveAlerts()
 * directly rather than passing no area here; passing a real area that
 * simply has no relevant alert now correctly returns an empty list
 * instead of silently attaching unrelated alerts from elsewhere (e.g.
 * Chennai/Kanyakumari/Palk Strait alerts previously appeared for every
 * area, including Thoothukudi, whenever none of them matched by text).
 */
export function getAlertsByArea(areaName?: string): Alert[] {
  if (!areaName || !areaName.trim()) {
    return [...normalizedAlerts];
  }

  const query = areaName.trim().toLowerCase();

  const textMatched = normalizedAlerts.filter(
    (a) =>
      a.location.name.toLowerCase().includes(query) ||
      a.title.toLowerCase().includes(query) ||
      a.summary.toLowerCase().includes(query)
  );

  if (textMatched.length > 0) {
    return textMatched;
  }

  const areaCoordinates = resolveAreaCoordinates(areaName.trim());

  if (!areaCoordinates) {
    return [];
  }

  return normalizedAlerts.filter(
    (a) =>
      haversineDistanceKm(areaCoordinates, {
        latitude: a.location.latitude,
        longitude: a.location.longitude,
      }) <= ALERT_RELEVANCE_RADIUS_KM
  );
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