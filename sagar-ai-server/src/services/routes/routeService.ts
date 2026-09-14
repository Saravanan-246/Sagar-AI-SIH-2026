import routesData from "../../data/routes.json";

import type {
  RoutePlan,
  RoutePoint,
} from "../../types/route";

type Coordinate = {
  latitude: number;
  longitude: number;
};

type RouteSourceRecord = {
  id: string;
  name: string;
  status?: string;
  origin?: {
    name?: string;
    latitude: number;
    longitude: number;
  };
  destination?: {
    name?: string;
    latitude: number;
    longitude: number;
  };
  waypoints: Array<Coordinate | [number, number]>;
  distanceKm?: number;
  estimatedDurationHours?: number;
  recommendedSpeedKnots?: number;
  risk?: {
    level: "low" | "moderate" | "high" | "critical";
    score: number;
  };
  riskScore?: number;
  riskLevel?: "low" | "moderate" | "high" | "critical";
  conditions?: {
    wind?: string;
    waves?: string;
    visibility?: string;
  };
  routeDecision?: "preferred" | "caution" | "avoid" | "blocked";
  recommendation?: string;
  reason?: string;
  avoidedHazards?: string[];
};

// Safely extract the array whether routesData is an array or { routes: [...] }
const rawRouteRecords: any[] = Array.isArray(routesData)
  ? routesData
  : Array.isArray((routesData as any)?.routes)
  ? (routesData as any).routes
  : [];

const EARTH_RADIUS_KM = 6371;
const NAUTICAL_MILE_IN_KM = 1.852;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function parseCoordinate(point: any): Coordinate | null {
  if (!point) return null;
  if (Array.isArray(point) && point.length >= 2) {
    const [first, second] = point;
    // Auto-correct if longitude and latitude are inverted
    if (first > 50 && second < 30) {
      return { latitude: second, longitude: first };
    }
    return { latitude: first, longitude: second };
  }
  if (typeof point === "object") {
    const lat = point.latitude ?? point.lat;
    const lng = point.longitude ?? point.lng ?? point.lon;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
}

function haversineDistanceKm(a: Coordinate, b: Coordinate): number {
  const latitude1 = toRadians(a.latitude);
  const latitude2 = toRadians(b.latitude);

  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);

  const value =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;

  const angularDistance =
    2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));

  return EARTH_RADIUS_KM * angularDistance;
}

function calculatePolylineDistanceKm(points: Coordinate[]): number {
  if (points.length < 2) {
    return 0;
  }

  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += haversineDistanceKm(points[index], points[index + 1]);
  }

  return total;
}

function knotsToKmh(knots: number): number {
  return knots * NAUTICAL_MILE_IN_KM;
}

function calculateDurationHours(distanceKm: number, speedKnots: number): number {
  if (!Number.isFinite(distanceKm) || !Number.isFinite(speedKnots) || speedKnots <= 0) {
    return 0;
  }

  const speedKmh = knotsToKmh(speedKnots);
  return distanceKm / speedKmh;
}

