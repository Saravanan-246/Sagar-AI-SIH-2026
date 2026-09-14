export type ScenarioType =
  | "weather_change"
  | "hazard_activation"
  | "departure_time"
  | "productivity_change"
  | "geofence"
  | "route_change"
  | "generic";

export type ScenarioRiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical";

export type ScenarioOperability =
  | "proceed"
  | "caution"
  | "avoid"
  | "blocked";

export interface ScenarioInput {
  areaId?: string;
  routeId?: string;

  windSpeedKnots?: number;
  waveHeightM?: number;

  lightning?: boolean;
  cyclone?: boolean;
  roughSea?: boolean;

  departureTime?: string;

  productivityChangePercent?: number;

  latitude?: number;
  longitude?: number;

  vesselType?: string;

  parameters?: Record<string, unknown>;
}

export interface ScenarioFactor {
  label: string;
  value?: string | number | boolean;
  impact:
    | "positive"
    | "neutral"
    | "negative";
  explanation?: string;
}

export type Scenario = ScenarioDefinition;

export interface ScenarioDefinition {
  id: string;

  name: string;
  description?: string;

  type: ScenarioType;

  areaId?: string;

  inputs?: Record<string, unknown>;
  modifiers?: Record<string, number>;

  result?: {
    riskLevel?: ScenarioRiskLevel;
    riskScore?: number;
    operability?: ScenarioOperability;

    recommendation?: string;

    keyFactors?: string[];

    projectedProductivityIndex?: number;
  };

  metadata?: Record<string, unknown>;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;

  type?: ScenarioType;

  areaId?: string;
  routeId?: string;

  inputs: ScenarioInput;

  riskLevel: ScenarioRiskLevel;
  riskScore: number;

  operability: ScenarioOperability;

  recommendation: string;

  keyFactors: string[];

  factors?: ScenarioFactor[];

  projectedProductivityIndex?: number;

  affectedAreas?: string[];

  restrictions?: string[];

  warnings?: string[];

  evidence?: Array<{
    id: string;
    type: string;
    title: string;
    source?: string;
    summary?: string;
  }>;

  metadata?: Record<string, unknown>;
}

export interface ScenarioRunOptions {
  scenarioId?: string;

  type?: ScenarioType;

  areaId?: string;
  routeId?: string;

  inputs?: ScenarioInput;

  useCurrentMarineConditions?: boolean;
}