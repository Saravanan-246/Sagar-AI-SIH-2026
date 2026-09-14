import boundariesData from "../../data/boundaries.json";
import fishingZonesData from "../../data/fishingZones.json";

import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  GeoAgentData,
} from "./agentTypes";

interface BoundaryRecord {
  id: string;
  name: string;
  type?: string;
  category?: string;

  latitude?: number;
  longitude?: number;
  radiusKm?: number;

  coordinates?: unknown;
  polygon?: unknown;
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };

  description?: string;
  metadata?: Record<string, unknown>;
}

interface FishingZoneRecord {
  id: string;
  name: string;
  latitude?: number;
  longitude?: number;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  polygon?: unknown;
  status?: string;
  suitability?: string;
  risk?: string;
  [key: string]: unknown;
}

interface GeoPoint {
  latitude: number;
  longitude: number;
}

const boundaries =
  boundariesData as BoundaryRecord[];

const fishingZones = (
  Array.isArray(fishingZonesData)
    ? fishingZonesData
    : ((fishingZonesData as { zones?: unknown[] })?.zones ?? [])
) as FishingZoneRecord[];

const DEGREE_EPSILON = 1e-9;

function isValidPoint(
  point: GeoPoint
): boolean {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function toRadians(
  degrees: number
): number {
  return (degrees * Math.PI) / 180;
}

function haversineDistanceKm(
  a: GeoPoint,
  b: GeoPoint
): number {
  if (
    !isValidPoint(a) ||
    !isValidPoint(b)
  ) {
    return Infinity;
  }

  const latitudeDifference = toRadians(
    b.latitude - a.latitude
  );

  const longitudeDifference = toRadians(
    b.longitude - a.longitude
  );

  const latitude1 = toRadians(a.latitude);
  const latitude2 = toRadians(b.latitude);

  const value =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(longitudeDifference / 2) ** 2;

  const safeValue = Math.min(
    1,
    Math.max(0, value)
  );

  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(safeValue),
      Math.sqrt(1 - safeValue)
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
    value !== null
  ) {
    const item = value as Record<
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
     * This dataset stores coordinate pairs as [latitude, longitude].
     * Auto-correct only if the pair is clearly [longitude, latitude]
     * instead, using the same heuristic used elsewhere for this
     * coastal region (latitude ~5-25, longitude ~50-100).
     */
    const [first, second] = value;

    const point =
      first > 50 && second < 30
        ? { latitude: second, longitude: first }
        : { latitude: first, longitude: second };

    return isValidPoint(point)
      ? point
      : null;
  }

  return null;
}

function extractPolygonPoints(
  value: unknown
): GeoPoint[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const directPoints: GeoPoint[] = [];

  for (const item of value) {
    const point = normalizePoint(item);

    if (point) {
      directPoints.push(point);
    }
  }

  if (directPoints.length >= 3) {
    return directPoints;
  }

  const nestedPoints: GeoPoint[] = [];

  for (const item of value) {
    nestedPoints.push(
      ...extractPolygonPoints(item)
    );
  }

  return nestedPoints;
}

function getBoundaryPolygon(
  boundary: BoundaryRecord
): GeoPoint[] {
  if (boundary.polygon) {
    const points = extractPolygonPoints(
      boundary.polygon
    );

    if (points.length >= 3) {
      return points;
    }
  }

  if (boundary.coordinates) {
    const points = extractPolygonPoints(
      boundary.coordinates
    );

    if (points.length >= 3) {
      return points;
    }
  }

  if (boundary.geometry?.coordinates) {
    const points = extractPolygonPoints(
      boundary.geometry.coordinates
    );

    if (points.length >= 3) {
      return points;
    }
  }

  return [];
}

function getBoundaryCenter(
  boundary: BoundaryRecord
): GeoPoint | null {
  if (
    typeof boundary.latitude === "number" &&
    typeof boundary.longitude === "number"
  ) {
    return normalizePoint({
      latitude: boundary.latitude,
      longitude: boundary.longitude,
    });
  }

  const polygon =
    getBoundaryPolygon(boundary);

  if (polygon.length === 0) {
    return null;
  }

  const total = polygon.reduce(
    (accumulator, point) => ({
      latitude:
        accumulator.latitude +
        point.latitude,

      longitude:
        accumulator.longitude +
        point.longitude,
    }),
    {
      latitude: 0,
      longitude: 0,
    }
  );

  return {
    latitude:
      total.latitude / polygon.length,

    longitude:
      total.longitude / polygon.length,
  };
}

