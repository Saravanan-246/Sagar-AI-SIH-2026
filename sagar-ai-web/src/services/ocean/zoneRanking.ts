/**
 * Faithful frontend port of the backend's
 * sagar-ai-server/src/services/ocean/zoneRanking.ts, so Chat's offline
 * fallback (localSagar.ts) can rank fishing zones using the same
 * formula as the online deterministic engine - not a separate,
 * simplified approximation. Verified equivalent: same suitability/
 * chlorophyll/SST scoring, same geofence-proximity penalty via this
 * app's own existing geofenceEngine.ts, same PREFER/MONITOR/AVOID
 * thresholds.
 */
import fishingZonesData from "../../data/fishingZones.json";
import { checkGeofence } from "../safety/geofenceEngine";

export interface FishingZoneRecord {
  id: string;
  name: string;
  region?: string;
  suitability?: string;
  chlorophyll?: number;
  sst?: number;
  fishSpecies?: string[];
  depthMeters?: number;
  coordinates?: unknown;
}

export type ZoneRecommendation = "PREFER" | "MONITOR" | "AVOID";

export interface RankedFishingZone {
  id: string;
  name: string;
  region?: string;
  suitability?: string;
  chlorophyllMgM3?: number;
  seaSurfaceTemperatureC?: number;
  fishSpecies?: string[];
  depthMeters?: number;
  score: number;
  recommendation: ZoneRecommendation;
  reasons: string[];
  nearestRestriction?: {
    boundaryName: string;
    distanceKm: number;
    inside: boolean;
  };
}

const zones: FishingZoneRecord[] = Array.isArray(fishingZonesData)
  ? (fishingZonesData as unknown as FishingZoneRecord[])
  : ((fishingZonesData as unknown as { zones?: FishingZoneRecord[] })?.zones ?? []);

function suitabilityScore(suitability?: string): number {
  switch ((suitability ?? "").trim().toLowerCase()) {
    case "high":
    case "favourable":
      return 30;
    case "moderate":
      return 15;
    case "low":
      return 0;
    default:
      return 10;
  }
}

function chlorophyllScore(value?: number): { score: number; reason?: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { score: 0 };
  }

  if (value >= 1.2) {
    return {
      score: 20,
      reason: `Strong chlorophyll concentration (${value.toFixed(2)} mg/m3)`,
    };
  }

  if (value >= 0.7) {
    return {
      score: 10,
      reason: `Moderate chlorophyll concentration (${value.toFixed(2)} mg/m3)`,
    };
  }

  return {
    score: -10,
    reason: `Low chlorophyll concentration (${value.toFixed(2)} mg/m3)`,
  };
}

function sstScore(value?: number): { score: number; reason?: string } {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { score: 0 };
  }

  if (value >= 29.5) {
    return {
      score: -10,
      reason: `Elevated sea-surface temperature (${value.toFixed(1)} °C) may reduce productivity`,
    };
  }

  if (value <= 26) {
    return {
      score: -5,
      reason: `Cooler sea-surface temperature (${value.toFixed(1)} °C)`,
    };
  }

  return {
    score: 10,
    reason: `Favourable sea-surface temperature (${value.toFixed(1)} °C)`,
  };
}

function centroidOf(
  coordinates: unknown
): { latitude: number; longitude: number } | null {
  if (!Array.isArray(coordinates) || coordinates.length === 0) {
    return null;
  }

  const points = coordinates
    .map((point) =>
      Array.isArray(point) && point.length >= 2
        ? { latitude: Number(point[0]), longitude: Number(point[1]) }
        : null
    )
    .filter(
      (point): point is { latitude: number; longitude: number } =>
        point !== null &&
        Number.isFinite(point.latitude) &&
        Number.isFinite(point.longitude)
    );

  if (points.length === 0) {
    return null;
  }

  return {
    latitude:
      points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude:
      points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

export function rankFishingZones(
  options: { query?: string } = {}
): RankedFishingZone[] {
  let candidates = zones;

  if (options.query) {
    const text = options.query.toLowerCase();
    const filtered = candidates.filter(
      (zone) =>
        zone.name.toLowerCase().includes(text) ||
        (zone.region ?? "").toLowerCase().includes(text)
    );

    if (filtered.length > 0) {
      candidates = filtered;
    }
  }

  return candidates
    .map((zone) => {
      const reasons: string[] = [];
      let score = suitabilityScore(zone.suitability);

      reasons.push(`Configured suitability: ${zone.suitability ?? "unknown"}`);

      const chlorophyll = chlorophyllScore(zone.chlorophyll);
      score += chlorophyll.score;
      if (chlorophyll.reason) reasons.push(chlorophyll.reason);

      const sst = sstScore(zone.sst);
      score += sst.score;
      if (sst.reason) reasons.push(sst.reason);

      let nearestRestriction: RankedFishingZone["nearestRestriction"];
      const centroid = centroidOf(zone.coordinates);

      if (centroid) {
        const geofences = checkGeofence(centroid, { radiusKm: 20 });
        const restricted = geofences.find((result) => result.type !== "navigation");

        if (restricted) {
          nearestRestriction = {
            boundaryName: restricted.boundaryName,
            distanceKm: restricted.distanceKm,
            inside: restricted.inside,
          };

          const penalty = restricted.inside
            ? 60
            : restricted.distanceKm <= 5
              ? 35
              : restricted.distanceKm <= 12
                ? 20
                : 8;

          score -= penalty;

          reasons.push(
            restricted.inside
              ? `Inside a restricted boundary: ${restricted.boundaryName}`
              : `${restricted.boundaryName} is approximately ${restricted.distanceKm.toFixed(1)} km away`
          );
        }
      }

      let recommendation: ZoneRecommendation;

      if (nearestRestriction?.inside || score < 15) {
        recommendation = "AVOID";
      } else if (score >= 45 && !nearestRestriction) {
        recommendation = "PREFER";
      } else {
        recommendation = "MONITOR";
      }

      return {
        id: zone.id,
        name: zone.name,
        region: zone.region,
        suitability: zone.suitability,
        chlorophyllMgM3: zone.chlorophyll,
        seaSurfaceTemperatureC: zone.sst,
        fishSpecies: zone.fishSpecies,
        depthMeters: zone.depthMeters,
        score,
        recommendation,
        reasons,
        nearestRestriction,
      };
    })
    .sort((a, b) => b.score - a.score);
}

export function getBestFishingZone(
  options: { query?: string } = {}
): RankedFishingZone | undefined {
  return rankFishingZones(options)[0];
}

export default rankFishingZones;
