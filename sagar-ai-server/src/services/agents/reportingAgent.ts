import type {
  AgentEvidence,
  AgentFinding,
  AgentRequest,
  AgentResponse,
  ReportingAgentData,
} from "./agentTypes";

interface SpecialistResponse {
  findings?: AgentFinding[];
  evidence?: AgentEvidence[];
  data?: unknown;
  status?: string;
}

function getSpecialistResponses(
  request: AgentRequest
): Record<string, SpecialistResponse> {
  const responses =
    request.parameters?.specialistResponses ??
    request.parameters?.agentResponses;

  if (
    !responses ||
    typeof responses !== "object"
  ) {
    return {};
  }

  return responses as Record<
    string,
    SpecialistResponse
  >;
}

function collectFindings(
  request: AgentRequest
): AgentFinding[] {
  const findings: AgentFinding[] = [
    ...(request.previousFindings ?? []),
  ];

  const responses =
    getSpecialistResponses(request);

  for (const response of Object.values(
    responses
  )) {
    if (Array.isArray(response.findings)) {
      findings.push(
        ...response.findings
      );
    }
  }

  const map = new Map<
    string,
    AgentFinding
  >();

  for (const finding of findings) {
    map.set(finding.id, finding);
  }

  return Array.from(map.values());
}

function collectEvidence(
  request: AgentRequest
): AgentEvidence[] {
  const evidence: AgentEvidence[] = [
    ...(request.previousEvidence ?? []),
  ];

  const responses =
    getSpecialistResponses(request);

  for (const response of Object.values(
    responses
  )) {
    if (Array.isArray(response.evidence)) {
      evidence.push(
        ...response.evidence
      );
    }
  }

  const map = new Map<
    string,
    AgentEvidence
  >();

  for (const item of evidence) {
    map.set(item.id, item);
  }

  return Array.from(map.values());
}

function highestSeverity(
  findings: AgentFinding[]
): AgentFinding["severity"] {
  const order = {
    critical: 4,
    high: 3,
    moderate: 2,
    low: 1,
    info: 0,
  };

  return findings.reduce<
    AgentFinding["severity"]
  >(
    (highest, finding) => {
      const current =
        finding.severity ?? "info";

      return order[current] >
        order[highest ?? "info"]
        ? current
        : highest;
    },
    "info"
  );
}

function selectKeyFindings(
  findings: AgentFinding[]
): AgentFinding[] {
  const severityOrder = {
    critical: 4,
    high: 3,
    moderate: 2,
    low: 1,
    info: 0,
  };

  return [...findings]
    .sort((a, b) => {
      const severityA =
        severityOrder[
          a.severity ?? "info"
        ];

      const severityB =
        severityOrder[
          b.severity ?? "info"
        ];

      if (
        severityB !== severityA
      ) {
        return severityB - severityA;
      }

      return (
        (b.confidence ?? 0) -
        (a.confidence ?? 0)
      );
    })
    .slice(0, 8);
}

function selectKeyEvidence(
  evidence: AgentEvidence[]
): AgentEvidence[] {
  return evidence.slice(0, 8);
}

function getDataValue(
  request: AgentRequest,
  agentName: string,
  key: string
): unknown {
  const responses =
    getSpecialistResponses(request);

  const response =
    responses[agentName];

  if (
    !response ||
    !response.data ||
    typeof response.data !==
      "object"
  ) {
    return undefined;
  }

  return (
    response.data as Record<
      string,
      unknown
    >
  )[key];
}

/*
 * Some intents (productivity, tide, geofence) have no dedicated "risk"
 * task in the planner. Without this, an incidentally severe finding
 * from an unrelated agent (e.g. a weather alert) could hijack the
 * situation summary / recommendation for a question that was never
 * about weather - answering "why has productivity decreased" with a
 * wind-speed reading. This resolves the finding that actually answers
 * the user's question, so it is preferred ahead of the generic
 * severity scan whenever no risk assessment exists for this request.
 */
function findPrimaryFinding(
  request: AgentRequest,
  findings: AgentFinding[]
): AgentFinding | undefined {
  switch (request.intent) {
    case "productivity":
    case "pfz":
      return findings.find(
        (finding) => finding.agent === "ocean"
      );

    case "tide":
      return (
        findings.find(
          (finding) =>
            finding.agent === "marine-data" &&
            finding.id.includes("tide")
        ) ??
        findings.find(
          (finding) => finding.agent === "marine-data"
        )
      );

    case "geofence":
      return findings.find(
        (finding) => finding.agent === "geo"
      );

    default:
      return undefined;
  }
}

