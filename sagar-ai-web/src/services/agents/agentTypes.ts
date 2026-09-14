import type { ChatContext, ChatIntent, ChatLanguage } from "../../types/chat";
import type { MarineArea } from "../../types/marine";
import type { Alert } from "../../types/alert";
import type { RoutePlan } from "../../types/route";
import type { ScenarioResult } from "../../types/scenario";

export type AgentName =
  | "interaction"
  | "planner"
  | "marine-data"
  | "weather"
  | "ocean"
  | "geo"
  | "risk"
  | "evidence"
  | "visualization"
  | "reporting";

export type AgentStatus =
  | "idle"
  | "running"
  | "success"
  | "partial"
  | "failed"
  | "skipped";

export type FindingSeverity =
  | "info"
  | "low"
  | "moderate"
  | "high"
  | "critical";

export interface AgentFinding {
  id: string;
  agent: AgentName;

  title: string;
  summary: string;

  severity?: FindingSeverity;

  confidence?: number;

  data?: Record<string, unknown>;
}

export interface AgentEvidence {
  id: string;

  type:
    | "marine"
    | "weather"
    | "ocean"
    | "geospatial"
    | "alert"
    | "route"
    | "scenario"
    | "source";

  title: string;
  source?: string;
  timestamp?: string;

  summary?: string;

  data?: Record<string, unknown>;
}

export interface AgentRequest {
  requestId: string;

  message: string;

  language: ChatLanguage;
  intent: ChatIntent;

  context: ChatContext;

  area?: MarineArea;

  previousFindings?: AgentFinding[];

  previousEvidence?: AgentEvidence[];

  parameters?: Record<string, unknown>;
}

export interface AgentResponse<T = unknown> {
  agent: AgentName;

  status: AgentStatus;

  findings: AgentFinding[];

  evidence: AgentEvidence[];

  data?: T;

  confidence?: number;

  nextAgents?: AgentName[];

  warnings?: string[];

  error?: string;
}

export interface PlannerTask {
  id: string;

  agent: AgentName;

  description: string;

  required: boolean;

  dependsOn?: string[];
}

export interface PlannerResult {
  intent: ChatIntent;

  tasks: PlannerTask[];

  reasoning?: string;

  priority?: AgentName[];

  parallelGroups?: AgentName[][];
}

export interface MarineDataAgentData {
  area?: MarineArea;
  areas?: MarineArea[];
}

export interface WeatherAgentData {
  alerts: Alert[];

  hazards: {
    lightning: boolean;
    cyclone: boolean;
    roughSea: boolean;
    strongWind: boolean;
  };

  windSpeedKnots?: number;
  waveHeightM?: number;
  visibilityKm?: number;
}

export interface OceanAgentData {
  productivityIndex?: number;
  productivitySignal?: string;

  seaSurfaceTemperatureC?: number;
  chlorophyllMgM3?: number;

  trend?: string;
  drivers?: string[];
}

export interface GeoAgentData {
  insideRestrictedArea: boolean;
  nearbyRestrictedAreas: string[];

  boundaryDistanceKm?: number;

  latitude?: number;
  longitude?: number;
}

export interface RiskAgentData {
  riskScore: number;

  riskLevel:
    | "low"
    | "moderate"
    | "high"
    | "critical";

  recommendation: string;

  factors: AgentFinding[];
}

export interface RouteAgentData {
  routes?: RoutePlan[];
  selectedRoute?: RoutePlan;
}

export interface ScenarioAgentData {
  result?: ScenarioResult;
}

export interface VisualizationSpec {
  type:
    | "text"
    | "map"
    | "chart"
    | "route"
    | "risk"
    | "alert"
    | "table";

  title?: string;

  data?: Record<string, unknown>;

  priority?: number;
}

export interface VisualizationAgentData {
  visualizations: VisualizationSpec[];
}

export interface ReportingAgentData {
  title: string;

  summary: string;

  recommendation: string;

  findings: AgentFinding[];

  evidence: AgentEvidence[];
}

export interface InteractionAgentData {
  detectedLanguage: ChatLanguage;

  detectedIntent: ChatIntent;

  normalizedQuery: string;

  responseLanguage: ChatLanguage;
}

export interface AgentExecutionTrace {
  requestId: string;

  agent: AgentName;

  status: AgentStatus;

  startedAt: string;
  completedAt?: string;

  durationMs?: number;

  summary?: string;

  error?: string;
}

export interface AgentPipelineResult {
  requestId: string;

  status:
    | "success"
    | "partial"
    | "failed";

  intent: ChatIntent;
  language: ChatLanguage;

  findings: AgentFinding[];

  evidence: AgentEvidence[];

  visualizations: VisualizationSpec[];

  traces: AgentExecutionTrace[];

  finalRecommendation?: string;

  finalResponse?: string;

  context?: ChatContext;

  warnings?: string[];
}