function pointOnSegment(
  point: GeoPoint,
  start: GeoPoint,
  end: GeoPoint
): boolean {
  const cross =
    (point.longitude - start.longitude) *
      (end.latitude - start.latitude) -
    (point.latitude - start.latitude) *
      (end.longitude - start.longitude);

  if (Math.abs(cross) > DEGREE_EPSILON) {
    return false;
  }

  return (
    point.longitude >=
      Math.min(
        start.longitude,
        end.longitude
      ) -
        DEGREE_EPSILON &&
    point.longitude <=
      Math.max(
        start.longitude,
        end.longitude
      ) +
        DEGREE_EPSILON &&
    point.latitude >=
      Math.min(
        start.latitude,
        end.latitude
      ) -
        DEGREE_EPSILON &&
    point.latitude <=
      Math.max(
        start.latitude,
        end.latitude
      ) +
        DEGREE_EPSILON
  );
}

function isPointInsidePolygon(
  point: GeoPoint,
  polygon: GeoPoint[]
): boolean {
  if (polygon.length < 3) {
    return false;
  }

  let inside = false;

  for (
    let index = 0;
    index < polygon.length;
    index += 1
  ) {
    const current =
      polygon[index];

    const next =
      polygon[
        (index + 1) % polygon.length
      ];

    if (
      pointOnSegment(
        point,
        current,
        next
      )
    ) {
      return true;
    }

    const intersects =
      current.latitude > point.latitude !==
        next.latitude > point.latitude &&
      point.longitude <
        ((next.longitude -
          current.longitude) *
          (point.latitude -
            current.latitude)) /
          (next.latitude -
            current.latitude) +
          current.longitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function getPointFromRequest(
  request: AgentRequest
): GeoPoint | null {
  const parameters =
    request.parameters ?? {};

  const explicitCoordinates =
    parameters.coordinates;

  const fromCoordinates =
    normalizePoint(
      explicitCoordinates
    );

  if (fromCoordinates) {
    return fromCoordinates;
  }

  const latitude =
    parameters.latitude;

  const longitude =
    parameters.longitude;

  if (
    typeof latitude === "number" &&
    typeof longitude === "number"
  ) {
    return normalizePoint({
      latitude,
      longitude,
    });
  }

  if (request.context.coordinates) {
    return normalizePoint(
      request.context.coordinates
    );
  }

  return null;
}

function findRequestedArea(
  request: AgentRequest
): string | undefined {
  return (
    request.area?.name ??
    request.context.areaName ??
    (typeof request.parameters
      ?.areaName === "string"
      ? request.parameters.areaName
      : undefined)
  );
}

function normalizeText(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function boundaryIsRestricted(
  boundary: BoundaryRecord
): boolean {
  const type = normalizeText(
    boundary.type
  );

  const category = normalizeText(
    boundary.category
  );

  const combined =
    `${type} ${category}`;

  return (
    combined.includes("restricted") ||
    combined.includes("protected") ||
    combined.includes(
      "conservation"
    ) ||
    combined.includes(
      "temporary"
    ) ||
    combined.includes(
      "no_entry"
    ) ||
    combined.includes(
      "no_fishing"
    )
  );
}

function getBoundaryDistance(
  point: GeoPoint,
  boundary: BoundaryRecord
): number {
  const polygon =
    getBoundaryPolygon(boundary);

  if (polygon.length >= 2) {
    let minimum = Infinity;

    for (
      let index = 0;
      index < polygon.length;
      index += 1
    ) {
      const current =
        polygon[index];

      const next =
        polygon[
          (index + 1) % polygon.length
        ];

      /*
       * For the prototype we use the closest
       * polygon vertex as a stable approximation.
       * Full geodesic segment distance can be
       * added later without changing the agent
       * contract.
       */
      minimum = Math.min(
        minimum,
        haversineDistanceKm(
          point,
          current
        ),
        haversineDistanceKm(
          point,
          next
        )
      );
    }

    return minimum;
  }

  const center =
    getBoundaryCenter(boundary);

  if (!center) {
    return Infinity;
  }

  return haversineDistanceKm(
    point,
    center
  );
}

function getNearbyBoundaries(
  point: GeoPoint,
  radiusKm = 25
): Array<{
  boundary: BoundaryRecord;
  distanceKm: number;
  inside: boolean;
}> {
  return boundaries
    .map((boundary) => {
      const polygon =
        getBoundaryPolygon(boundary);

      const inside =
        polygon.length >= 3
          ? isPointInsidePolygon(
              point,
              polygon
            )
          : false;

      const distanceKm =
        inside
          ? 0
          : getBoundaryDistance(
              point,
              boundary
            );

      return {
        boundary,
        distanceKm,
        inside,
      };
    })
    .filter(
      (item) =>
        item.inside ||
        item.distanceKm <= radiusKm
    )
    .sort(
      (a, b) =>
        a.distanceKm -
        b.distanceKm
    );
}

function getNearbyFishingZones(
  point: GeoPoint,
  radiusKm = 100
): FishingZoneRecord[] {
  return fishingZones
    .map((zone) => {
      const zonePoint =
        normalizePoint(
          zone.coordinates
        ) ??
        normalizePoint({
          latitude: zone.latitude,
          longitude: zone.longitude,
        });

      if (!zonePoint) {
        return {
          zone,
          distance: Infinity,
        };
      }

      return {
        zone,
        distance:
          haversineDistanceKm(
            point,
            zonePoint
          ),
      };
    })
    .filter(
      (item) =>
        item.distance <= radiusKm
    )
    .sort(
      (a, b) =>
        a.distance -
        b.distance
    )
    .map((item) => item.zone);
}

function buildFindings(
  request: AgentRequest,
  point: GeoPoint | null,
  nearbyBoundaries: Array<{
    boundary: BoundaryRecord;
    distanceKm: number;
    inside: boolean;
  }>
): AgentFinding[] {
  const findings: AgentFinding[] = [];

  if (!point) {
    findings.push({
      id: `geo-location-${request.requestId}`,
      agent: "geo",
      title: "Location not available",
      summary:
        "No coordinates were available for precise boundary analysis.",
      severity: "info",
      confidence: 0.4,
    });

    return findings;
  }

  findings.push({
    id: `geo-position-${request.requestId}`,
    agent: "geo",
    title: "Operating position identified",
    summary: `Position: ${point.latitude.toFixed(
      4
    )}° N, ${point.longitude.toFixed(
      4
    )}° E`,
    severity: "info",
    confidence: 1,
    data: {
      latitude: point.latitude,
      longitude: point.longitude,
    },
  });

  const restrictedNearby =
    nearbyBoundaries.filter(
      (item) =>
        boundaryIsRestricted(
          item.boundary
        )
    );

  for (
    const item of restrictedNearby.slice(
      0,
      5
    )
  ) {
    const severity =
      item.inside
        ? "critical"
        : item.distanceKm <= 1
          ? "high"
          : item.distanceKm <= 5
            ? "moderate"
            : "low";

    findings.push({
      id: `geo-boundary-${request.requestId}-${item.boundary.id}`,
      agent: "geo",
      title:
        item.inside
          ? `Inside ${item.boundary.name}`
          : `${item.boundary.name} nearby`,
      summary:
        item.inside
          ? "The current position falls inside a configured operational boundary."
          : `${item.boundary.name} is approximately ${item.distanceKm.toFixed(
              1
            )} km away.`,
      severity,
      confidence: 0.95,
      data: {
        boundaryId:
          item.boundary.id,
        boundaryType:
          item.boundary.type,
        distanceKm:
          item.distanceKm,
        inside: item.inside,
      },
    });
  }

  const areaName =
    findRequestedArea(request);

  if (areaName) {
    findings.push({
      id: `geo-area-${request.requestId}`,
      agent: "geo",
      title: "Area context applied",
      summary: `Geospatial analysis is being evaluated for ${areaName}.`,
      severity: "info",
      confidence: 0.9,
      data: {
        areaName,
      },
    });
  }

  return findings;
}

function buildRecommendation(
  insideRestrictedArea: boolean,
  nearbyRestrictedAreas: string[],
  nearestDistanceKm: number
): string {
  if (insideRestrictedArea) {
    return "Stop or reroute away from the restricted or protected boundary before continuing operations.";
  }

  if (
    Number.isFinite(nearestDistanceKm) &&
    nearestDistanceKm <= 1
  ) {
    return "Maintain a safe separation from the nearby restricted or protected boundary and consider an alternative route.";
  }

  if (
    Number.isFinite(nearestDistanceKm) &&
    nearestDistanceKm <= 5
  ) {
    return "Monitor boundary proximity and avoid entering the restricted or protected zone.";
  }

  if (
    nearbyRestrictedAreas.length > 0
  ) {
    return "Keep the identified restricted areas in the route plan and verify the intended path before departure.";
  }

  return "No nearby configured operational restriction was identified from the available geospatial data.";
}

export async function runGeoAgent(
  request: AgentRequest
): Promise<
  AgentResponse<GeoAgentData>
> {
  try {
    const point =
      getPointFromRequest(request);

    const nearbyBoundaries = point
      ? getNearbyBoundaries(
          point,
          25
        )
      : [];

    const restrictedBoundaries =
      nearbyBoundaries.filter(
        (item) =>
          boundaryIsRestricted(
            item.boundary
          )
      );

    const insideRestrictedArea =
      restrictedBoundaries.some(
        (item) => item.inside
      );

    const nearbyRestrictedAreas =
      restrictedBoundaries.map(
        (item) =>
          item.boundary.name
      );

    const nearestRestricted =
      restrictedBoundaries[0];

    const boundaryDistanceKm =
      nearestRestricted
        ? nearestRestricted.distanceKm
        : undefined;

    const nearbyFishingZones =
      point
        ? getNearbyFishingZones(
            point,
            100
          )
        : [];

    const findings = buildFindings(
      request,
      point,
      nearbyBoundaries
    );

    if (
      nearbyFishingZones.length > 0
    ) {
      findings.push({
        id: `geo-zones-${request.requestId}`,
        agent: "geo",
        title: "Nearby fishing zones identified",
        summary: `${nearbyFishingZones.length} configured fishing zone(s) are within the analysis range.`,
        severity: "info",
        confidence: 0.9,
        data: {
          zoneIds:
            nearbyFishingZones.map(
              (zone) => zone.id
            ),
          zoneNames:
            nearbyFishingZones.map(
              (zone) => zone.name
            ),
        },
      });
    }

    const recommendation =
      buildRecommendation(
        insideRestrictedArea,
        nearbyRestrictedAreas,
        boundaryDistanceKm ??
          Infinity
      );

    const data: GeoAgentData = {
      insideRestrictedArea,

      nearbyRestrictedAreas,

      boundaryDistanceKm,

      latitude:
        point?.latitude,

      longitude:
        point?.longitude,
    };

    return {
      agent: "geo",
      status: point
        ? "success"
        : "partial",

      findings,

      evidence: restrictedBoundaries.map(
        (item) => ({
          id: `geo-evidence-${item.boundary.id}`,
          type: "geospatial",
          title: item.boundary.name,
          source:
            "Configured geospatial boundary dataset",
          summary: item.inside
            ? "Current position is inside this configured boundary."
            : `Boundary is approximately ${item.distanceKm.toFixed(
                1
              )} km from the current position.`,
          data: {
            boundaryId:
              item.boundary.id,
            boundaryType:
              item.boundary.type,
            distanceKm:
              item.distanceKm,
            inside:
              item.inside,
            description:
              item.boundary.description,
          },
        })
      ),

      data,

      confidence: point ? 0.95 : 0.4,

      nextAgents: [
        "risk",
        "evidence",
      ],

      warnings: point
        ? undefined
        : [
            "Precise coordinates were not available; boundary proximity could not be fully evaluated.",
          ],

    };
  } catch (error) {
    return {
      agent: "geo",
      status: "failed",
      findings: [],
      evidence: [],
      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Geospatial analysis failed.",
    };
  }
}

export default runGeoAgent;