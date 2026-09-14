import type {
  VisualizationSpec,
} from "../services/agents/agentTypes";

export type VisualizationType =
  | "text"
  | "map"
  | "chart"
  | "route"
  | "risk"
  | "alert"
  | "table";

export interface VisualizationDataPoint {
  label: string;

  value: number;

  unit?: string;

  metadata?: Record<
    string,
    unknown
  >;
}

export interface ChartVisualizationData {
  chartType:
    | "line"
    | "bar"
    | "area"
    | "productivity"
    | "comparison";

  xLabel?: string;

  yLabel?: string;

  unit?: string;

  data: VisualizationDataPoint[];

  metadata?: Record<
    string,
    unknown
  >;
}

export interface MapVisualizationData {
  center?: {
    latitude: number;
    longitude: number;
  };

  zoom?: number;

  markers?: Array<{
    id: string;

    latitude: number;
    longitude: number;

    title: string;

    description?: string;

    severity?:
      | "info"
      | "low"
      | "moderate"
      | "high"
      | "critical";
  }>;

  polygons?: Array<{
    id: string;

    name: string;

    coordinates: Array<{
      latitude: number;
      longitude: number;
    }>;

    type?: string;
  }>;

  routes?: Array<{
    id: string;

    coordinates: Array<{
      latitude: number;
      longitude: number;
    }>;

    riskScore?: number;
  }>;
}

export interface RiskVisualizationData {
  riskScore: number;

  riskLevel:
    | "low"
    | "moderate"
    | "high"
    | "critical";

  recommendation?: string;

  factors?: Array<{
    name: string;

    score: number;

    impact:
      | "positive"
      | "neutral"
      | "negative";
  }>;
}

export interface AlertVisualizationData {
  alerts: Array<{
    id: string;

    title: string;

    severity:
      | "low"
      | "moderate"
      | "high"
      | "critical";

    message?: string;

    validUntil?: string;
  }>;
}

export interface RouteVisualizationData {
  routes: Array<{
    id: string;

    name: string;

    distanceKm: number;

    durationHours: number;

    riskScore: number;

    status: string;
  }>;

  selectedRouteId?: string;
}

export interface VisualizationOutput
  extends VisualizationSpec {
  type: VisualizationType;

  data?: Record<
    string,
    unknown
  >;

  component?: string;

  required?: boolean;
}

export interface VisualizationPlan {
  visualizations: VisualizationOutput[];

  primary?: VisualizationOutput;

  reason: string;

  confidence: number;
}

export interface VisualizationContext {
  intent: string;

  areaId?: string;

  areaName?: string;

  findings?: unknown[];

  evidence?: unknown[];

  metadata?: Record<
    string,
    unknown
  >;
}