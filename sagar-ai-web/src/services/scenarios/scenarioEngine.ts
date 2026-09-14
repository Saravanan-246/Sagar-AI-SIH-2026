import scenariosData from "../../data/scenarios.json";
import marineData from "../../data/marine.json";
import productivityData from "../../data/productivity.json";
import boundariesData from "../../data/boundaries.json";
import alertsData from "../../data/alerts.json";

import type {
  Scenario,
  ScenarioResult,
} from "../../types/scenario";

type ScenarioInputs = Record<
  string,
  unknown
>;

type RiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical";

type Operability =
  | "proceed"
  | "caution"
  | "avoid"
  | "blocked";

type ScenarioRecord = {
  id: string;
  type: string;
  name: string;
  description: string;
  inputs?: Record<string, unknown>;
  baselineArea?: string;
  modifiers?: Record<string, unknown>;
  result?: {
    riskLevel?: RiskLevel;
    riskScore?: number;
    operability?: Operability;
    recommendation?: string;
    keyFactors?: string[];
  };
};

const scenarios =
  scenariosData as ScenarioRecord[];

const RISK_LIMITS = {
  low: 30,
  moderate: 60,
  high: 80,
} as const;

function clamp(
  value: number,
  min = 0,
  max = 100,
) {
  return Math.min(
    max,
    Math.max(min, value),
  );
}

function getRiskLevel(
  score: number,
): RiskLevel {
  if (score < RISK_LIMITS.low) {
    return "low";
  }

  if (score < RISK_LIMITS.moderate) {
    return "moderate";
  }

  if (score < RISK_LIMITS.high) {
    return "high";
  }

  return "critical";
}

function getOperability(
  score: number,
): Operability {
  if (score >= 85) {
    return "blocked";
  }

  if (score >= 60) {
    return "avoid";
  }

  if (score >= 30) {
    return "caution";
  }

  return "proceed";
}

