import type {
  AgentEvidence,
  AgentPipelineResult,
  VisualizationSpec,
} from "../services/agents/agentTypes";

import { getAlerts } from "../services/alerts/alertService";
import { getRecommendedRoutes } from "../services/routes/routeService";
import { rankFishingZones } from "../services/ocean/zoneRanking";
import { getAllSources } from "../services/data/sourceRegistry";
import { computeConfidence } from "../services/data/confidenceEngine";
import { describeAge } from "../services/data/freshnessEngine";
import { resolveArea } from "./shared";

import type { ConfidenceAssessment, FreshnessStatus } from "../services/data/dataContract";

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

/** A real external reading attached to this response as supplementary
 * evidence (see oceanAgent.ts + incoisAdapter.ts) - additive metadata
 * only, never an input to the risk/route/zone decision itself. */
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

export interface DataStatus {
  mode: "prototype";
  note: string;
  localSources: string[];
  plannedLiveSources: Array<{ name: string; provider: string }>;
  /** Present only when a real external source actually returned data
   * for this response - absent, never an empty array, when none did. */
  verifiedSources?: VerifiedSourceStatus[];
  confidence: ConfidenceAssessment;
}

/**
 * What a clarification response is still missing, so the client can
 * offer the matching action (use my location / choose an area) inline
 * instead of making the user find app settings. Purely additive - it
 * never replaces the human-readable `answer`.
 */
export interface ChatClarificationNeed {
  kind: "location" | "location_out_of_coverage" | "route_endpoints";
  missing: Array<"location" | "origin" | "destination">;
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

  /** Present only on clarification responses - see ChatClarificationNeed. */
  needs?: ChatClarificationNeed;
}

interface DataStatusBase {
  mode: "prototype";
  note: string;
  localSources: string[];
  plannedLiveSources: Array<{ name: string; provider: string }>;
}

let cachedBase: DataStatusBase | null = null;

function getDataStatusBase(): DataStatusBase {
  if (cachedBase) {
    return cachedBase;
  }

  const sources = getAllSources();

  cachedBase = {
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

  return cachedBase;
}

/**
 * Builds this response's data-status block: the cached static base
 * (which local datasets exist, which live sources are planned but not
 * connected) plus a per-response layer describing any real verified
 * evidence this specific turn actually obtained, and an honest
 * confidence assessment. `evidence` is the pipeline's own evidence
 * list - never re-fetched or duplicated here, only read.
 */
export function buildDataStatus(
  evidence: AgentEvidence[] = []
): DataStatus {
  const base = getDataStatusBase();

  const verified = evidence.filter(
    (item) => item.data?.verified === true
  );

  const verifiedSources: VerifiedSourceStatus[] = verified
    .filter((item): item is AgentEvidence & { timestamp: string } =>
      typeof item.timestamp === "string"
    )
    .map((item) => {
      const data = item.data as Record<string, unknown>;

      return {
        name: item.source ?? item.title,
        parameter: item.title,
        observedAt: item.timestamp,
        age: describeAge(item.timestamp),
        fetchedAt:
          typeof data.fetchedAt === "string"
            ? data.fetchedAt
            : new Date().toISOString(),
        freshness: (data.freshness as FreshnessStatus) ?? "UNAVAILABLE",
        distanceFromAreaKm:
          typeof data.distanceFromAreaKm === "number"
            ? data.distanceFromAreaKm
            : undefined,
        note: item.summary,
      };
    });

  const primaryVerified = verifiedSources[0];

  const confidence = computeConfidence({
    coreIsPrototype: true,
    verifiedFreshness: primaryVerified?.freshness,
    verifiedFarFromArea:
      typeof primaryVerified?.distanceFromAreaKm === "number"
        ? primaryVerified.distanceFromAreaKm > 25
        : undefined,
  });

  return {
    ...base,
    verifiedSources: verifiedSources.length > 0 ? verifiedSources : undefined,
    confidence,
  };
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
  options: {
    areaId?: string;
    areaName?: string;
    latitude?: number;
    longitude?: number;
  }
): MarineArea | undefined {
  if (
    options.areaId ||
    options.areaName ||
    (typeof options.latitude === "number" &&
      typeof options.longitude === "number")
  ) {
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

export interface ShapeChatResponseExtras {
  whatIf?: WhatIfComparison;
  /** Additional intents mentioned in the same message (multi-intent support). */
  secondaryIntents?: string[];
  /** A route already resolved deterministically (e.g. an explicit "from X to Y" request). */
  resolvedRoute?: RoutePlan | null;
}

export function shapeChatResponse(
  pipeline: AgentPipelineResult,
  options: {
    areaId?: string;
    areaName?: string;
    latitude?: number;
    longitude?: number;
  },
  extras: ShapeChatResponseExtras = {}
): StructuredSagarResponse {
  const { whatIf, secondaryIntents = [], resolvedRoute } = extras;

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
    dataStatus: buildDataStatus(pipeline.evidence),

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

  const applyIntentEnrichment = (intent: string) => {
    switch (intent) {
      case "route": {
        if (!response.route) {
          response.route = getRecommendedRoutes()[0] ?? null;
        }
        break;
      }

      case "pfz": {
        if (!response.zones) {
          response.zones = rankFishingZones({
            query: area?.name ?? area?.region,
          }).slice(0, 6);
        }
        break;
      }

      case "alerts":
      case "safety": {
        if (!response.alerts) {
          response.alerts = getAlerts();
        }
        break;
      }

      default:
        break;
    }
  };

  applyIntentEnrichment(pipeline.intent);

  for (const intent of secondaryIntents) {
    applyIntentEnrichment(intent);
  }

  if (resolvedRoute !== undefined) {
    response.route = resolvedRoute;
  }

  if (whatIf) {
    response.whatIf = whatIf;
  }

  return response;
}

export default shapeChatResponse;
