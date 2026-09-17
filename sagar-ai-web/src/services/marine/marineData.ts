import rawMarineData from "../../data/marine.json";
import { getOfflineSnapshot } from "../offline/offlineSnapshot";

import type {
  MarineArea,
  MarineConditions,
  TideInfo,
  MarineIndicators,
  MarineHazards,
  MarineSummary,
} from "../../types/marine";

const bundledAreas: MarineArea[] = Array.isArray(
  (rawMarineData as { areas?: MarineArea[] }).areas
)
  ? ((rawMarineData as { areas: MarineArea[] }).areas)
  : [];

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Prefers a synced offline snapshot's marine areas over the dataset
 * bundled with the app, so every deterministic engine that reads
 * through this module (hazardEngine included) reflects what was
 * actually last synced from the backend rather than always the same
 * static build-time file. Falls back to the bundled dataset when no
 * snapshot exists yet - so the app has a working (if unsynced)
 * decision baseline from first launch, never a hard failure.
 */
function currentAreas(): MarineArea[] {
  const snapshot = getOfflineSnapshot();
  return snapshot && snapshot.marineAreas.length > 0
    ? snapshot.marineAreas
    : bundledAreas;
}

export function getMarineAreas(): MarineArea[] {
  return [...currentAreas()];
}

export function getDefaultMarineArea(): MarineArea {
  return currentAreas()[0];
}

export function getMarineArea(idOrName?: string): MarineArea {
  if (!idOrName || !idOrName.trim()) {
    return getDefaultMarineArea();
  }

  const target = normalizeText(idOrName);

  const matched = currentAreas().find(
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

  return currentAreas().find((area) => normalizeText(area.id) === target);
}

export function getMarineAreaByName(name: string): MarineArea | undefined {
  if (!name) return undefined;

  const target = normalizeText(name);

  return currentAreas().find(
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
