import {
  assessHazards,
  type HazardObservation,
} from "./hazardEngine";

import {
  checkGeofence,
  type GeoPoint,
  type GeofenceResult,
} from "./geofenceEngine";

import type {
  AlertSeverity,
} from "../../types/alert";

export type SafetyAlertType =
  | "hazard"
  | "geofence"
  | "combined";

export interface SafetyAlert {
  id: string;

  type: SafetyAlertType;

  severity: AlertSeverity;

  title: string;
  message: string;

  areaId?: string;
  areaName?: string;

  hazardType?: string;
  boundaryId?: string;

  source?: string;

  createdAt: string;

  validUntil?: string;

  actionable: boolean;

  recommendation: string;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface AlertEngineResult {
  alerts: SafetyAlert[];

  highestSeverity:
    | AlertSeverity
    | "none";

  hasCriticalAlert: boolean;

  hasActionableAlert: boolean;

  generatedAt: string;
}

const SEVERITY_ORDER: Record<
  AlertSeverity,
  number
> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function severityFromHazard(
  hazard: HazardObservation
): AlertSeverity {
  return hazard.severity;
}

function createId(
  prefix: string,
  value: string
): string {
  return `${prefix}-${value}`;
}

function createHazardAlert(
  hazard: HazardObservation,
  areaId?: string,
  areaName?: string
): SafetyAlert {
  return {
    id: createId(
      "hazard-alert",
      hazard.type
    ),

    type: "hazard",

    severity:
      severityFromHazard(
        hazard
      ),

    title:
      hazard.title,

    message:
      hazard.description,

    areaId,
    areaName,

    hazardType:
      hazard.type,

    source:
      hazard.source,

    createdAt:
      new Date().toISOString(),

    validUntil:
      hazard.validUntil,

    actionable:
      hazard.active,

    recommendation:
      getHazardRecommendation(
        hazard
      ),

    metadata:
      hazard.metadata,
  };
}

function getHazardRecommendation(
  hazard: HazardObservation
): string {
  switch (hazard.type) {
    case "cyclone":
      return "Do not proceed while cyclone risk is active.";

    case "lightning":
      return "Consider postponing operations while lightning activity remains active.";

    case "rough_sea":
    case "high_waves":
      return "Review a safer operating plan and avoid unnecessary exposure to rough sea conditions.";

    case "strong_wind":
      return "Reassess departure timing and route selection before operating.";

    case "poor_visibility":
      return "Exercise additional navigation caution under reduced visibility.";

    case "rapid_weather_change":
      return "Monitor conditions closely and reassess the operation before departure.";

    case "restricted_area":
      return "Avoid entering the restricted area.";

    default:
      return "Review the current marine conditions before continuing operations.";
  }
}

function createGeofenceAlert(
  result: GeofenceResult,
  areaName?: string
): SafetyAlert | null {
  if (
    result.severity ===
    "safe"
  ) {
    return null;
  }

  let severity:
    AlertSeverity;

  switch (result.severity) {
    case "critical":
      severity = "critical";
      break;

    case "high":
      severity = "high";
      break;

    case "warning":
      severity = "moderate";
      break;

    case "info":
      severity = "low";
      break;

    default:
      severity = "low";
  }

  let recommendation =
    "Maintain safe separation from the identified boundary.";

  if (
    result.action ===
    "exit"
  ) {
    recommendation =
      "Exit the restricted or protected boundary immediately.";
  } else if (
    result.action ===
    "avoid"
  ) {
    recommendation =
      "Avoid the boundary and consider an alternative route.";
  } else if (
    result.action ===
    "warn"
  ) {
    recommendation =
      "Monitor your position and do not enter the restricted boundary.";
  }

  return {
    id: createId(
      "geofence-alert",
      result.boundaryId
    ),

    type: "geofence",

    severity,

    title:
      result.inside
        ? `Inside ${result.boundaryName}`
        : `${result.boundaryName} nearby`,

    message:
      result.message,

    areaName,

    boundaryId:
      result.boundaryId,

    createdAt:
      new Date().toISOString(),

    actionable:
      result.action !==
      "none",

    recommendation,

    metadata: {
      distanceKm:
        result.distanceKm,

      inside:
        result.inside,

      boundaryType:
        result.type,

      boundaryCategory:
        result.category,
    },
  };
}

function deduplicateAlerts(
  alerts: SafetyAlert[]
): SafetyAlert[] {
  const map = new Map<
    string,
    SafetyAlert
  >();

  for (const alert of alerts) {
    const key =
      `${alert.type}-${alert.hazardType ?? alert.boundaryId ?? alert.id}`;

    const existing =
      map.get(key);

    if (!existing) {
      map.set(
        key,
        alert
      );
      continue;
    }

    if (
      SEVERITY_ORDER[
        alert.severity
      ] >
      SEVERITY_ORDER[
        existing.severity
      ]
    ) {
      map.set(
        key,
        alert
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function sortAlerts(
  alerts: SafetyAlert[]
): SafetyAlert[] {
  return [...alerts].sort(
    (a, b) => {
      const severityDifference =
        SEVERITY_ORDER[
          b.severity
        ] -
        SEVERITY_ORDER[
          a.severity
        ];

      if (
        severityDifference !==
        0
      ) {
        return severityDifference;
      }

      return (
        new Date(
          b.createdAt
        ).getTime() -
        new Date(
          a.createdAt
        ).getTime()
      );
    }
  );
}

function getHighestSeverity(
  alerts: SafetyAlert[]
): AlertSeverity | "none" {
  if (alerts.length === 0) {
    return "none";
  }

  return alerts.reduce(
    (highest, alert) =>
      SEVERITY_ORDER[
        alert.severity
      ] >
      SEVERITY_ORDER[
        highest
      ]
        ? alert.severity
        : highest,
    alerts[0].severity
  );
}

function buildCombinedAlert(
  alerts: SafetyAlert[],
  areaId?: string,
  areaName?: string
): SafetyAlert | null {
  const hazardAlert =
    alerts.find(
      (alert) =>
        alert.type ===
        "hazard" &&
        (
          alert.severity ===
            "high" ||
          alert.severity ===
            "critical"
        )
    );

  const geofenceAlert =
    alerts.find(
      (alert) =>
        alert.type ===
        "geofence" &&
        (
          alert.severity ===
            "high" ||
          alert.severity ===
            "critical"
        )
    );

  if (
    !hazardAlert ||
    !geofenceAlert
  ) {
    return null;
  }

  const severity =
    SEVERITY_ORDER[
      hazardAlert.severity
    ] >=
    SEVERITY_ORDER[
      geofenceAlert.severity
    ]
      ? hazardAlert.severity
      : geofenceAlert.severity;

  return {
    id: `combined-safety-${areaId ?? "area"}`,

    type: "combined",

    severity,

    title:
      "Combined marine safety warning",

    message:
      `${hazardAlert.message} ${geofenceAlert.message}`,

    areaId,

    areaName,

    createdAt:
      new Date().toISOString(),

    actionable: true,

    recommendation:
      "Do not proceed into the restricted area while the marine hazard is active. Reassess the route or operating plan.",

    metadata: {
      hazardAlertId:
        hazardAlert.id,

      geofenceAlertId:
        geofenceAlert.id,
    },
  };
}

export function evaluateSafetyAlerts(
  options: {
    areaId?: string;
    areaName?: string;
    position?: GeoPoint;
    geofenceRadiusKm?: number;
    includeGeofence?: boolean;
  } = {}
): AlertEngineResult {
  const hazardAssessment =
    assessHazards({
      areaId:
        options.areaId,

      areaName:
        options.areaName,

      includeAlerts: true,
    });

  const alerts =
    hazardAssessment.activeHazards.map(
      (hazard) =>
        createHazardAlert(
          hazard,
          hazardAssessment.areaId,
          hazardAssessment.areaName
        )
    );

  if (
    options.position &&
    options.includeGeofence !==
      false
  ) {
    const geofences =
      checkGeofence(
        options.position,
        {
          radiusKm:
            options.geofenceRadiusKm ??
            5,
        }
      );

    for (const geofence of geofences) {
      const alert =
        createGeofenceAlert(
          geofence,
          hazardAssessment.areaName
        );

      if (alert) {
        alerts.push(
          alert
        );
      }
    }
  }

  const combined =
    buildCombinedAlert(
      alerts,
      hazardAssessment.areaId,
      hazardAssessment.areaName
    );

  if (combined) {
    alerts.push(
      combined
    );
  }

  const sorted =
    sortAlerts(
      deduplicateAlerts(
        alerts
      )
    );

  return {
    alerts: sorted,

    highestSeverity:
      getHighestSeverity(
        sorted
      ),

    hasCriticalAlert:
      sorted.some(
        (alert) =>
          alert.severity ===
          "critical"
      ),

    hasActionableAlert:
      sorted.some(
        (alert) =>
          alert.actionable
      ),

    generatedAt:
      new Date().toISOString(),
  };
}

export function getProactiveAlerts(
  position?: GeoPoint,
  options: {
    areaId?: string;
    areaName?: string;
    geofenceRadiusKm?: number;
  } = {}
): SafetyAlert[] {
  return evaluateSafetyAlerts({
    ...options,
    position,
    includeGeofence:
      Boolean(position),
  }).alerts;
}

export function hasCriticalSafetyAlert(
  position?: GeoPoint,
  options: {
    areaId?: string;
    areaName?: string;
  } = {}
): boolean {
  return evaluateSafetyAlerts({
    ...options,
    position,
    includeGeofence:
      Boolean(position),
  }).hasCriticalAlert;
}

export function getSafetyAlertSummary(
  position?: GeoPoint,
  options: {
    areaId?: string;
    areaName?: string;
  } = {}
): string {
  const result =
    evaluateSafetyAlerts({
      ...options,
      position,
      includeGeofence:
        Boolean(position),
    });

  if (
    result.alerts.length ===
    0
  ) {
    return `No active safety alerts were identified for ${
      options.areaName ??
      "the selected area"
    }.`;
  }

  return result.alerts
    .slice(0, 4)
    .map(
      (alert) =>
        `${alert.title}: ${alert.message}`
    )
    .join(" ");
}

export default evaluateSafetyAlerts;