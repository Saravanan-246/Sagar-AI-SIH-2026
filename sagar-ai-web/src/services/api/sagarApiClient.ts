import axios from "axios";

import type {
  AgentEvidence,
  AgentResponse,
  MarineDataAgentData,
  WeatherAgentData,
  OceanAgentData,
  RiskAgentData,
  VisualizationSpec,
} from "../agents/agentTypes";

import type { Alert } from "../../types/alert";
import type { MarineArea } from "../../types/marine";
import type { RoutePlan } from "../../types/route";
import type { Scenario, ScenarioResult } from "../../types/scenario";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:4000";

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
});

export interface ChatHistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export interface ChatRequestOptions {
  language?: string;
  areaId?: string;
  areaName?: string;
  latitude?: number;
  longitude?: number;
  history?: ChatHistoryTurn[];
}

export interface RankedFishingZone {
  id: string;
  name: string;
  region?: string;
  suitability?: string;
  chlorophyllMgM3?: number;
  seaSurfaceTemperatureC?: number;
  fishSpecies?: string[];
  score: number;
  recommendation: "PREFER" | "MONITOR" | "AVOID";
  reasons: string[];
  nearestRestriction?: {
    boundaryName: string;
    distanceKm: number;
    inside: boolean;
  };
}

export interface WhatIfComparison {
  question: string;
  before: { riskScore: number; riskLevel: string };
  after: {
    riskScore: number;
    riskLevel: string;
    operability: string;
  };
  impact: string;
  recommendation: string;
}

export interface DataStatus {
  mode: "prototype";
  note: string;
  localSources: string[];
  plannedLiveSources: Array<{ name: string; provider: string }>;
}

/**
 * What a clarification answer is still missing, so the chat can offer
 * the matching action inline instead of sending the user to settings.
 * Mirrors the backend's ChatClarificationNeed.
 */
export interface ChatClarificationNeed {
  kind: "location" | "location_out_of_coverage" | "route_endpoints";
  missing: Array<"location" | "origin" | "destination">;
}

/** Structured response shape returned by POST/GET /api/chat. */
export interface SagarChatResponse {
  requestId: string;
  status: string;
  intent: string;
  language: string;

  answer: string;
  situation?: string;
  recommendation?: string;

  riskLevel?: string;
  riskScore?: number;
  keyFactors?: string[];

  evidence?: AgentEvidence[];
  dataSources?: string[];

  affectedArea?: { id: string; name: string; region?: string } | null;

  route?: RoutePlan | null;
  zones?: RankedFishingZone[];
  alerts?: Alert[];

  visualizations?: VisualizationSpec[];

  whatIf?: WhatIfComparison;

  timestamp: string;
  dataStatus: DataStatus;

  warnings?: string[];

  /** Present only on clarification responses. */
  needs?: ChatClarificationNeed;
}

export async function askSagarBackend(
  message: string,
  options: ChatRequestOptions = {}
): Promise<SagarChatResponse> {
  const { data } = await apiClient.post<SagarChatResponse>("/api/chat", {
    message,
    language: options.language,
    areaId: options.areaId,
    areaName: options.areaName,
    latitude: options.latitude,
    longitude: options.longitude,
    history: options.history,
  });

  return data;
}

export async function fetchMarineAreas(): Promise<MarineArea[]> {
  const { data } = await apiClient.get<{ areas: MarineArea[] }>(
    "/api/marine"
  );

  return data.areas;
}

export async function fetchMarineArea(
  options: ChatRequestOptions
): Promise<AgentResponse<MarineDataAgentData>> {
  const { data } = await apiClient.get<AgentResponse<MarineDataAgentData>>(
    "/api/marine",
    { params: options }
  );

  return data;
}

export async function fetchWeather(
  options: ChatRequestOptions = {}
): Promise<AgentResponse<WeatherAgentData>> {
  const { data } = await apiClient.get<AgentResponse<WeatherAgentData>>(
    "/api/weather",
    { params: options }
  );

  return data;
}

export async function fetchOcean(
  options: ChatRequestOptions = {}
): Promise<AgentResponse<OceanAgentData>> {
  const { data } = await apiClient.get<AgentResponse<OceanAgentData>>(
    "/api/ocean",
    { params: options }
  );

  return data;
}

export interface AlertsQuery {
  areaName?: string;
  type?: string;
  severity?: string;
}

export async function fetchAlerts(
  query: AlertsQuery = {}
): Promise<Alert[]> {
  const { data } = await apiClient.get<{ alerts: Alert[] }>("/api/alerts", {
    params: query,
  });

  return data.alerts;
}

export interface FishingZone {
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

export async function fetchFishingZones(query: {
  query?: string;
  suitability?: string;
} = {}): Promise<FishingZone[]> {
  const { data } = await apiClient.get<{ zones: FishingZone[] }>(
    "/api/zones",
    { params: query }
  );

  return data.zones;
}

export async function fetchRoutes(): Promise<RoutePlan[]> {
  const { data } = await apiClient.get<{ routes: RoutePlan[] }>(
    "/api/routes"
  );

  return data.routes;
}

export async function fetchRouteById(
  id: string
): Promise<RoutePlan | null> {
  const { data } = await apiClient.get<{ route: RoutePlan | null }>(
    "/api/routes",
    { params: { id } }
  );

  return data.route;
}

export async function calculateRouteRemote(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number }
): Promise<RoutePlan> {
  const { data } = await apiClient.get<{ route: RoutePlan }>("/api/routes", {
    params: {
      originLat: origin.latitude,
      originLng: origin.longitude,
      destinationLat: destination.latitude,
      destinationLng: destination.longitude,
    },
  });

  return data.route;
}

export async function calculateRouteOptionsRemote(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
  maxOptions = 3
): Promise<RoutePlan[]> {
  const { data } = await apiClient.get<{ routes: RoutePlan[] }>(
    "/api/routes",
    {
      params: {
        originLat: origin.latitude,
        originLng: origin.longitude,
        destinationLat: destination.latitude,
        destinationLng: destination.longitude,
        maxOptions,
      },
    }
  );

  return data.routes;
}

export async function fetchRisk(
  options: ChatRequestOptions & {
    latitude?: number;
    longitude?: number;
  } = {}
): Promise<AgentResponse<RiskAgentData>> {
  const { data } = await apiClient.get<{
    risk: AgentResponse<RiskAgentData>;
  }>("/api/risk", { params: options });

  return data.risk;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const { data } = await apiClient.get<{ scenarios: Scenario[] }>(
    "/api/scenarios"
  );

  return data.scenarios;
}

export async function runScenarioRemote(
  scenarioId: string,
  inputs: Record<string, unknown> = {}
): Promise<ScenarioResult> {
  const { data } = await apiClient.post<{ result: ScenarioResult }>(
    "/api/scenarios",
    { scenarioId, inputs }
  );

  return data.result;
}

export default apiClient;
