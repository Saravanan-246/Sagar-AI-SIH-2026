export type RouteStatus =
  | "recommended"
  | "caution"
  | "blocked"
  | "alternative";

export type RouteRiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical";

export interface RoutePoint {
  latitude: number;
  longitude: number;
  name?: string;
}

export interface RouteRestriction {
  id: string;
  name: string;
  type:
    | "restricted"
    | "protected"
    | "conservation"
    | "navigation"
    | "temporary_restriction";

  action:
    | "avoid"
    | "no_entry"
    | "no_fishing"
    | "caution";

  distanceFromRouteKm?: number;
  description?: string;
}

export interface RouteConditions {
  windSpeedKnots?: number;
  windDirection?: string;

  waveHeightM?: number;
  waveDirection?: string;

  seaState?: string;
  visibilityKm?: number;

  overallRisk?: RouteRiskLevel;
}

export interface RoutePlan {
  id: string;

  name: string;

  origin: RoutePoint;
  destination: RoutePoint;

  waypoints: RoutePoint[];

  status: RouteStatus;

  riskLevel: RouteRiskLevel;
  riskScore: number;

  distanceKm: number;
  durationHours: number;

  recommendedSpeedKnots: number;

  conditions?: RouteConditions;

  restrictions?: RouteRestriction[];

  recommendation: string;

  avoid?: boolean;

  blockedReason?: string;

  source?: string;

  createdAt?: string;

  metadata?: Record<string, unknown>;
}

export interface RouteCalculationInput {
  origin: RoutePoint;
  destination: RoutePoint;

  speedKnots?: number;

  vesselType?: string;

  departureTime?: string;

  avoidRestrictedAreas?: boolean;

  preferredRisk?: RouteRiskLevel;
}

export interface RouteOptions {
  maxRiskScore?: number;
  maxDistanceKm?: number;
  avoidBlocked?: boolean;
  sortBy?: "risk" | "distance" | "duration";
}