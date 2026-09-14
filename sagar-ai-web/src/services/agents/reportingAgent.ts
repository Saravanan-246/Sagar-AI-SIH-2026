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

  if (riskFinding) {
    return `${riskFinding.summary}${location}.`;
  }

  if (hazardFinding) {
    return `${hazardFinding.summary}${location}.`;
  }

  if (findings.length > 0) {
    return `${findings[0].summary}${location}.`;
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

  const critical =
    findings.find(
      (finding) =>
        finding.severity ===
        "critical"
    );

  if (critical) {
    return critical.summary;
  }

  const highRisk =
    findings.find(
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

function buildHumanResponse(
  request: AgentRequest,
  summary: string,
  recommendation: string,
  findings: AgentFinding[],
  evidence: AgentEvidence[]
): string {
  const risk =
    highestSeverity(
      findings
    );

  const areaName =
    request.context.areaName ??
    request.area?.name;

  const lines: string[] = [];

  lines.push(summary);

  if (areaName) {
    lines.push(
      `Area: ${areaName}.`
    );
  }

  if (
    risk === "critical" ||
    risk === "high"
  ) {
    lines.push(
      `Risk level: ${
        risk === "critical"
          ? "Critical"
          : "High"
      }.`
    );
  }

  if (recommendation) {
    lines.push(
      `Recommendation: ${recommendation}`
    );
  }

  if (findings.length > 0) {
    const supportingFindings =
      findings
        .filter(
          (finding) =>
            finding.agent !==
              "reporting" &&
            finding.summary
        )
        .slice(0, 3);

    if (
      supportingFindings.length > 0
    ) {
      lines.push(
        `Key factors: ${supportingFindings
          .map(
            (finding) =>
              finding.summary
          )
          .join(" ")}`
      );
    }
  }

  if (evidence.length > 0) {
    lines.push(
      `Supporting evidence: ${evidence
        .slice(0, 3)
        .map((item) =>
          item.source
            ? `${item.title} (${item.source})`
            : item.title
        )
        .join("; ")}.`
    );
  }

  return lines.join("\n\n");
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