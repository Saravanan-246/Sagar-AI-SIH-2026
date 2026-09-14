import axios from "axios";

import type {
  AgentPipelineResult,
  AgentResponse,
  MarineDataAgentData,
  WeatherAgentData,
  OceanAgentData,
  RiskAgentData,
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

export interface ChatRequestOptions {
  language?: string;
  areaId?: string;
  areaName?: string;
}

export async function askSagarBackend(
  message: string,
  options: ChatRequestOptions = {}
): Promise<AgentPipelineResult> {
  const { data } = await apiClient.post<AgentPipelineResult>("/api/chat", {
    message,
    language: options.language,
    areaId: options.areaId,
    areaName: options.areaName,
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
