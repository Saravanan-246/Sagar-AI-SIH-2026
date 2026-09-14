import rawMarineData from "../../data/marine.json";
import type { MarineArea, MarineConditions } from "../../types/marine";

function parseMarineAreas(): any[] {
  if (Array.isArray(rawMarineData)) {
    return rawMarineData;
  }
  if (Array.isArray((rawMarineData as any)?.areas)) {
    return (rawMarineData as any).areas;
  }
  if (rawMarineData && typeof rawMarineData === "object") {
    return [rawMarineData];
  }
  return [];
}

const rawAreas = parseMarineAreas();

function normalizeMarineArea(item: any, index: number): MarineArea {
  return {
    id: item.id || `area-${index}`,
    name: item.areaName || item.name || "Thoothukudi Coast",
    coordinates: {
      latitude: item.coordinates?.latitude ?? item.latitude ?? 8.7642,
      longitude: item.coordinates?.longitude ?? item.longitude ?? 78.1348,
    },
    seaState: item.seaState || "Moderate",
    waveHeight: item.waveHeight ?? 1.2,
    windSpeed: item.windSpeed ?? 14,
    windDirection: item.windDirection || "SW",
    surfaceTemperature: item.surfaceTemperature ?? 28.3,
    salinity: item.salinity ?? 34.8,
    tide: item.tide || "Ebb",
    hazards: Array.isArray(item.hazards) ? item.hazards : [],
  };
}

const normalizedAreas: MarineArea[] = rawAreas.map(normalizeMarineArea);

export function getMarineAreas(): MarineArea[] {
  return [...normalizedAreas];
}

export function getDefaultMarineArea(): MarineArea {
  return (
    normalizedAreas[0] || {
      id: "thoothukudi",
      name: "Thoothukudi Coast",
      coordinates: { latitude: 8.7642, longitude: 78.1348 },
      seaState: "Moderate",
      waveHeight: 1.2,
      windSpeed: 14,
      windDirection: "SW",
      surfaceTemperature: 28.3,
      salinity: 34.8,
      tide: "Ebb",
      hazards: [],
    }
  );
}

export function getMarineArea(idOrName?: string): MarineArea {
  if (!idOrName || !idOrName.trim()) {
    return getDefaultMarineArea();
  }
  const target = idOrName.trim().toLowerCase();
  const matched = normalizedAreas.find(
    (a) => a.id.toLowerCase() === target || a.name.toLowerCase().includes(target)
  );
  return matched || getDefaultMarineArea();
}

export function getMarineAreaById(id: string): MarineArea | undefined {
  if (!id) return undefined;
  const target = id.trim().toLowerCase();
  return normalizedAreas.find(
    (a) => a.id.toLowerCase() === target || a.name.toLowerCase().includes(target)
  );
}

export function getMarineConditions(areaName?: string): MarineConditions | null {
  const targetArea = areaName ? getMarineArea(areaName) : getDefaultMarineArea();
  return (targetArea as unknown) as MarineConditions;
}

export function getMarineConditionsByArea(areaName?: string): MarineConditions | null {
  return getMarineConditions(areaName);
}

export function getMarineHazards(): any[] {
  const rootHazards = Array.isArray((rawMarineData as any)?.hazards) ? (rawMarineData as any).hazards : [];
  const areaHazards = normalizedAreas.flatMap((a) => (Array.isArray(a.hazards) ? a.hazards : []));
  return [...rootHazards, ...areaHazards];
}

export default {
  getMarineAreas,
  getDefaultMarineArea,
  getMarineArea,
  getMarineAreaById,
  getMarineConditions,
  getMarineConditionsByArea,
  getMarineHazards,
};