function buildSituationSummary(
  request: AgentRequest,
  findings: AgentFinding[]
): string {
  const areaName =
    request.context.areaName ??
    request.area?.name;

  const riskFinding =
    findings.find(
      (finding) =>
        finding.agent === "risk" &&
        (
          finding.severity ===
            "critical" ||
          finding.severity ===
            "high" ||
          finding.severity ===
            "moderate"
        )
    );

  // A sea/wave/wind/weather question is answered with the weather
  // agent's own wave and wind findings (model values with provenance),
  // not whichever finding happens to come first - previously the SST /
  // chlorophyll line answered "how are the waves?".
  // Only the wave and wind assessments (value + what it means) - the
  // overview repeats them and alert findings belong to the risk line.
  const conditionFindings =
    request.intent === "marine_conditions"
      ? ["weather-wave-", "weather-wind-"]
          .map((prefix) =>
            findings.find(
              (finding) => finding.agent === "weather" && finding.id.startsWith(prefix)
            )
          )
          .filter((finding): finding is AgentFinding => Boolean(finding))
      : [];

  const primaryFinding = !riskFinding
    ? findPrimaryFinding(request, findings)
    : undefined;

  const hazardFinding =
    findings.find(
      (finding) =>
        finding.agent === "weather" ||
        finding.agent === "marine-data"
    );

  const location =
    areaName
      ? ` for ${areaName}`
      : "";

  // Finding summaries already end with a period; appending " for
  // <area>." after that reads as a dangling fragment ("...risk. for
  // Area."), so the trailing period is dropped first to fold the area
  // into the same closing sentence.
  const withLocation = (summary: string) =>
    `${summary.replace(/\.\s*$/, "")}${location}.`;

  if (conditionFindings.length > 0) {
    const conditions = conditionFindings
      .map((finding) => finding.summary.trim())
      .join(" ");
    // Any elevated risk still follows the conditions it comes from.
    return riskFinding
      ? `${withLocation(conditions)} ${riskFinding.summary.trim()}`
      : withLocation(conditions);
  }

  if (riskFinding) {
    return withLocation(riskFinding.summary);
  }

  if (primaryFinding) {
    return withLocation(primaryFinding.summary);
  }

  if (hazardFinding) {
    return withLocation(hazardFinding.summary);
  }

  if (findings.length > 0) {
    return withLocation(findings[0].summary);
  }

  return `Sagar analysed the available marine information${location}.`;
}

function buildRecommendation(
  request: AgentRequest,
  findings: AgentFinding[]
): string {
  const riskResponse =
    getSpecialistResponses(
      request
    ).risk;

  if (
    riskResponse?.data &&
    typeof riskResponse.data ===
      "object"
  ) {
    const recommendation =
      (
        riskResponse.data as Record<
          string,
          unknown
        >
      ).recommendation;

    if (
      typeof recommendation ===
      "string" &&
      recommendation.trim()
    ) {
      return recommendation;
    }
  }

  const hasPrimaryFinding = Boolean(
    findPrimaryFinding(request, findings)
  );

  const critical = hasPrimaryFinding
    ? undefined
    : findings.find(
        (finding) =>
          finding.severity ===
          "critical"
      );

  if (critical) {
    return critical.summary;
  }

  const highRisk = hasPrimaryFinding
    ? undefined
    : findings.find(
        (finding) =>
          finding.severity ===
          "high"
      );

  if (highRisk) {
    return highRisk.summary;
  }

  const recommendationFinding =
    findings.find(
      (finding) =>
        finding.agent === "risk"
    );

  if (recommendationFinding) {
    return recommendationFinding.summary;
  }

  switch (request.intent) {
    case "productivity":
      return "Use the productivity trend together with SST, chlorophyll and current marine conditions before selecting an operating zone.";

    case "pfz":
      return "Prefer zones with favourable productivity while checking marine hazards and geospatial restrictions before departure.";

    case "route":
      return "Choose the route with the lowest acceptable operational risk and avoid restricted or hazardous areas.";

    case "geofence":
      return "Maintain safe separation from restricted or protected boundaries and reroute before entering them.";

    case "alerts":
    case "safety":
      return "Review the active hazards and follow the recommended safety action before operating.";

    case "tide":
      return "Use the current and upcoming tidal state when planning the operation.";

    default:
      return "Use the supporting marine evidence and current operational conditions before making a decision.";
  }
}

