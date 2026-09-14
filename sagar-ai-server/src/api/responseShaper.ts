import type {
  AgentEvidence,
  AgentPipelineResult,
  VisualizationSpec,
} from "../services/agents/agentTypes";

import { getAlerts } from "../services/alerts/alertService";
import { getRecommendedRoutes } from "../services/routes/routeService";
import { rankFishingZones } from "../services/ocean/zoneRanking";
import { getAllSources } from "../services/data/sourceRegistry";
import { resolveArea } from "./shared";

import type { Alert } from "../types/alert";
import type { MarineArea } from "../types/marine";
import type { RoutePlan } from "../types/route";
import type { RankedFishingZone } from "../services/ocean/zoneRanking";

export interface WhatIfComparison {
  question: string;
  before: {
    riskScore: number;
    riskLevel: string;
  };
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

export interface StructuredSagarResponse {
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

  affectedArea?: {
    id: string;
    name: string;
    region?: string;
  } | null;

  route?: RoutePlan | null;
  zones?: RankedFishingZone[];
  alerts?: Alert[];

  visualizations?: VisualizationSpec[];

  whatIf?: WhatIfComparison;

  timestamp: string;
  dataStatus: DataStatus;

  warnings?: string[];
}

let cachedDataStatus: DataStatus | null = null;

function buildDataStatus(): DataStatus {
  if (cachedDataStatus) {
    return cachedDataStatus;
  }

  const sources = getAllSources();

  cachedDataStatus = {
    mode: "prototype",
    note:
      "This response is generated from local prototype/demo datasets, not a live government feed.",
    localSources: sources
      .filter((source) => source.status === "available")
      .map((source) => source.name),
    plannedLiveSources: sources
      .filter((source) => source.status === "planned")
      .map((source) => ({
        name: source.name,
        provider: source.provider,
      })),
  };

  return cachedDataStatus;
}

function findRiskFinding(pipeline: AgentPipelineResult) {
  return pipeline.findings.find(
    (finding) =>
      finding.agent === "risk" &&
      finding.data &&
      typeof (finding.data as Record<string, unknown>).riskScore ===
        "number" &&
      Array.isArray(
        (finding.data as Record<string, unknown>).keyFactors
      )
  );
}

function resolveAffectedArea(
  pipeline: AgentPipelineResult,
  options: { areaId?: string; areaName?: string }
): MarineArea | undefined {
  if (options.areaId || options.areaName) {
    return resolveArea(options);
  }

  if (pipeline.context?.areaId || pipeline.context?.areaName) {
    return resolveArea({
      areaId: pipeline.context.areaId,
      areaName: pipeline.context.areaName,
    });
  }

  return undefined;
}

export function shapeChatResponse(
  pipeline: AgentPipelineResult,
  options: { areaId?: string; areaName?: string },
  whatIf?: WhatIfComparison
): StructuredSagarResponse {
  const riskFinding = findRiskFinding(pipeline);
  const riskData = riskFinding?.data as
    | { riskScore: number; riskLevel: string; keyFactors: string[] }
    | undefined;

  const dataSources = Array.from(
    new Set(
      pipeline.evidence
        .map((item) => item.source)
        .filter((source): source is string => Boolean(source))
    )
  );

  const area = resolveAffectedArea(pipeline, options);

  const response: StructuredSagarResponse = {
    requestId: pipeline.requestId,
    status: pipeline.status,
    intent: pipeline.intent,
    language: pipeline.language,

    answer:
      pipeline.finalResponse ??
      pipeline.finalRecommendation ??
      "Sagar could not generate a response for this request.",

    situation: pipeline.situation,
    recommendation: pipeline.finalRecommendation,

    timestamp: new Date().toISOString(),
    dataStatus: buildDataStatus(),

    warnings: pipeline.warnings,
  };

  if (riskData) {
    response.riskLevel = riskData.riskLevel;
    response.riskScore = riskData.riskScore;
    response.keyFactors = riskData.keyFactors;
  }

  if (pipeline.evidence.length > 0) {
    response.evidence = pipeline.evidence;
    response.dataSources = dataSources;
  }

  if (area) {
    response.affectedArea = {
      id: area.id,
      name: area.name,
      region: area.region,
    };
  }

  if (pipeline.visualizations.length > 0) {
    response.visualizations = pipeline.visualizations;
  }

  switch (pipeline.intent) {
    case "route": {
      const routes = getRecommendedRoutes();
      response.route = routes[0] ?? null;
      break;
    }

    case "pfz": {
      response.zones = rankFishingZones({
        query: area?.name ?? area?.region,
      }).slice(0, 6);
      break;
    }

    case "alerts":
    case "safety": {
      response.alerts = getAlerts();
      break;
    }

    default:
      break;
  }

  if (whatIf) {
    response.whatIf = whatIf;
  }

  return response;
}

export default shapeChatResponse;
