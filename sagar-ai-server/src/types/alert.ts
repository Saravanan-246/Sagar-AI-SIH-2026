export type AlertSeverity =
  | "low"
  | "moderate"
  | "high"
  | "critical";

export type AlertType =
  | "cyclone"
  | "lightning"
  | "high_waves"
  | "strong_wind"
  | "restricted_area"
  | "visibility"
  | "rough_sea"
  | "rapid_weather_change"
  | "general";

export type AlertStatus =
  | "active"
  | "upcoming"
  | "expired"
  | "resolved";

export interface AlertLocation {
  name: string;
  latitude: number;
  longitude: number;
  radiusKm?: number;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  status: AlertStatus;

  title: string;
  summary: string;
  description: string;

  source: string;

  location: AlertLocation;

  issuedAt: string;
  validFrom?: string;
  validUntil: string;

  recommendation: string;

  affectedAreaIds?: string[];

  metadata?: Record<string, unknown>;
}

export interface AlertFilter {
  severity?: AlertSeverity;
  type?: AlertType;
  status?: AlertStatus;
  areaId?: string;
  search?: string;
}