function buildTitle(
  request: AgentRequest
): string {
  switch (request.intent) {
    case "alerts":
      return "Marine Alert Assessment";

    case "safety":
      return "Marine Safety Assessment";

    case "pfz":
      return "Fishing Zone Assessment";

    case "productivity":
      return "Ocean Productivity Analysis";

    case "route":
      return "Route Planning Assessment";

    case "geofence":
      return "Geofence Assessment";

    case "tide":
      return "Tide Assessment";

    case "marine_conditions":
      return "Marine Conditions Assessment";

    default:
      return "Sagar Marine Intelligence Report";
  }
}

/*
 * Keeps the visible chat bubble short: a situation sentence plus a
 * recommendation (when it says something new). Risk score, key factors
 * and evidence are already returned as their own structured fields
 * (riskLevel/riskScore/keyFactors/evidence on the API response) and
 * rendered as separate Risk/Why/Evidence sections in the chat UI, so
 * repeating them here as prose would just produce a duplicated wall of
 * text instead of a decision-support-grade answer.
 */
function buildHumanResponse(
  _request: AgentRequest,
  summary: string,
  recommendation: string,
  _findings: AgentFinding[],
  _evidence: AgentEvidence[]
): string {
  const trimmedSummary = summary.trim();
  const trimmedRecommendation = recommendation.trim();

  // Compare on the core text (no trailing period, case-insensitive) -
  // buildSituationSummary folds an area name onto the same sentence, so
  // an exact substring check against the untouched recommendation would
  // miss a real duplicate and print it twice.
  const normalizedSummary = trimmedSummary.toLowerCase();
  const normalizedRecommendation = trimmedRecommendation
    .replace(/\.\s*$/, "")
    .toLowerCase();

  if (
    !trimmedRecommendation ||
    (normalizedRecommendation.length > 0 &&
      normalizedSummary.includes(normalizedRecommendation))
  ) {
    return trimmedSummary;
  }

  return `${trimmedSummary} ${trimmedRecommendation}`;
}

function buildReportData(
  request: AgentRequest,
  findings: AgentFinding[],
  evidence: AgentEvidence[]
): ReportingAgentData {
  const title =
    buildTitle(request);

  const summary =
    buildSituationSummary(
      request,
      findings
    );

  const recommendation =
    buildRecommendation(
      request,
      findings
    );

  return {
    title,
    summary,
    recommendation,
    findings: selectKeyFindings(
      findings
    ),
    evidence: selectKeyEvidence(
      evidence
    ),
  };
}

export async function runReportingAgent(
  request: AgentRequest
): Promise<
  AgentResponse<ReportingAgentData & {
    response: string;
    riskLevel?: AgentFinding["severity"];
  }>
> {
  try {
    const findings =
      collectFindings(request);

    const evidence =
      collectEvidence(request);

    const report =
      buildReportData(
        request,
        findings,
        evidence
      );

    const response =
      buildHumanResponse(
        request,
        report.summary,
        report.recommendation,
        report.findings,
        report.evidence
      );

    const riskLevel =
      highestSeverity(
        findings
      );

    return {
      agent: "reporting",

      status:
        findings.length > 0 ||
        evidence.length > 0
          ? "success"
          : "partial",

      findings: [
        {
          id: `reporting-${request.requestId}`,
          agent: "reporting",

          title:
            report.title,

          summary:
            "Final explainable marine intelligence response assembled from specialist-agent findings and supporting evidence.",

          severity:
            riskLevel,

          confidence:
            findings.length > 0
              ? Math.min(
                  0.98,
                  0.75 +
                    Math.min(
                      0.2,
                      findings.length *
                        0.02
                    )
                )
              : 0.5,

          data: {
            intent:
              request.intent,

            language:
              request.language,

            findingCount:
              findings.length,

            evidenceCount:
              evidence.length,
          },
        },
      ],

      evidence:
        report.evidence,

      data: {
        ...report,
        response,
        riskLevel,
      },

      confidence:
        findings.length > 0 ||
        evidence.length > 0
          ? 0.92
          : 0.5,

      nextAgents: [],

      warnings:
        evidence.length === 0
          ? [
              "No supporting evidence was available for the final report.",
            ]
          : undefined,
    };
  } catch (error) {
    return {
      agent: "reporting",

      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Unable to assemble the final marine intelligence report.",
    };
  }
}

export default runReportingAgent;