function numberInput(
  inputs: ScenarioInputs,
  key: string,
  fallback: number,
): number {
  const value = inputs[key];

  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function stringInput(
  inputs: ScenarioInputs,
  key: string,
  fallback: string,
): string {
  const value = inputs[key];

  return typeof value === "string"
    ? value
    : fallback;
}

function findMarineArea(
  areaId?: string,
) {
  if (areaId) {
    const exact =
      marineData.areas.find(
        (area) =>
          area.id === areaId,
      );

    if (exact) {
      return exact;
    }
  }

  return marineData.areas[0];
}

function findScenario(
  scenario:
    | Scenario
    | ScenarioRecord,
): ScenarioRecord | undefined {
  return scenarios.find(
    (item) => item.id === scenario.id,
  );
}

function getBaseRisk(
  areaId?: string,
): number {
  const area =
    findMarineArea(areaId);

  return area?.safety?.riskScore ?? 50;
}

function getActiveHazardPenalty(
  areaId?: string,
): number {
  const area =
    findMarineArea(areaId);

  if (!area) {
    return 0;
  }

  let penalty = 0;

  if (
    area.hazards?.cyclone?.risk ===
    "high"
  ) {
    penalty += 8;
  }

  if (
    area.hazards?.lightning?.risk ===
    "high"
  ) {
    penalty += 8;
  }

  if (
    area.hazards?.roughSea?.risk ===
    "high"
  ) {
    penalty += 8;
  }

  if (
    area.hazards?.strongWind?.risk ===
    "high"
  ) {
    penalty += 7;
  }

  return penalty;
}

function calculateWeatherScenario(
  areaId: string | undefined,
  inputs: ScenarioInputs,
) {
  const baseRisk =
    getBaseRisk(areaId);

  const windIncrease =
    numberInput(
      inputs,
      "windSpeedIncreasePercent",
      numberInput(
        inputs,
        "windIncrease",
        20,
      ),
    );

  const waveIncrease =
    numberInput(
      inputs,
      "waveIncreasePercent",
      numberInput(
        inputs,
        "waveIncrease",
        15,
      ),
    );

  const vesselType =
    stringInput(
      inputs,
      "vesselType",
      "small",
    );

  let score = baseRisk;

  score +=
    (windIncrease / 100) * 22;

  score +=
    (waveIncrease / 100) * 20;

  if (vesselType === "small") {
    score += 6;
  } else if (
    vesselType === "medium"
  ) {
    score += 2;
  }

  score += getActiveHazardPenalty(
    areaId,
  );

  score = clamp(score);

  const factors: string[] = [];

  if (windIncrease > 0) {
    factors.push(
      `Wind increase of ${windIncrease}%`,
    );
  }

  if (waveIncrease > 0) {
    factors.push(
      `Wave increase of ${waveIncrease}%`,
    );
  }

  if (vesselType === "small") {
    factors.push(
      "Higher sensitivity of a small vessel",
    );
  }

  const risk = getRiskLevel(score);

  return {
    score,
    risk,
    factors,
  };
}

function calculateLightningScenario(
  areaId: string | undefined,
  inputs: ScenarioInputs,
) {
  const baseRisk =
    getBaseRisk(areaId);

  const lightningRisk =
    stringInput(
      inputs,
      "lightningRisk",
      "moderate",
    );

  let score = baseRisk;

  if (lightningRisk === "low") {
    score += 4;
  }

  if (lightningRisk === "moderate") {
    score += 16;
  }

  if (lightningRisk === "high") {
    score += 30;
  }

  const area =
    findMarineArea(areaId);

  if (
    area?.hazards?.lightning?.risk ===
    "moderate"
  ) {
    score += 5;
  }

  if (
    area?.hazards?.lightning?.risk ===
    "high"
  ) {
    score += 10;
  }

  score = clamp(score);

  const factors: string[] = [];

  factors.push(
    `${lightningRisk} lightning risk`,
  );

  if (lightningRisk === "high") {
    factors.push(
      "Direct exposure to active lightning conditions",
    );
  }

  factors.push(
    "Potential for rapid local weather change",
  );

  return {
    score,
    risk: getRiskLevel(score),
    factors,
  };
}

function calculateDepartureScenario(
  areaId: string | undefined,
  inputs: ScenarioInputs,
) {
  const baseRisk =
    getBaseRisk(areaId);

  const duration =
    numberInput(
      inputs,
      "durationHours",
      6,
    );

  const departureTime =
    stringInput(
      inputs,
      "departureTime",
      "06:00",
    );

  let score = baseRisk;

  if (duration > 6) {
    score +=
      (duration - 6) * 2.5;
  }

  if (duration > 10) {
    score += 5;
  }

  const hour =
    Number(
      departureTime.split(":")[0],
    );

  if (
    Number.isFinite(hour) &&
    (hour >= 11 || hour < 4)
  ) {
    score += 3;
  }

  score += getActiveHazardPenalty(
    areaId,
  );

  score = clamp(score);

  const factors: string[] = [
    `Departure at ${departureTime}`,
    `${duration}-hour operating window`,
  ];

  if (duration > 6) {
    factors.push(
      "Longer exposure to changing marine conditions",
    );
  }

  return {
    score,
    risk: getRiskLevel(score),
    factors,
  };
}

function calculateProductivityScenario(
  areaId: string | undefined,
  inputs: ScenarioInputs,
) {
  const productivityArea =
    productivityData.areas.find(
      (area) => area.id === areaId,
    );

  const currentIndex =
    productivityArea?.current.index ??
    50;

  const decrease =
    Math.abs(
      numberInput(
        inputs,
        "productivityDecreasePercent",
        numberInput(
          inputs,
          "productivityChange",
          10,
        ),
      ),
    );

  const projectedIndex = clamp(
    currentIndex *
      (1 - decrease / 100),
    0,
    100,
  );

  let score = 30;

  if (projectedIndex < 30) {
    score += 25;
  } else if (
    projectedIndex < 50
  ) {
    score += 15;
  } else if (
    projectedIndex < 70
  ) {
    score += 7;
  }

  const factors: string[] = [
    `Productivity index changes from ${currentIndex} to ${Math.round(
      projectedIndex,
    )}`,
  ];

  if (
    productivityArea?.drivers
      ?.chlorophyll?.effect
  ) {
    factors.push(
      `Chlorophyll signal: ${String(
        productivityArea.drivers
          .chlorophyll.effect,
      ).replaceAll("_", " ")}`,
    );
  }

  if (
    productivityArea?.drivers?.sst
      ?.effect
  ) {
    factors.push(
      `SST signal: ${String(
        productivityArea.drivers.sst.effect,
      ).replaceAll("_", " ")}`,
    );
  }

  if (
    productivityArea?.trend?.direction ===
    "declining"
  ) {
    factors.push(
      "Existing productivity trend is declining",
    );
  }

  return {
    score: clamp(score),
    risk: getRiskLevel(score),
    factors,
    projectedIndex,
  };
}

function calculateGeofenceScenario(
  inputs: ScenarioInputs,
) {
  const boundaryId =
    stringInput(
      inputs,
      "boundaryId",
      "",
    );

  const boundary =
    boundariesData.find(
      (item) =>
        !boundaryId ||
        item.id === boundaryId,
    );

  if (!boundary) {
    return {
      score: 50,
      risk: "moderate" as RiskLevel,
      factors: [
        "No matching boundary was found",
      ],
      blocked: false,
    };
  }

  const isBlocking =
    boundary.restriction ===
      "no_entry" ||
    boundary.restriction ===
      "no_fishing";

  return {
    score: isBlocking ? 100 : 55,
    risk: isBlocking
      ? ("critical" as RiskLevel)
      : ("moderate" as RiskLevel),
    factors: [
      boundary.name,
      `Restriction: ${boundary.restriction.replaceAll(
        "_",
        " ",
      )}`,
      isBlocking
        ? "Route or operation intersects a restricted boundary"
        : "Boundary requires operational review",
    ],
    blocked: isBlocking,
  };
}

function calculateRouteChangeScenario(
  areaId: string | undefined,
  inputs: ScenarioInputs,
) {
  const baseRisk =
    getBaseRisk(areaId);

  const routeId =
    stringInput(
      inputs,
      "routeId",
      "",
    );

  const routeRisk =
    scenarios
      .find(
        (scenario) =>
          scenario.id === routeId,
      )
      ?.result?.riskScore;

  const increase =
    numberInput(
      inputs,
      "distanceIncreasePercent",
      18,
    );

  const reduction =
    numberInput(
      inputs,
      "riskReductionPercent",
      46,
    );

  const initialRisk =
    typeof routeRisk === "number"
      ? routeRisk
      : baseRisk;

  const calculatedRisk =
    initialRisk *
    (1 - reduction / 100);

  const score = clamp(
    calculatedRisk +
      Math.min(8, increase / 10),
  );

  return {
    score,
    risk: getRiskLevel(score),
    factors: [
      "Active hazard avoidance",
      `Route distance increase of ${increase}%`,
      `Estimated risk reduction of ${reduction}%`,
    ],
  };
}

function calculateGenericScenario(
  scenario: ScenarioRecord,
  areaId: string | undefined,
) {
  const baseRisk =
    getBaseRisk(areaId);

  const configuredScore =
    scenario.result?.riskScore;

  const score =
    typeof configuredScore === "number"
      ? clamp(configuredScore)
      : clamp(
          baseRisk +
            Number(
              scenario.modifiers
                ?.riskScore ?? 0,
            ),
        );

  return {
    score,
    risk: getRiskLevel(score),
    factors:
      scenario.result?.keyFactors ??
      [],
  };
}

function buildRecommendation(
  scenario: ScenarioRecord,
  risk: RiskLevel,
  operability: Operability,
  factors: string[],
): string {
  if (operability === "blocked") {
    return "Do not proceed. Recalculate the operation around the restricted condition or boundary.";
  }

  if (operability === "avoid") {
    return "Avoid the affected operating condition and consider delaying the operation or selecting a lower-risk alternative.";
  }

  if (operability === "caution") {
    return "Proceed only with caution after reviewing the current marine conditions and available official warnings.";
  }

  if (
    factors.some((factor) =>
      factor
        .toLowerCase()
        .includes("productivity"),
    )
  ) {
    return "The scenario remains operationally possible, but compare productivity changes with marine safety before deciding.";
  }

  return (
    scenario.result?.recommendation ??
    "Conditions appear comparatively suitable, but current marine information should still be verified before operation."
  );
}

function toTypedScenario(
  record: ScenarioRecord,
): Scenario {
  return record as unknown as Scenario;
}

export function getScenarios(): Scenario[] {
  return scenarios.map(
    toTypedScenario,
  );
}

export function getScenarioById(
  id: string,
): Scenario | undefined {
  const record =
    scenarios.find(
      (scenario) =>
        scenario.id === id,
    );

  return record
    ? toTypedScenario(record)
    : undefined;
}

export function runScenario(
  scenario: Scenario,
  inputs: ScenarioInputs = {},
): ScenarioResult {
  const record =
    findScenario(scenario) ??
    (scenario as unknown as ScenarioRecord);

  const areaId =
    stringInput(
      inputs,
      "areaId",
      record.baselineArea ??
        "thoothukudi-coast",
    );

  let calculation: {
    score: number;
    risk: RiskLevel;
    factors: string[];
    projectedIndex?: number;
    blocked?: boolean;
  };

  switch (record.type) {
    case "weather_change":
      calculation =
        calculateWeatherScenario(
          areaId,
          inputs,
        );
      break;

    case "hazard_activation":
      calculation =
        calculateLightningScenario(
          areaId,
          inputs,
        );
      break;

    case "departure_time":
      calculation =
        calculateDepartureScenario(
          areaId,
          inputs,
        );
      break;

    case "productivity_change":
      calculation =
        calculateProductivityScenario(
          areaId,
          inputs,
        );
      break;

    case "geofence":
      calculation =
        calculateGeofenceScenario(
          inputs,
        );
      break;

    case "route_change":
      calculation =
        calculateRouteChangeScenario(
          areaId,
          inputs,
        );
      break;

    default:
      calculation =
        calculateGenericScenario(
          record,
          areaId,
        );
  }

  const score =
    clamp(calculation.score);

  const risk =
    getRiskLevel(score);

  let operability =
    getOperability(score);

  if (calculation.blocked) {
    operability = "blocked";
  }

  const factors = Array.from(
    new Set(calculation.factors),
  ).slice(0, 6);

  const recommendation =
    buildRecommendation(
      record,
      risk,
      operability,
      factors,
    );

  const result = {
    riskLevel: risk,
    riskScore: Math.round(score),
    operability,
    recommendation,
    keyFactors: factors,
  };

  return {
    ...result,
    scenarioId: record.id,
    scenarioName: record.name,
    areaId,
    inputs,
    projectedProductivityIndex:
      calculation.projectedIndex,
  } as unknown as ScenarioResult;
}

export function calculateScenarioRisk(
  scenario: Scenario,
  inputs: ScenarioInputs = {},
): number {
  const result = runScenario(
    scenario,
    inputs,
  );

  return result.riskScore;
}

export function getActiveMarineHazardCount(
): number {
  return alertsData.filter(
    (alert) =>
      alert.status === "active",
  ).length;
}

export default {
  getScenarios,
  getScenarioById,
  runScenario,
  calculateScenarioRisk,
  getActiveMarineHazardCount,
};