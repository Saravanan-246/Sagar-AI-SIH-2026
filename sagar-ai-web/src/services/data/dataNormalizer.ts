import type {
  Alert,
  AlertSeverity,
} from "../../types/alert";

import type {
  MarineArea,
} from "../../types/marine";

import type {
  RoutePlan,
} from "../../types/route";

import type {
  ScenarioDefinition,
} from "../../types/scenario";

export interface NormalizedMarineRecord {
  id: string;
  type: "marine";

  name: string;

  latitude: number;
  longitude: number;

  windSpeedKnots?: number;
  windDirection?: string;

  waveHeightM?: number;
  waveDirection?: string;

  seaState?: string;
  visibilityKm?: number;

  seaSurfaceTemperatureC?: number;
  chlorophyllMgM3?: number;

  productivitySignal?: string;

  riskLevel?: string;
  riskScore?: number;

  updatedAt?: string;

  raw: MarineArea;
}

export interface NormalizedAlertRecord {
  id: string;
  type: "alert";

  title: string;

  severity: AlertSeverity;
  status: Alert["status"];

  alertType: Alert["type"];

  latitude: number;
  longitude: number;

  radiusKm?: number;

  source?: string;

  issuedAt?: string;
  validUntil?: string;

  summary?: string;

  raw: Alert;
}

export interface NormalizedRouteRecord {
  id: string;
  type: "route";

  name: string;

  origin: {
    latitude: number;
    longitude: number;
  };

  destination: {
    latitude: number;
    longitude: number;
  };

  distanceKm: number;
  durationHours: number;

  riskLevel: string;
  riskScore: number;

  status: string;

  raw: RoutePlan;
}

export interface NormalizedScenarioRecord {
  id: string;
  type: "scenario";

  name: string;

  scenarioType: string;

  description?: string;

  areaId?: string;

  raw: ScenarioDefinition;
}

export type NormalizedRecord =
  | NormalizedMarineRecord
  | NormalizedAlertRecord
  | NormalizedRouteRecord
  | NormalizedScenarioRecord;

function finiteNumber(
  value: unknown
): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : undefined;
}

function stringValue(
  value: unknown
): string | undefined {
  return typeof value === "string" &&
    value.trim()
    ? value.trim()
    : undefined;
}

export function normalizeMarineArea(
  area: MarineArea
): NormalizedMarineRecord {
  return {
    id: area.id,
    type: "marine",

    name: area.name,

    latitude:
      area.coordinates.latitude,

    longitude:
      area.coordinates.longitude,

    windSpeedKnots:
      finiteNumber(
        area.conditions
          .windSpeedKnots
      ),

    windDirection:
      stringValue(
        area.conditions
          .windDirection
      ),

    waveHeightM:
      finiteNumber(
        area.conditions
          .waveHeightM
      ),

    waveDirection:
      stringValue(
        area.conditions
          .waveDirection
      ),

    seaState:
      stringValue(
        area.conditions
          .seaState
      ),

    visibilityKm:
      finiteNumber(
        area.conditions
          .visibilityKm
      ),

    seaSurfaceTemperatureC:
      finiteNumber(
        area.marineIndicators
          .seaSurfaceTemperatureC
      ),

    chlorophyllMgM3:
      finiteNumber(
        area.marineIndicators
          .chlorophyllMgM3
      ),

    productivitySignal:
      stringValue(
        area.marineIndicators
          .productivitySignal
      ),

    riskLevel:
      stringValue(
        area.safety
          .overallRisk
      ),

    riskScore:
      finiteNumber(
        area.safety
          .riskScore
      ),

    updatedAt:
      stringValue(
        area.updatedAt
      ),

    raw: area,
  };
}

export function normalizeMarineAreas(
  areas: MarineArea[]
): NormalizedMarineRecord[] {
  return areas.map(
    normalizeMarineArea
  );
}

