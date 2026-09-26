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

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL as
  | string
  | undefined;

/*
 * A production build must never silently talk to http://localhost:4000 -
 * that's only ever reachable from the machine that built/served the
 * bundle, never from a real user's browser, so a missing config would
 * otherwise fail in a confusing, hard-to-diagnose way (every request
 * quietly rejected) instead of a clear one. Development keeps the
 * localhost fallback (the committed .env already sets
 * VITE_API_BASE_URL explicitly, so this only matters as a safety net
 * when running outside that setup, e.g. `vite dev` with no .env file).
 */
if (import.meta.env.PROD && !configuredApiBaseUrl) {
  throw new Error(
    "Sagar AI configuration error: VITE_API_BASE_URL is not set for this production build. " +
      "Refusing to fall back to http://localhost:4000, which is not reachable from a deployed app. " +
      "Set VITE_API_BASE_URL to the deployed backend's URL and rebuild."
  );
}

/*
 * Dev fallback follows whatever host served the page, swapping the port
 * to 4000: desktop at localhost:5174 -> localhost:4000, a phone on the
 * LAN at 192.168.1.39:5174 -> 192.168.1.39:4000. A hardcoded localhost
 * would point the phone at itself.
 */
const API_BASE_URL =
  configuredApiBaseUrl ??
  (typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:4000`
    : "http://localhost:4000");

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

export type FreshnessStatus =
  | "LIVE"
  | "RECENT"
  | "AGING"
  | "STALE"
  | "OFFLINE"
  | "UNAVAILABLE"
  | "PROTOTYPE";

export interface VerifiedSourceStatus {
  name: string;
  parameter: string;
  observedAt: string;
  age: string;
  fetchedAt: string;
  freshness: FreshnessStatus;
  distanceFromAreaKm?: number;
  note?: string;
}

export interface ConfidenceAssessment {
  level: "HIGH" | "MEDIUM" | "LOW";
  explanation: string;
}

export interface DataStatus {
  mode: "prototype";
  note: string;
  localSources: string[];
  /** External sources with a genuinely working adapter (e.g. INCOIS's
   * public ERDDAP server) - distinct from plannedLiveSources, which are
   * not connected at all yet. */
  connectedExternalSources: Array<{ name: string; provider: string }>;
  plannedLiveSources: Array<{ name: string; provider: string }>;
  /** Present only when a real external source actually returned data
   * for this response. */
  verifiedSources?: VerifiedSourceStatus[];
  confidence: ConfidenceAssessment;
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

/*
 * A single /api/chat call can make up to two sequential local-LLM
 * calls server-side (intent classification, then narration of the
 * verified facts). The backend caps them together at a 20 s LLM budget
 * (LLM_BUDGET_MS in chat.routes.ts), plus at most 5 s waiting on the
 * marine model - longer than the shared client's default 15 s. Without
 * a longer timeout here, a real (if slow) answer gets aborted
 * client-side and silently replaced by the offline fallback responder,
 * which has no structured marine data at all. 30 s sits just above the
 * backend's bound, so a server that never answers still releases the
 * UI instead of leaving it on the thinking state for a minute. It never
 * makes a fast answer wait longer.
 */
const CHAT_TIMEOUT_MS = 30000;

export async function askSagarBackend(
  message: string,
  options: ChatRequestOptions = {}
): Promise<SagarChatResponse> {
  const { data } = await apiClient.post<SagarChatResponse>(
    "/api/chat",
    {
      message,
      language: options.language,
      areaId: options.areaId,
      areaName: options.areaName,
      latitude: options.latitude,
      longitude: options.longitude,
      history: options.history,
    },
    { timeout: CHAT_TIMEOUT_MS }
  );

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

/**
 * Open-Meteo-sourced marine model grid (waves/current/SST/tide/wind)
 * for the map's optional layers - see marineModel.routes.ts /
 * openMeteoAdapter.ts on the backend. Deliberately a distinct shape
 * from SagarChatResponse's DataStatus: this is forecast/model data,
 * never labelled live/observed, and never fed into risk/route/zone
 * scoring.
 */
export interface MarineModelGridPoint {
  latitude: number;
  longitude: number;

  waveHeight?: number;
  waveDirection?: number;
  wavePeriod?: number;
  windWaveHeight?: number;
  swellHeight?: number;
  swellDirection?: number;
  swellPeriod?: number;

  currentVelocity?: number;
  currentDirection?: number;

  seaSurfaceTemperature?: number;
  seaLevelHeight?: number;

  windSpeed?: number;
  windDirection?: number;

  provider: "Open-Meteo";
  model: string;

  generatedAt?: string;
  fetchedAt: string;

  freshness: FreshnessStatus;
  confidence: ConfidenceAssessment;
}

export interface MarineModelGridResponse {
  status: "success" | "empty" | "failed";
  provider: "Open-Meteo";
  points: MarineModelGridPoint[];
  bounds: {
    minLatitude: number;
    maxLatitude: number;
    minLongitude: number;
    maxLongitude: number;
  };
  generatedAt: string | null;
  fetchedAt: string;
  cacheTtlMs: number;
  attribution: string;
  message?: string;
}

export async function fetchMarineModelGrid(
  options: { signal?: AbortSignal; timeoutMs?: number } = {}
): Promise<MarineModelGridResponse> {
  const { data } = await apiClient.get<MarineModelGridResponse>(
    "/api/marine-model/grid",
    { signal: options.signal, timeout: options.timeoutMs }
  );

  return data;
}

export interface FeatureContribution {
  feature: string;
  value: number;
  unit: string;
  contribution: number;
  direction: "positive" | "negative" | "neutral";
  rank: number;
}

export interface SplitMetrics {
  mae: number;
  rmse: number;
  r2: number;
}

export interface PermutationImportanceEntry {
  feature: string;
  label: string;
  importance: number;
  rank: number;
}

export interface SstModelInfo {
  algorithm: string;
  trainedAt: string;
  latitude: number;
  longitude: number;
  horizonHours: number;
  featureNames: readonly string[];
  dataWindow: { start: string; end: string };
  trainingPeriod: { start: string; end: string; rows: number };
  validationPeriod: { start: string; end: string; rows: number };
  testPeriod: { start: string; end: string; rows: number };
  metrics: { train: SplitMetrics; validation: SplitMetrics; test: SplitMetrics };
  baseline: { description: string; test: SplitMetrics };
  validated: boolean;
  validationLabel: "MODEL VALIDATED" | "MODEL NOT VALIDATED";
  validationReason: string;
  permutationImportance: PermutationImportanceEntry[];
  validationResidualStdDev: number;
  diagnostics: {
    totalHourlyRowsFetched: number;
    droppedMissingTarget: number;
    droppedMissingFeature: number;
    usableRows: number;
  };
}

export interface SstDataReadiness {
  status: "insufficient";
  latitude: number;
  longitude: number;
  historicalWindow: { start: string; end: string };
  totalHourlyRowsFetched: number;
  usableRows: number;
  minimumRequiredRows: number;
  reason: string;
}

export interface SstPredictionSuccess {
  status: "success";
  location: { latitude: number; longitude: number };
  currentSst: number;
  sstObservedAt: string;
  sstFetchedAt: string;
  predictedSst: number;
  predictionHorizon: string;
  predictionGeneratedAt: string;
  uncertainty: null | { lower: number; upper: number; method: string };
  featureContributions: FeatureContribution[];
  contributionMethod: string;
  modelInfo: SstModelInfo;
  limitations: string[];
  sourceMetadata: {
    weatherProvider: string;
    weatherDataset: string;
    weatherType: string;
    marineProvider: string;
    marineDataset: string;
    marineType: string;
    attribution: string;
  };
}

export type SstPredictionResult =
  | SstPredictionSuccess
  | { status: "insufficient_data"; data: SstDataReadiness };

export async function fetchSstPrediction(
  latitude: number,
  longitude: number
): Promise<SstPredictionResult> {
  const { data } = await apiClient.get<SstPredictionResult>(
    `/api/research/sst/predict?latitude=${latitude}&longitude=${longitude}`
  );
  return data;
}

/* ------------------------------------------------------------------ */
/* Versioned marine decisions (/api/decisions)                         */
/* ------------------------------------------------------------------ */

export interface DecisionConstraints {
  maxWaveHeightM: number;
  maxWindKnots: number;
}

export interface DecisionCellDependency {
  cellId: string;
  latitude: number;
  longitude: number;
  segments: number[];
  boundWaveHeightM?: number;
  boundWindSpeedKnots?: number;
}

export interface DecisionViolation {
  cellId: string;
  segments: number[];
  constraint: "max-wave-height" | "max-wind" | "data-available";
  field: "waveHeightM" | "windSpeedKnots";
  limit?: number;
  value?: number;
  previousValue?: number;
  message: string;
}

export interface DecisionCellChange {
  cellId: string;
  latitude: number;
  longitude: number;
  field: "waveHeightM" | "windSpeedKnots";
  previousValue?: number;
  newValue?: number;
}

export type DecisionRepair =
  | {
      type: "alternative-route";
      route: RoutePlan;
      distanceDeltaKm: number;
      durationDeltaHours: number;
      rule: string;
    }
  | { type: "hold"; rule: string };

export interface DecisionInvalidation {
  cycleId: string;
  detectedAt: string;
  changes: DecisionCellChange[];
  violations: DecisionViolation[];
  repair: DecisionRepair;
}

export interface DecisionVersion {
  version: number;
  createdAt: string;
  routeId: string;
  routeName: string;
  route: RoutePlan;
  constraints: DecisionConstraints;
  dependencies: DecisionCellDependency[];
  uncoveredSegments: number[];
  boundToCycleId: string;
  reason: string;
  hold?: boolean;
}

export interface DecisionAuditEvent {
  at: string;
  type:
    | "committed"
    | "skipped"
    | "revalidated"
    | "invalidated"
    | "repair-accepted"
    | "repair-declined"
    | "renamed";
  cycleId?: string;
  version: number;
  summary: string;
}

export interface MarineDecision {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  state: "valid" | "invalidated" | "active-with-warning";
  activeVersion: number;
  versions: DecisionVersion[];
  pending?: DecisionInvalidation;
  warning?: DecisionInvalidation;
  history: DecisionAuditEvent[];
}

export type DecisionCycleOutcome = {
  decisionId: string;
  name: string;
  version: number;
  result: "skipped" | "revalidated" | "invalidated";
  reason?: string;
  changedDependencies?: DecisionCellChange[];
  violations?: DecisionViolation[];
};

export interface DecisionCycleReport {
  cycleId: string;
  source: "live-model" | "replay";
  label: string;
  at: string;
  changedCells: DecisionCellChange[];
  outcomes: DecisionCycleOutcome[];
}

export interface DecisionState {
  decisions: MarineDecision[];
  snapshot: {
    cycleId: string;
    source: "live-model" | "replay";
    label: string;
    validAt?: string;
    createdAt: string;
    cellCount: number;
  };
  lastReport: DecisionCycleReport | null;
  replayCycles: { id: string; label: string; description: string }[];
}

export async function fetchDecisionState(): Promise<DecisionState> {
  const { data } = await apiClient.get<DecisionState>("/api/decisions");
  return data;
}

export async function commitDecisionRemote(
  input: { routeId: string; name?: string } & Partial<DecisionConstraints>
): Promise<MarineDecision> {
  const { data } = await apiClient.post<{ decision: MarineDecision }>(
    "/api/decisions",
    input
  );
  return data.decision;
}

export async function runDecisionCycle(
  input: { mode: "live" } | { mode: "replay"; replayId: string }
): Promise<DecisionCycleReport> {
  const { data } = await apiClient.post<{ report: DecisionCycleReport }>(
    "/api/decisions/cycle",
    input
  );
  return data.report;
}

export async function resolveDecisionRepair(
  id: string,
  action: "accept" | "decline"
): Promise<MarineDecision> {
  const { data } = await apiClient.post<{ decision: MarineDecision }>(
    `/api/decisions/${encodeURIComponent(id)}/${action}`
  );
  return data.decision;
}

export async function renameDecisionRemote(
  id: string,
  name: string
): Promise<MarineDecision> {
  const { data } = await apiClient.patch<{ decision: MarineDecision }>(
    `/api/decisions/${encodeURIComponent(id)}`,
    { name }
  );
  return data.decision;
}

export async function deleteDecisionRemote(id: string): Promise<void> {
  await apiClient.delete(`/api/decisions/${encodeURIComponent(id)}`);
}

export async function resetDecisionsRemote(): Promise<DecisionState> {
  const { data } = await apiClient.post<DecisionState>("/api/decisions/reset");
  return data;
}

export default apiClient;
