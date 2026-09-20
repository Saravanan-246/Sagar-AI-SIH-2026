import type { Coordinates, MarineArea } from "../types/marine";
import type { RoutePoint } from "../types/route";

const EARTH_RADIUS_KM = 6371;

export function toRadians(
  degrees: number
): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(
  radians: number
): number {
  return (radians * 180) / Math.PI;
}

export function isValidLatitude(
  latitude: number
): boolean {
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90;
}

export function isValidLongitude(
  longitude: number
): boolean {
  return Number.isFinite(longitude) && longitude >= -180 && longitude <= 180;
}

export function isValidCoordinates(
  coordinates: Coordinates
): boolean {
  return (
    isValidLatitude(coordinates.latitude) &&
    isValidLongitude(coordinates.longitude)
  );
}

export function haversineDistanceKm(
  from: Coordinates,
  to: Coordinates
): number {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    return Infinity;
  }

  const latitudeDifference = toRadians(
    to.latitude - from.latitude
  );

  const longitudeDifference = toRadians(
    to.longitude - from.longitude
  );

  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);

  const a =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDifference / 2) ** 2;

  const clampedA = Math.min(1, Math.max(0, a));

  const c =
    2 * Math.atan2(
      Math.sqrt(clampedA),
      Math.sqrt(1 - clampedA)
    );

  return EARTH_RADIUS_KM * c;
}

export function distanceBetweenPoints(
  from: RoutePoint | Coordinates,
  to: RoutePoint | Coordinates
): number {
  return haversineDistanceKm(from, to);
}

export function calculatePolylineDistanceKm(
  points: Array<RoutePoint | Coordinates>
): number {
  if (points.length < 2) {
    return 0;
  }

  let distance = 0;

  for (let index = 1; index < points.length; index += 1) {
    distance += haversineDistanceKm(
      points[index - 1],
      points[index]
    );
  }

  return distance;
}

export function midpoint(
  from: Coordinates,
  to: Coordinates
): Coordinates {
  return {
    latitude: (from.latitude + to.latitude) / 2,
    longitude: (from.longitude + to.longitude) / 2,
  };
}

export function bearingDegrees(
  from: Coordinates,
  to: Coordinates
): number {
  if (!isValidCoordinates(from) || !isValidCoordinates(to)) {
    return NaN;
  }

  const latitude1 = toRadians(from.latitude);
  const latitude2 = toRadians(to.latitude);

  const longitudeDifference = toRadians(
    to.longitude - from.longitude
  );

  const y =
    Math.sin(longitudeDifference) *
    Math.cos(latitude2);

  const x =
    Math.cos(latitude1) * Math.sin(latitude2) -
    Math.sin(latitude1) *
      Math.cos(latitude2) *
      Math.cos(longitudeDifference);

  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function bearingLabel(
  bearing: number
): string {
  if (!Number.isFinite(bearing)) {
    return "—";
  }

  const directions = [
    "N",
    "NE",
    "E",
    "SE",
    "S",
    "SW",
    "W",
    "NW",
  ];

  const normalized = ((bearing % 360) + 360) % 360;
  const index = Math.round(normalized / 45) % 8;

  return directions[index];
}

export function destinationPoint(
  start: Coordinates,
  distanceKm: number,
  bearing: number
): Coordinates {
  if (!isValidCoordinates(start) || !Number.isFinite(distanceKm)) {
    return start;
  }

  const angularDistance = distanceKm / EARTH_RADIUS_KM;
  const bearingRadians = toRadians(bearing);

  const latitude1 = toRadians(start.latitude);
  const longitude1 = toRadians(start.longitude);

  const latitude2 = Math.asin(
    Math.sin(latitude1) *
      Math.cos(angularDistance) +
      Math.cos(latitude1) *
        Math.sin(angularDistance) *
        Math.cos(bearingRadians)
  );

  const longitude2 =
    longitude1 +
    Math.atan2(
      Math.sin(bearingRadians) *
        Math.sin(angularDistance) *
        Math.cos(latitude1),
      Math.cos(angularDistance) -
        Math.sin(latitude1) * Math.sin(latitude2)
    );

  return {
    latitude: toDegrees(latitude2),
    longitude: ((toDegrees(longitude2) + 540) % 360) - 180,
  };
}

export function coordinatesEqual(
  a: Coordinates,
  b: Coordinates,
  tolerance = 0.000001
): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= tolerance &&
    Math.abs(a.longitude - b.longitude) <= tolerance
  );
}

export function isPointWithinRadius(
  point: Coordinates,
  center: Coordinates,
  radiusKm: number
): boolean {
  if (!Number.isFinite(radiusKm) || radiusKm < 0) {
    return false;
  }

  return haversineDistanceKm(point, center) <= radiusKm;
}

/** The configured marine area nearest a real coordinate (e.g. a route
 * waypoint or an alert's own location) - never the name of a place
 * that isn't one of Sagar's configured areas, so a chat question built
 * from it always resolves through Chat's existing area-name matching
 * instead of silently going unrecognised. */
export function nearestMarineAreaName(
  point: Coordinates,
  areas: MarineArea[]
): string | null {
  let nearest: MarineArea | null = null;
  let nearestDistanceKm = Infinity;

  for (const area of areas) {
    const distance = haversineDistanceKm(point, area.coordinates);

    if (distance < nearestDistanceKm) {
      nearestDistanceKm = distance;
      nearest = area;
    }
  }

  return nearest?.name ?? null;
}