export function normalizeAlert(
  alert: Alert
): NormalizedAlertRecord {
  return {
    id: alert.id,
    type: "alert",

    title: alert.title,

    severity:
      alert.severity,

    status:
      alert.status,

    alertType:
      alert.type,

    latitude:
      alert.location.latitude,

    longitude:
      alert.location.longitude,

    radiusKm:
      finiteNumber(
        alert.location.radiusKm
      ),

    source:
      stringValue(
        alert.source
      ),

    issuedAt:
      stringValue(
        alert.issuedAt
      ),

    validUntil:
      stringValue(
        alert.validUntil
      ),

    summary:
      stringValue(
        alert.summary
      ),

    raw: alert,
  };
}

export function normalizeAlerts(
  alerts: Alert[]
): NormalizedAlertRecord[] {
  return alerts.map(
    normalizeAlert
  );
}

export function normalizeRoute(
  route: RoutePlan
): NormalizedRouteRecord {
  return {
    id: route.id,
    type: "route",

    name: route.name,

    origin: {
      latitude:
        route.origin.latitude,

      longitude:
        route.origin.longitude,
    },

    destination: {
      latitude:
        route.destination.latitude,

      longitude:
        route.destination.longitude,
    },

    distanceKm:
      route.distanceKm,

    durationHours:
      route.durationHours,

    riskLevel:
      route.riskLevel,

    riskScore:
      route.riskScore,

    status:
      route.status,

    raw: route,
  };
}

export function normalizeRoutes(
  routes: RoutePlan[]
): NormalizedRouteRecord[] {
  return routes.map(
    normalizeRoute
  );
}

export function normalizeScenario(
  scenario: ScenarioDefinition
): NormalizedScenarioRecord {
  return {
    id: scenario.id,

    type: "scenario",

    name: scenario.name,

    scenarioType:
      scenario.type,

    description:
      stringValue(
        scenario.description
      ),

    areaId:
      stringValue(
        scenario.areaId
      ),

    raw: scenario,
  };
}

export function normalizeScenarios(
  scenarios: ScenarioDefinition[]
): NormalizedScenarioRecord[] {
  return scenarios.map(
    normalizeScenario
  );
}

export function normalizeMarineSnapshot(
  area: MarineArea
): Record<string, unknown> {
  const normalized =
    normalizeMarineArea(
      area
    );

  return {
    id: normalized.id,
    type: normalized.type,
    name: normalized.name,

    coordinates: {
      latitude:
        normalized.latitude,

      longitude:
        normalized.longitude,
    },

    conditions: {
      windSpeedKnots:
        normalized.windSpeedKnots,

      windDirection:
        normalized.windDirection,

      waveHeightM:
        normalized.waveHeightM,

      waveDirection:
        normalized.waveDirection,

      seaState:
        normalized.seaState,

      visibilityKm:
        normalized.visibilityKm,
    },

    ocean: {
      seaSurfaceTemperatureC:
        normalized.seaSurfaceTemperatureC,

      chlorophyllMgM3:
        normalized.chlorophyllMgM3,

      productivitySignal:
        normalized.productivitySignal,
    },

    safety: {
      riskLevel:
        normalized.riskLevel,

      riskScore:
        normalized.riskScore,
    },

    updatedAt:
      normalized.updatedAt,
  };
}

export function mergeRecords(
  ...groups: NormalizedRecord[][]
): NormalizedRecord[] {
  const map = new Map<
    string,
    NormalizedRecord
  >();

  for (const group of groups) {
    for (const record of group) {
      map.set(
        `${record.type}-${record.id}`,
        record
      );
    }
  }

  return Array.from(
    map.values()
  );
}

export function filterRecordsByType(
  records: NormalizedRecord[],
  type: NormalizedRecord["type"]
): NormalizedRecord[] {
  return records.filter(
    (record) =>
      record.type === type
  );
}

export default normalizeMarineArea;