function normalizeRoute(route: RouteSourceRecord, index: number): RoutePlan {
  // Normalize waypoints into Coordinate array
  const rawWaypoints = Array.isArray(route.waypoints) ? route.waypoints : [];
  const validWaypoints: Coordinate[] = rawWaypoints
    .map(parseCoordinate)
    .filter((pt): pt is Coordinate => pt !== null);

  const originCoord =
    parseCoordinate(route.origin) ||
    (validWaypoints.length > 0 ? validWaypoints[0] : { latitude: 8.7642, longitude: 78.1348 });

  const destinationCoord =
    parseCoordinate(route.destination) ||
    (validWaypoints.length > 1
      ? validWaypoints[validWaypoints.length - 1]
      : validWaypoints[0] || { latitude: 8.7642, longitude: 78.1348 });

  const calculatedDistance = calculatePolylineDistanceKm(validWaypoints);
  const distanceKm =
    Number(route.distanceKm) > 0
      ? Number(route.distanceKm)
      : calculatedDistance > 0
      ? calculatedDistance
      : haversineDistanceKm(originCoord, destinationCoord);

  const speed = Number(route.recommendedSpeedKnots) || 7;
  const estimatedDurationHours =
    Number(route.estimatedDurationHours) > 0
      ? Number(route.estimatedDurationHours)
      : calculateDurationHours(distanceKm, speed);

  const riskScore =
    Number(route.risk?.score ?? route.riskScore) ||
    (route.risk?.level === "critical" || route.riskLevel === "critical" ? 85 : 25);

  const riskLevel: "low" | "moderate" | "high" | "critical" =
    route.risk?.level || route.riskLevel || getRouteRiskLabel(riskScore);

  let routeDecision: "preferred" | "caution" | "avoid" | "blocked" =
    route.routeDecision || "caution";

  if (!route.routeDecision && route.recommendation) {
    const rec = route.recommendation.toLowerCase();
    if (rec.includes("avoid")) routeDecision = "avoid";
    else if (rec.includes("recommend") || rec.includes("preferred")) routeDecision = "preferred";
    else routeDecision = "caution";
  }

  return {
    id: route.id || `route-${index}`,
    name: route.name || `Navigational Route ${index + 1}`,
    status: (route.status as RoutePlan["status"]) || (routeDecision === "preferred" ? "recommended" : "review"),
    origin: {
      name: route.origin?.name || "Port of Origin",
      latitude: originCoord.latitude,
      longitude: originCoord.longitude,
    },
    destination: {
      name: route.destination?.name || "Destination Zone",
      latitude: destinationCoord.latitude,
      longitude: destinationCoord.longitude,
    },
    waypoints: validWaypoints.map((pt): RoutePoint => ({
      latitude: pt.latitude,
      longitude: pt.longitude,
    })),
    distanceKm: Number(distanceKm.toFixed(1)),
    estimatedDurationHours: Number(estimatedDurationHours.toFixed(1)),
    recommendedSpeedKnots: speed,
    risk: {
      level: riskLevel,
      score: riskScore,
    },
    conditions: {
      wind: route.conditions?.wind || "Moderate breeze",
      waves: route.conditions?.waves || "0.8m - 1.2m",
      visibility: route.conditions?.visibility || "Good",
    },
    routeDecision,
    reason: route.reason || "Operational corridor evaluated for navigation.",
    avoidedHazards: Array.isArray(route.avoidedHazards) ? route.avoidedHazards : [],
  };
}

// Safely map normalized records
const normalizedRoutes: RoutePlan[] = rawRouteRecords.map(normalizeRoute);

export function getRoutes(): RoutePlan[] {
  return [...normalizedRoutes];
}

export function getRouteById(routeId: string): RoutePlan | undefined {
  const id = routeId.trim().toLowerCase();
  if (!id) return undefined;

  return normalizedRoutes.find((route) => route.id.toLowerCase() === id);
}

export function getRecommendedRoutes(): RoutePlan[] {
  return normalizedRoutes
    .filter(
      (route) =>
        route.routeDecision === "preferred" || route.status === "recommended"
    )
    .sort((a, b) => a.risk.score - b.risk.score);
}

export function getSafestRoute(): RoutePlan | undefined {
  return [...normalizedRoutes].sort((a, b) => {
    if (a.routeDecision === "blocked" && b.routeDecision !== "blocked") return 1;
    if (b.routeDecision === "blocked" && a.routeDecision !== "blocked") return -1;
    return a.risk.score - b.risk.score;
  })[0];
}

