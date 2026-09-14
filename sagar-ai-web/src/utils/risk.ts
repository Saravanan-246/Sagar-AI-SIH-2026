import type {
  RiskLevel,
  MarineSafety,
} from "../types/marine";
import type {
  RouteRiskLevel,
} from "../types/route";
import type {
  ScenarioRiskLevel,
} from "../types/scenario";

export type AnyRiskLevel =
  | RiskLevel
  | RouteRiskLevel
  | ScenarioRiskLevel;

export function getRiskLevel(
  score: number
): RiskLevel {
  if (!Number.isFinite(score)) {
    return "critical";
  }

  const normalized = Math.max(0, Math.min(100, score));

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

export function clampRiskScore(
  score: number
): number {
  if (!Number.isFinite(score)) {
    return 100;
  }

  return Math.round(
    Math.max(0, Math.min(100, score))
  );
}

export function getRiskScore(
  level: AnyRiskLevel
): number {
  switch (level) {
    case "low":
      return 20;

    case "moderate":
      return 50;

    case "high":
      return 70;

    case "critical":
      return 90;

    default:
      return 100;
  }
}

export function getRiskLabel(
  level: AnyRiskLevel
): string {
  switch (level) {
    case "low":
      return "Low Risk";

    case "moderate":
      return "Moderate Risk";

    case "high":
      return "High Risk";

    case "critical":
      return "Critical Risk";

    default:
      return "Unknown Risk";
  }
}

export function getRiskDescription(
  level: AnyRiskLevel
): string {
  switch (level) {
    case "low":
      return "Conditions are generally favourable.";

    case "moderate":
      return "Proceed with normal caution and monitor conditions.";

    case "high":
      return "Conditions require increased caution and operational planning.";

    case "critical":
      return "Conditions are unsafe or require immediate avoidance.";

    default:
      return "Risk level could not be determined.";
  }
}

export function isRiskAtLeast(
  level: AnyRiskLevel,
  threshold: AnyRiskLevel
): boolean {
  const order: Record<AnyRiskLevel, number> = {
    low: 1,
    moderate: 2,
    high: 3,
    critical: 4,
  };

  return order[level] >= order[threshold];
}

export function isHighRisk(
  scoreOrLevel: number | AnyRiskLevel
): boolean {
  if (typeof scoreOrLevel === "number") {
    return clampRiskScore(scoreOrLevel) > 60;
  }

  return isRiskAtLeast(scoreOrLevel, "high");
}

export function isCriticalRisk(
  scoreOrLevel: number | AnyRiskLevel
): boolean {
  if (typeof scoreOrLevel === "number") {
    return clampRiskScore(scoreOrLevel) > 80;
  }

  return scoreOrLevel === "critical";
}

export function getRiskPercentage(
  score: number
): number {
  return clampRiskScore(score);
}

export function getRiskClass(
  level: AnyRiskLevel
): string {
  switch (level) {
    case "low":
      return "risk-low";

    case "moderate":
      return "risk-moderate";

    case "high":
      return "risk-high";

    case "critical":
      return "risk-critical";

    default:
      return "risk-unknown";
  }
}

export function buildMarineSafety(
  score: number,
  recommendation: string
): MarineSafety {
  const normalizedScore = clampRiskScore(score);
  const level = getRiskLevel(normalizedScore);

  let smallCraftSuitability: MarineSafety["smallCraftSuitability"];

  switch (level) {
    case "low":
      smallCraftSuitability = "favourable";
      break;

    case "moderate":
      smallCraftSuitability = "caution";
      break;

    case "high":
      smallCraftSuitability = "not_recommended";
      break;

    case "critical":
      smallCraftSuitability = "unsafe";
      break;
  }

  return {
    overallRisk: level,
    riskScore: normalizedScore,
    recommendation,
    smallCraftSuitability,
  };
}

export function combineRiskScores(
  scores: number[]
): number {
  const validScores = scores
    .filter((score) => Number.isFinite(score))
    .map(clampRiskScore);

  if (validScores.length === 0) {
    return 0;
  }

  return clampRiskScore(
    validScores.reduce(
      (total, score) => total + score,
      0
    ) / validScores.length
  );
}

export function applyRiskModifier(
  baseScore: number,
  modifier: number
): number {
  return clampRiskScore(
    clampRiskScore(baseScore) + modifier
  );
}