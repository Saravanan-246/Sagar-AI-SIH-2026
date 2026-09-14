import {
  getActiveAlerts,
  getAlertsByArea,
} from "../alerts/alertService";

import {
  getMarineArea,
  getDefaultMarineArea,
} from "../marine/marineData";

import type {
  Alert,
  AlertSeverity,
} from "../../types/alert";

import type {
  MarineArea,
  RiskLevel,
} from "../../types/marine";

export type HazardType =
  | "cyclone"
  | "lightning"
  | "rough_sea"
  | "high_waves"
  | "strong_wind"
  | "poor_visibility"
  | "rapid_weather_change"
  | "restricted_area"
  | "unknown";

export interface HazardObservation {
  type: HazardType;
  active: boolean;

  severity: AlertSeverity;

  title: string;
  description: string;

  value?: number;
  unit?: string;

  source?: string;
  validUntil?: string;

  metadata?: Record<string, unknown>;
}

export interface HazardAssessment {
  areaId: string;
  areaName: string;

  hazards: HazardObservation[];

  activeHazards: HazardObservation[];

  highestSeverity: AlertSeverity | "none";

  riskLevel: RiskLevel;

  riskScore: number;

  recommendation: string;

  assessedAt: string;
}

const SEVERITY_SCORE: Record<
  AlertSeverity,
  number
> = {
  low: 15,
  moderate: 35,
  high: 65,
  critical: 90,
};

const SEVERITY_ORDER: Record<
  AlertSeverity,
  number
> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function clamp(
  value: number,
  min = 0,
  max = 100
): number {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function getRiskLevel(
  score: number
): RiskLevel {
  const normalized = clamp(score);

  if (normalized <= 30) {
    return "low";
  }

  if (normalized <= 60) {
    return "moderate";
  }

  if (normalized <= 80) {
    return "high";
  }

  return "critical";
}

function normalizeText(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function resolveArea(
  areaId?: string,
  areaName?: string
): MarineArea {
  if (areaId) {
    const area =
      getMarineArea(areaId);

    if (area) {
      return area;
    }
  }

  if (areaName) {
    const normalized =
      normalizeText(areaName);

    const defaultArea =
      getDefaultMarineArea();

    if (
      normalizeText(
        defaultArea.name
      ) === normalized
    ) {
      return defaultArea;
    }

    const matched = [
      defaultArea,
      ...[
        getMarineArea(
          "thoothukudi-coast"
        ),
        getMarineArea(
          "central-gulf-of-mannar"
        ),
        getMarineArea(
          "southern-gulf-of-mannar"
        ),
        getMarineArea(
          "northern-gulf-of-mannar"
        ),
      ].filter(
        (
          item
        ): item is MarineArea =>
          Boolean(item)
      ),
    ].find(
      (item) =>
        normalizeText(
          item.name
        ).includes(
          normalized
        ) ||
        normalized.includes(
          normalizeText(
            item.name
          )
        )
    );

    if (matched) {
      return matched;
    }
  }

  return getDefaultMarineArea();
}

function alertToHazard(
  alert: Alert
): HazardObservation {
  let type: HazardType;

  switch (alert.type) {
    case "cyclone":
      type = "cyclone";
      break;

    case "lightning":
      type = "lightning";
      break;

    case "rough_sea":
      type = "rough_sea";
      break;

    case "high_waves":
      type = "high_waves";
      break;

    case "strong_wind":
      type = "strong_wind";
      break;

    case "visibility":
      type = "poor_visibility";
      break;

    case "rapid_weather_change":
      type = "rapid_weather_change";
      break;

    case "restricted_area":
      type = "restricted_area";
      break;

    default:
      type = "unknown";
      break;
  }

  return {
    type,

    active:
      alert.status === "active",

    severity:
      alert.severity,

    title:
      alert.title,

    description:
      alert.summary ||
      alert.description,

    source:
      alert.source,

    validUntil:
      alert.validUntil,

    metadata: {
      alertId:
        alert.id,

      location:
        alert.location,

      recommendation:
        alert.recommendation,
    },
  };
}

function createMetricHazards(
  area: MarineArea
): HazardObservation[] {
  const hazards: HazardObservation[] =
    [];

  const conditions =
    area.conditions;

  if (
    Number.isFinite(
      conditions.waveHeightM
    )
  ) {
    if (
      conditions.waveHeightM >= 3
    ) {
      hazards.push({
        type: "high_waves",
        active: true,
        severity: "critical",

        title:
          "Very high waves",

        description:
          `Wave height is ${conditions.waveHeightM.toFixed(
            1
          )} m.`,

        value:
          conditions.waveHeightM,

        unit: "m",
      });
    } else if (
      conditions.waveHeightM >= 2
    ) {
      hazards.push({
        type: "high_waves",
        active: true,
        severity: "high",

        title:
          "High waves",

        description:
          `Wave height is ${conditions.waveHeightM.toFixed(
            1
          )} m.`,

        value:
          conditions.waveHeightM,

        unit: "m",
      });
    }
  }

  if (
    Number.isFinite(
      conditions.windSpeedKnots
    )
  ) {
    if (
      conditions.windSpeedKnots >= 25
    ) {
      hazards.push({
        type: "strong_wind",
        active: true,
        severity: "critical",

        title:
          "Very strong wind",

        description:
          `Wind speed is ${conditions.windSpeedKnots.toFixed(
            1
          )} knots.`,

        value:
          conditions.windSpeedKnots,

        unit: "knots",
      });
    } else if (
      conditions.windSpeedKnots >= 18
    ) {
      hazards.push({
        type: "strong_wind",
        active: true,
        severity: "high",

        title:
          "Strong wind",

        description:
          `Wind speed is ${conditions.windSpeedKnots.toFixed(
            1
          )} knots.`,

        value:
          conditions.windSpeedKnots,

        unit: "knots",
      });
    }
  }

  if (
    Number.isFinite(
      conditions.visibilityKm
    )
  ) {
    if (
      conditions.visibilityKm < 1
    ) {
      hazards.push({
        type: "poor_visibility",
        active: true,
        severity: "critical",

        title:
          "Very poor visibility",

        description:
          `Visibility is ${conditions.visibilityKm.toFixed(
            1
          )} km.`,

        value:
          conditions.visibilityKm,

        unit: "km",
      });
    } else if (
      conditions.visibilityKm < 3
    ) {
      hazards.push({
        type: "poor_visibility",
        active: true,
        severity: "high",

        title:
          "Reduced visibility",

        description:
          `Visibility is ${conditions.visibilityKm.toFixed(
            1
          )} km.`,

        value:
          conditions.visibilityKm,

        unit: "km",
      });
    }
  }

  return hazards;
}

function createAreaHazards(
  area: MarineArea
): HazardObservation[] {
  const hazards: HazardObservation[] =
    [];

  if (
    area.hazards.cyclone
  ) {
    hazards.push({
      type: "cyclone",
      active: true,
      severity: "critical",

      title:
        "Cyclone hazard",

      description:
        "Cyclone activity is flagged for the selected marine area.",
    });
  }

  if (
    area.hazards.lightning
  ) {
    hazards.push({
      type: "lightning",
      active: true,
      severity: "high",

      title:
        "Lightning hazard",

      description:
        "Lightning activity is flagged for the selected marine area.",
    });
  }

  if (
    area.hazards.roughSea
  ) {
    hazards.push({
      type: "rough_sea",
      active: true,
      severity: "high",

      title:
        "Rough sea hazard",

      description:
        "Rough sea conditions are flagged for the selected marine area.",
    });
  }

  if (
    area.hazards.strongWind
  ) {
    hazards.push({
      type: "strong_wind",
      active: true,
      severity: "high",

      title:
        "Strong wind hazard",

      description:
        "Strong wind conditions are flagged for the selected marine area.",
    });
  }

  if (
    area.hazards.visibilityRisk
  ) {
    hazards.push({
      type: "poor_visibility",
      active: true,
      severity: "high",

      title:
        "Visibility risk",

      description:
        "Reduced visibility risk is flagged for the selected marine area.",
    });
  }

  return hazards;
}

function deduplicateHazards(
  hazards: HazardObservation[]
): HazardObservation[] {
  const map = new Map<
    string,
    HazardObservation
  >();

  for (const hazard of hazards) {
    const existing =
      map.get(hazard.type);

    if (!existing) {
      map.set(
        hazard.type,
        hazard
      );
      continue;
    }

    if (
      SEVERITY_ORDER[
        hazard.severity
      ] >
      SEVERITY_ORDER[
        existing.severity
      ]
    ) {
      map.set(
        hazard.type,
        hazard
      );
    }
  }

  return Array.from(
    map.values()
  );
}

function calculateRiskScore(
  hazards: HazardObservation[],
  area: MarineArea
): number {
  const active =
    hazards.filter(
      (hazard) =>
        hazard.active
    );

  if (active.length === 0) {
    return clamp(
      Number.isFinite(
        area.safety.riskScore
      )
        ? area.safety.riskScore
        : 0
    );
  }

  const highest =
    Math.max(
      ...active.map(
        (hazard) =>
          SEVERITY_SCORE[
            hazard.severity
          ]
      )
    );

  const additionalPenalty =
    Math.min(
      20,
      Math.max(
        0,
        active.length - 1
      ) * 7
    );

  const areaBaseline =
    Number.isFinite(
      area.safety.riskScore
    )
      ? area.safety.riskScore
      : 0;

  return Math.round(
    clamp(
      Math.max(
        highest +
          additionalPenalty,
        areaBaseline
      )
    )
  );
}

function getHighestSeverity(
  hazards: HazardObservation[]
): AlertSeverity | "none" {
  const active =
    hazards.filter(
      (hazard) =>
        hazard.active
    );

  if (active.length === 0) {
    return "none";
  }

  return active.reduce(
    (highest, hazard) =>
      SEVERITY_ORDER[
        hazard.severity
      ] >
      SEVERITY_ORDER[highest]
        ? hazard.severity
        : highest,
    active[0].severity
  );
}

function buildRecommendation(
  hazards: HazardObservation[],
  riskLevel: RiskLevel
): string {
  const active =
    hazards.filter(
      (hazard) =>
        hazard.active
    );

  if (
    active.some(
      (hazard) =>
        hazard.type ===
        "cyclone"
    )
  ) {
    return "Do not proceed while cyclone risk is active. Reassess the operating plan after the hazard clears.";
  }

  if (
    active.some(
      (hazard) =>
        hazard.type ===
          "lightning" &&
        (
          hazard.severity ===
            "critical" ||
          hazard.severity ===
            "high"
        )
    )
  ) {
    return "Consider postponing operations while lightning activity remains active.";
  }

  if (
    active.some(
      (hazard) =>
        hazard.type ===
          "rough_sea" ||
        hazard.type ===
          "high_waves"
    )
  ) {
    return "Avoid unnecessary exposure to rough sea conditions and review a safer operating plan.";
  }

  if (
    active.some(
      (hazard) =>
        hazard.type ===
        "strong_wind"
    )
  ) {
    return "Proceed only with increased caution and reassess departure timing or route selection.";
  }

  if (
    active.some(
      (hazard) =>
        hazard.type ===
        "poor_visibility"
    )
  ) {
    return "Use additional navigation caution under reduced visibility.";
  }

  if (
    riskLevel === "high"
  ) {
    return "Review the active hazards before departure and use an appropriate alternative operating plan.";
  }

  if (
    riskLevel === "moderate"
  ) {
    return "Conditions require normal caution and continued monitoring.";
  }

  return "No major configured hazard is currently driving the assessment.";
}

export function assessHazards(
  options: {
    areaId?: string;
    areaName?: string;
    includeAlerts?: boolean;
  } = {}
): HazardAssessment {
  const area =
    resolveArea(
      options.areaId,
      options.areaName
    );

  const alertRecords =
    options.includeAlerts === false
      ? []
      : getAlertsByArea(
          area.id
        ).filter(
          (alert) =>
            alert.status ===
            "active"
        );

  /*
   * Some alert datasets may not be explicitly
   * linked to an area. Add active alerts only
   * when no area-specific records exist.
   */
  const alerts =
    alertRecords.length > 0
      ? alertRecords
      : getActiveAlerts();

  const alertHazards =
    alerts.map(
      alertToHazard
    );

  const areaHazards =
    createAreaHazards(
      area
    );

  const metricHazards =
    createMetricHazards(
      area
    );

  const hazards =
    deduplicateHazards([
      ...alertHazards,
      ...areaHazards,
      ...metricHazards,
    ]);

  const activeHazards =
    hazards.filter(
      (hazard) =>
        hazard.active
    );

  const riskScore =
    calculateRiskScore(
      hazards,
      area
    );

  const riskLevel =
    getRiskLevel(
      riskScore
    );

  const highestSeverity =
    getHighestSeverity(
      hazards
    );

  return {
    areaId:
      area.id,

    areaName:
      area.name,

    hazards,

    activeHazards,

    highestSeverity,

    riskLevel,

    riskScore,

    recommendation:
      buildRecommendation(
        hazards,
        riskLevel
      ),

    assessedAt:
      new Date().toISOString(),
  };
}

export function getActiveHazards(
  options: {
    areaId?: string;
    areaName?: string;
  } = {}
): HazardObservation[] {
  return assessHazards(
    options
  ).activeHazards;
}

export function hasActiveHazard(
  type: HazardType,
  options: {
    areaId?: string;
    areaName?: string;
  } = {}
): boolean {
  return getActiveHazards(
    options
  ).some(
    (hazard) =>
      hazard.type === type
  );
}

export function getHighestRiskHazard(
  options: {
    areaId?: string;
    areaName?: string;
  } = {}
): HazardObservation | undefined {
  const hazards =
    getActiveHazards(
      options
    );

  if (hazards.length === 0) {
    return undefined;
  }

  return hazards.reduce(
    (highest, hazard) =>
      SEVERITY_ORDER[
        hazard.severity
      ] >
      SEVERITY_ORDER[
        highest.severity
      ]
        ? hazard
        : highest,
    hazards[0]
  );
}

export function getHazardSummary(
  options: {
    areaId?: string;
    areaName?: string;
  } = {}
): string {
  const assessment =
    assessHazards(
      options
    );

  if (
    assessment.activeHazards.length ===
    0
  ) {
    return `No major configured hazards are active for ${assessment.areaName}.`;
  }

  const names =
    assessment.activeHazards
      .map(
        (hazard) =>
          hazard.title
      )
      .join(", ");

  return `${assessment.areaName}: ${names}. ${assessment.recommendation}`;
}

export default assessHazards;