export function getShortestRoute(): RoutePlan | undefined {
  return [...normalizedRoutes]
    .filter((route) => route.routeDecision !== "blocked")
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

export function getRoutesBetween(originName: string, destinationName: string): RoutePlan[] {
  const originQuery = originName.trim().toLowerCase();
  const destinationQuery = destinationName.trim().toLowerCase();

  if (!originQuery || !destinationQuery) return [];

  return normalizedRoutes
    .filter((route) => {
      const origin = (route.origin.name ?? "").toLowerCase();
      const destination = (route.destination.name ?? "").toLowerCase();
      return origin.includes(originQuery) && destination.includes(destinationQuery);
    })
    .sort((a, b) => compareRouteSafety(a, b));
}

export function calculateRoute(origin: Coordinate, destination: Coordinate): RoutePlan {
  validateCoordinate(origin);
  validateCoordinate(destination);

  const matchingRoutes = findMatchingRoutes(origin, destination);
  if (matchingRoutes.length > 0) {
    return chooseBestRoute(matchingRoutes);
  }

  return buildCalculatedRoute(origin, destination);
}

function findMatchingRoutes(origin: Coordinate, destination: Coordinate): RoutePlan[] {
  const ORIGIN_THRESHOLD_KM = 8;
  const DESTINATION_THRESHOLD_KM = 8;

  return normalizedRoutes.filter((route) => {
    const originDistance = haversineDistanceKm(origin, route.origin);
    const destinationDistance = haversineDistanceKm(destination, route.destination);

    return (
      originDistance <= ORIGIN_THRESHOLD_KM &&
      destinationDistance <= DESTINATION_THRESHOLD_KM
    );
  });
}

function chooseBestRoute(routes: RoutePlan[]): RoutePlan {
  return [...routes].sort(compareRouteSafety)[0];
}

function compareRouteSafety(a: RoutePlan, b: RoutePlan): number {
  const blockedDifference =
    Number(a.routeDecision === "blocked") - Number(b.routeDecision === "blocked");

  if (blockedDifference !== 0) return blockedDifference;

  const riskDifference = a.risk.score - b.risk.score;
  if (riskDifference !== 0) return riskDifference;

  return a.distanceKm - b.distanceKm;
}

function buildCalculatedRoute(origin: Coordinate, destination: Coordinate): RoutePlan {
  const distanceKm = haversineDistanceKm(origin, destination);
  const defaultSpeedKnots = 7;
  const estimatedDurationHours = calculateDurationHours(distanceKm, defaultSpeedKnots);

  return {
    id: `calculated-${Date.now()}`,
    name: "Calculated corridor",
    status: "review",
    origin: {
      name: "Selected origin",
      latitude: origin.latitude,
      longitude: origin.longitude,
    },
    destination: {
      name: "Selected destination",
      latitude: destination.latitude,
      longitude: destination.longitude,
    },
    waypoints: [
      { latitude: origin.latitude, longitude: origin.longitude },
      {
        latitude: (origin.latitude + destination.latitude) / 2,
        longitude: (origin.longitude + destination.longitude) / 2,
      },
      { latitude: destination.latitude, longitude: destination.longitude },
    ],
    distanceKm: Number(distanceKm.toFixed(1)),
    estimatedDurationHours: Number(estimatedDurationHours.toFixed(1)),
    recommendedSpeedKnots: defaultSpeedKnots,
    risk: {
      level: "moderate",
      score: 50,
    },
    conditions: {
      wind: "Review current conditions",
      waves: "Review current conditions",
      visibility: "Review current conditions",
    },
    routeDecision: "caution",
    reason:
      "A coordinate-derived route has been calculated. Current marine hazards, geofences and official navigational information should be evaluated before operation.",
    avoidedHazards: [],
  };
}

export function calculateRouteDistance(origin: Coordinate, destination: Coordinate): number {
  validateCoordinate(origin);
  validateCoordinate(destination);
  return haversineDistanceKm(origin, destination);
}

export function calculateRouteDuration(distanceKm: number, speedKnots: number): number {
  return calculateDurationHours(distanceKm, speedKnots);
}

export function getRouteRiskLabel(score: number): "low" | "moderate" | "high" | "critical" {
  if (score < 30) return "low";
  if (score < 60) return "moderate";
  if (score < 80) return "high";
  return "critical";
}

export function rankRoutes(source: RoutePlan[] = normalizedRoutes): RoutePlan[] {
  return [...source].sort(compareRouteSafety);
}

function validateCoordinate(coordinate: Coordinate): void {
  if (!Number.isFinite(coordinate.latitude) || !Number.isFinite(coordinate.longitude)) {
    throw new Error("Invalid route coordinate.");
  }
  if (coordinate.latitude < -90 || coordinate.latitude > 90) {
    throw new Error("Latitude must be between -90 and 90.");
  }
  if (coordinate.longitude < -180 || coordinate.longitude > 180) {
    throw new Error("Longitude must be between -180 and 180.");
  }
}

export default {
  getRoutes,
  getRouteById,
  getRecommendedRoutes,
  getSafestRoute,
  getShortestRoute,
  getRoutesBetween,
  calculateRoute,
  calculateRouteDistance,
  calculateRouteDuration,
  getRouteRiskLabel,
  rankRoutes,
};