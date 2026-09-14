import boundariesData from "../../data/boundaries.json";

export type GeofenceSeverity =
  | "safe"
  | "info"
  | "warning"
  | "high"
  | "critical";

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface GeofenceBoundary {
  id: string;
  name: string;

  type?: string;
  category?: string;

  description?: string;

  latitude?: number;
  longitude?: number;

  radiusKm?: number;

  coordinates?: unknown;
  polygon?: unknown;

  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
}

export interface GeofenceResult {
  boundaryId: string;
  boundaryName: string;

  inside: boolean;

  distanceKm: number;

  severity: GeofenceSeverity;

  type?: string;
  category?: string;

  action:
    | "none"
    | "monitor"
    | "warn"
    | "avoid"
    | "exit";

  message: string;

  boundary: GeofenceBoundary;
}

const boundaries =
  boundariesData as GeofenceBoundary[];

const EARTH_RADIUS_KM = 6371;

function normalizeText(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isValidPoint(
  point: GeoPoint
): boolean {
  return (
    Number.isFinite(
      point.latitude
    ) &&
    Number.isFinite(
      point.longitude
    ) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function toRadians(
  degrees: number
): number {
  return (
    degrees *
    Math.PI /
    180
  );
}

function distanceKm(
  a: GeoPoint,
  b: GeoPoint
): number {
  if (
    !isValidPoint(a) ||
    !isValidPoint(b)
  ) {
    return Infinity;
  }

  const dLat = toRadians(
    b.latitude - a.latitude
  );

  const dLon = toRadians(
    b.longitude - a.longitude
  );

  const lat1 =
    toRadians(a.latitude);

  const lat2 =
    toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) ** 2;

  const safeH = Math.max(
    0,
    Math.min(1, h)
  );

  return (
    EARTH_RADIUS_KM *
    2 *
    Math.atan2(
      Math.sqrt(safeH),
      Math.sqrt(1 - safeH)
    )
  );
}

function normalizePoint(
  value: unknown
): GeoPoint | null {
  if (!value) {
    return null;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    const item =
      value as Record<
        string,
        unknown
      >;

    const latitude =
      item.latitude ??
      item.lat;

    const longitude =
      item.longitude ??
      item.lng ??
      item.lon;

    if (
      typeof latitude === "number" &&
      typeof longitude === "number"
    ) {
      const point = {
        latitude,
        longitude,
      };

      return isValidPoint(point)
        ? point
        : null;
    }
  }

  if (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    /*
     * GeoJSON uses [longitude, latitude].
     */
    const point = {
      latitude: value[1],
      longitude: value[0],
    };

    return isValidPoint(point)
      ? point
      : null;
  }

  return null;
}

function extractPoints(
  value: unknown
): GeoPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const direct: GeoPoint[] = [];

  for (const item of value) {
    const point =
      normalizePoint(item);

    if (point) {
      direct.push(point);
    }
  }

  if (direct.length >= 3) {
    return direct;
  }

  const nested: GeoPoint[] = [];

  for (const item of value) {
    nested.push(
      ...extractPoints(item)
    );
  }

  return nested;
}

function getPolygon(
  boundary: GeofenceBoundary
): GeoPoint[] {
  if (boundary.polygon) {
    const points =
      extractPoints(
        boundary.polygon
      );

    if (points.length >= 3) {
      return points;
    }
  }

  if (boundary.coordinates) {
    const points =
      extractPoints(
        boundary.coordinates
      );

    if (points.length >= 3) {
      return points;
    }
  }

  if (
    boundary.geometry?.coordinates
  ) {
    const points =
      extractPoints(
        boundary.geometry.coordinates
      );

    if (points.length >= 3) {
      return points;
    }
  }

  return [];
}

function getCenter(
  boundary: GeofenceBoundary
): GeoPoint | null {
  if (
    typeof boundary.latitude ===
      "number" &&
    typeof boundary.longitude ===
      "number"
  ) {
    return {
      latitude:
        boundary.latitude,
      longitude:
        boundary.longitude,
    };
  }

  const polygon =
    getPolygon(boundary);

  if (polygon.length === 0) {
    return null;
  }

  const result =
    polygon.reduce(
      (sum, point) => ({
        latitude:
          sum.latitude +
          point.latitude,

        longitude:
          sum.longitude +
          point.longitude,
      }),
      {
        latitude: 0,
        longitude: 0,
      }
    );

  return {
    latitude:
      result.latitude /
      polygon.length,

    longitude:
      result.longitude /
      polygon.length,
  };
}

function pointOnSegment(
  point: GeoPoint,
  a: GeoPoint,
  b: GeoPoint
): boolean {
  const cross =
    (point.longitude -
      a.longitude) *
      (b.latitude -
        a.latitude) -
    (point.latitude -
      a.latitude) *
      (b.longitude -
        a.longitude);

  if (
    Math.abs(cross) >
    1e-9
  ) {
    return false;
  }

  return (
    point.latitude >=
      Math.min(
        a.latitude,
        b.latitude
      ) -
        1e-9 &&
    point.latitude <=
      Math.max(
        a.latitude,
        b.latitude
      ) +
        1e-9 &&
    point.longitude >=
      Math.min(
        a.longitude,
        b.longitude
      ) -
        1e-9 &&
    point.longitude <=
      Math.max(
        a.longitude,
        b.longitude
      ) +
        1e-9
  );
}

function pointInsidePolygon(
  point: GeoPoint,
  polygon: GeoPoint[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let i = 0;
    i < polygon.length;
    i += 1
  ) {
    const a =
      polygon[i];

    const b =
      polygon[
        (i + 1) %
          polygon.length
      ];

    if (
      pointOnSegment(
        point,
        a,
        b
      )
    ) {
      return true;
    }

    const intersects =
      a.latitude >
        point.latitude !==
        b.latitude >
          point.latitude &&
      point.longitude <
        ((b.longitude -
          a.longitude) *
          (point.latitude -
            a.latitude)) /
          (b.latitude -
            a.latitude) +
          a.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function closestBoundaryDistance(
  point: GeoPoint,
  boundary: GeofenceBoundary
): number {
  const polygon =
    getPolygon(boundary);

  if (polygon.length >= 2) {
    let minimum =
      Infinity;

    for (
      let i = 0;
      i < polygon.length;
      i += 1
    ) {
      minimum = Math.min(
        minimum,
        distanceKm(
          point,
          polygon[i]
        )
      );
    }

    return minimum;
  }

  const center =
    getCenter(boundary);

  if (!center) {
    return Infinity;
  }

  return distanceKm(
    point,
    center
  );
}

function isOperationalRestriction(
  boundary: GeofenceBoundary
): boolean {
  const text = normalizeText(
    `${boundary.type ?? ""} ${
      boundary.category ?? ""
    } ${boundary.name}`
  );

  return (
    text.includes("restricted") ||
    text.includes("protected") ||
    text.includes("conservation") ||
    text.includes("no entry") ||
    text.includes("no_entry") ||
    text.includes("no fishing") ||
    text.includes("no_fishing") ||
    text.includes("temporary")
  );
}

function classifyGeofence(
  boundary: GeofenceBoundary,
  inside: boolean,
  distance: number
): {
  severity: GeofenceSeverity;
  action: GeofenceResult["action"];
} {
  const restricted =
    isOperationalRestriction(
      boundary
    );

  if (inside && restricted) {
    return {
      severity: "critical",
      action: "exit",
    };
  }

  if (
    Number.isFinite(distance) &&
    distance <= 1 &&
    restricted
  ) {
    return {
      severity: "high",
      action: "avoid",
    };
  }

  if (
    Number.isFinite(distance) &&
    distance <= 5 &&
    restricted
  ) {
    return {
      severity: "warning",
      action: "warn",
    };
  }

  if (
    Number.isFinite(distance) &&
    distance <= 10
  ) {
    return {
      severity: "info",
      action: "monitor",
    };
  }

  return {
    severity: "safe",
    action: "none",
  };
}

function buildMessage(
  boundary: GeofenceBoundary,
  inside: boolean,
  distance: number,
  severity: GeofenceSeverity
): string {
  if (inside) {
    if (
      severity ===
      "critical"
    ) {
      return `You are inside ${boundary.name}. Exit the restricted or protected zone before continuing operations.`;
    }

    return `You are inside ${boundary.name}. Follow the applicable operational restriction.`;
  }

  if (
    !Number.isFinite(distance)
  ) {
    return `${boundary.name} was identified, but its proximity could not be calculated.`;
  }

  if (distance <= 1) {
    return `${boundary.name} is approximately ${distance.toFixed(
      1
    )} km away. Maintain safe separation.`;
  }

  if (distance <= 5) {
    return `${boundary.name} is approximately ${distance.toFixed(
      1
    )} km away. Monitor your position and avoid entering the zone.`;
  }

  if (distance <= 10) {
    return `${boundary.name} is approximately ${distance.toFixed(
      1
    )} km away. Keep the boundary in your route plan.`;
  }

  return `${boundary.name} is outside the immediate geofence warning range.`;
}

export function checkGeofence(
  point: GeoPoint,
  options: {
    radiusKm?: number;
  } = {}
): GeofenceResult[] {
  if (!isValidPoint(point)) {
    return [];
  }

  const radiusKm =
    typeof options.radiusKm ===
      "number" &&
    Number.isFinite(
      options.radiusKm
    )
      ? Math.max(
          0,
          options.radiusKm
        )
      : 25;

  return boundaries
    .map(
      (
        boundary
      ): GeofenceResult => {
        const polygon =
          getPolygon(
            boundary
          );

        const inside =
          polygon.length >= 3
            ? pointInsidePolygon(
                point,
                polygon
              )
            : false;

        const distance =
          inside
            ? 0
            : closestBoundaryDistance(
                point,
                boundary
              );

        const classification =
          classifyGeofence(
            boundary,
            inside,
            distance
          );

        return {
          boundaryId:
            boundary.id,

          boundaryName:
            boundary.name,

          inside,

          distanceKm:
            distance,

          severity:
            classification.severity,

          type:
            boundary.type,

          category:
            boundary.category,

          action:
            classification.action,

          message:
            buildMessage(
              boundary,
              inside,
              distance,
              classification.severity
            ),

          boundary,
        };
      }
    )
    .filter(
      (result) =>
        result.inside ||
        result.distanceKm <=
          radiusKm
    )
    .sort(
      (a, b) =>
        a.distanceKm -
        b.distanceKm
    );
}

export function getActiveGeofenceWarnings(
  point: GeoPoint,
  radiusKm = 5
): GeofenceResult[] {
  return checkGeofence(
    point,
    { radiusKm }
  ).filter(
    (result) =>
      result.severity ===
        "warning" ||
      result.severity ===
        "high" ||
      result.severity ===
        "critical"
  );
}

export function isInsideRestrictedBoundary(
  point: GeoPoint
): boolean {
  return checkGeofence(
    point,
    { radiusKm: 0 }
  ).some(
    (result) =>
      result.inside &&
      isOperationalRestriction(
        result.boundary
      )
  );
}

export function getNearestBoundary(
  point: GeoPoint
): GeofenceResult | undefined {
  return checkGeofence(
    point,
    { radiusKm: 100 }
  )[0];
}

export function getGeofenceMessage(
  point: GeoPoint
): string {
  const warnings =
    getActiveGeofenceWarnings(
      point
    );

  if (warnings.length === 0) {
    return "No immediate configured geofence warning.";
  }

  return warnings
    .slice(0, 3)
    .map(
      (warning) =>
        warning.message
    )
    .join(" ");
}

export default checkGeofence;