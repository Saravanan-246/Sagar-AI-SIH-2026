import { randomUUID } from "crypto";

import {
  getDefaultMarineArea,
  getMarineArea,
  getMarineAreaByName,
  getMarineAreas,
} from "../services/marine/marineData";

import type { AgentRequest } from "../services/agents/agentTypes";
import type { ChatIntent, ChatLanguage } from "../types/chat";
import type { MarineArea } from "../types/marine";

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

export function findNearestMarineArea(
  point: { latitude: number; longitude: number }
): MarineArea {
  const areas = getMarineAreas();

  return [...areas].sort(
    (a, b) =>
      haversineDistanceKm(point, a.coordinates) -
      haversineDistanceKm(point, b.coordinates)
  )[0];
}

/*
 * Every marine area Sagar has data for sits in the Gulf of Mannar, so a
 * device coordinate from anywhere else has no supported marine data at
 * all - yet findNearestMarineArea above will still hand back the
 * closest one. Callers that must not present coverage Sagar does not
 * have (the chat "use my location" flow) use this instead and treat a
 * null result as "outside supported coverage".
 */
export const COVERAGE_RADIUS_KM = 250;

export function findNearestMarineAreaWithinCoverage(
  point: { latitude: number; longitude: number },
  radiusKm: number = COVERAGE_RADIUS_KM
): MarineArea | null {
  const nearest = findNearestMarineArea(point);

  return haversineDistanceKm(point, nearest.coordinates) <= radiusKm
    ? nearest
    : null;
}

export function resolveArea(query: {
  areaId?: string;
  areaName?: string;
  latitude?: number;
  longitude?: number;
}): MarineArea {
  if (query.areaId) {
    const area = getMarineArea(query.areaId);
    if (area) {
      return area;
    }
  }

  if (query.areaName) {
    const area = getMarineAreaByName(query.areaName);
    if (area) {
      return area;
    }
  }

  if (
    typeof query.latitude === "number" &&
    typeof query.longitude === "number"
  ) {
    return findNearestMarineArea({
      latitude: query.latitude,
      longitude: query.longitude,
    });
  }

  return getDefaultMarineArea();
}

export function buildAgentRequest(input: {
  message?: string;
  language?: ChatLanguage;
  intent?: ChatIntent;
  areaId?: string;
  areaName?: string;
  latitude?: number;
  longitude?: number;
}): AgentRequest {
  const area = resolveArea(input);
  const language = input.language ?? "en";
  const intent = input.intent ?? "general";

  const coordinates =
    typeof input.latitude === "number" &&
    typeof input.longitude === "number"
      ? { latitude: input.latitude, longitude: input.longitude }
      : undefined;

  return {
    requestId: randomUUID(),
    message: input.message ?? `Marine information for ${area.name}`,
    language,
    intent,
    context: {
      areaId: area.id,
      areaName: area.name,
      language,
      intent,
      coordinates,
    },
    area,
    parameters: coordinates
      ? { latitude: coordinates.latitude, longitude: coordinates.longitude, coordinates }
      : undefined,
  };
}
