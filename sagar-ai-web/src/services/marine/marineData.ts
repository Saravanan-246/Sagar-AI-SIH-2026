import rawMarineData from "../../data/marine.json";

import type {
  MarineArea,
  MarineConditions,
  TideInfo,
  MarineIndicators,
  MarineHazards,
  MarineSummary,
} from "../../types/marine";

const normalizedAreas: MarineArea[] = Array.isArray(
  (rawMarineData as { areas?: MarineArea[] }).areas
)
  ? ((rawMarineData as { areas: MarineArea[] }).areas)
  : [];

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function getMarineAreas(): MarineArea[] {
  return [...normalizedAreas];
}

export function getDefaultMarineArea(): MarineArea {
  return normalizedAreas[0];
}

export function getMarineArea(idOrName?: string): MarineArea {
  if (!idOrName || !idOrName.trim()) {
    return getDefaultMarineArea();
  }

  const target = normalizeText(idOrName);

  const matched = normalizedAreas.find(
    (area) =>
      normalizeText(area.id) === target ||
      normalizeText(area.name).includes(target) ||
      target.includes(normalizeText(area.name))
  );

  return matched ?? getDefaultMarineArea();
}

export function getMarineAreaById(id: string): MarineArea | undefined {
  if (!id) return undefined;

  const target = normalizeText(id);

  return normalizedAreas.find((area) => normalizeText(area.id) === target);
}

export function getMarineAreaByName(name: string): MarineArea | undefined {
  if (!name) return undefined;

  const target = normalizeText(name);

  return normalizedAreas.find(
    (area) =>
      normalizeText(area.name) === target ||
      normalizeText(area.name).includes(target) ||
      target.includes(normalizeText(area.name))
  );
}

export function getMarineConditions(idOrName?: string): MarineConditions {
  return getMarineArea(idOrName).conditions;
}

export function getMarineTide(idOrName?: string): TideInfo {
  return getMarineArea(idOrName).tide;
}

export function getMarineIndicators(idOrName?: string): MarineIndicators {
  return getMarineArea(idOrName).marineIndicators;
}

export function getMarineHazards(idOrName?: string): MarineHazards {
  return getMarineArea(idOrName).hazards;
}

export function getMarineSummary(idOrName?: string): MarineSummary {
  const area = getMarineArea(idOrName);

  return {
    areaId: area.id,
    areaName: area.name,
    riskLevel: area.safety.overallRisk,
    riskScore: area.safety.riskScore,
    seaState: area.conditions.seaState,
    windSpeedKnots: area.conditions.windSpeedKnots,
    waveHeightM: area.conditions.waveHeightM,
    seaSurfaceTemperatureC: area.marineIndicators.seaSurfaceTemperatureC,
    chlorophyllMgM3: area.marineIndicators.chlorophyllMgM3,
    productivitySignal: area.marineIndicators.productivitySignal,
    recommendation: area.safety.recommendation,
  };
}

export default {
  getMarineAreas,
  getDefaultMarineArea,
  getMarineArea,
  getMarineAreaById,
  getMarineAreaByName,
  getMarineConditions,
  getMarineTide,
  getMarineIndicators,
  getMarineHazards,
  getMarineSummary,
};
