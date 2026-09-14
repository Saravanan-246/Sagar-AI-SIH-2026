import type {
  AgentEvidence,
  AgentFinding,
  AgentRequest,
  AgentResponse,
} from "./agentTypes";

interface EvidenceCandidate {
  evidence: AgentEvidence;
  score: number;
}

function createEvidenceId(
  agent: string,
  id: string
): string {
  return `evidence-${agent}-${id}`;
}

function scoreEvidence(
  evidence: AgentEvidence,
  request: AgentRequest
): number {
  let score = 50;

  const title = evidence.title.toLowerCase();
  const summary = (evidence.summary ?? "").toLowerCase();
  const query = request.message.toLowerCase();

  const combined = `${title} ${summary}`;

  if (
    request.area?.name &&
    combined.includes(
      request.area.name.toLowerCase()
    )
  ) {
    score += 20;
  }

  const intentKeywords: Record<
    string,
    string[]
  > = {
    marine_conditions: [
      "wind",
      "wave",
      "sea",
      "visibility",
      "condition",
    ],
    safety: [
      "risk",
      "hazard",
      "warning",
      "safety",
    ],
    alerts: [
      "alert",
      "lightning",
      "cyclone",
      "warning",
    ],
    pfz: [
      "fishing",
      "pfz",
      "fish",
      "zone",
    ],
    route: [
      "route",
      "navigation",
      "distance",
      "destination",
    ],
    productivity: [
      "productivity",
      "chlorophyll",
      "sst",
      "temperature",
    ],
    geofence: [
      "boundary",
      "restricted",
      "protected",
      "geofence",
    ],
    tide: [
      "tide",
      "high",
      "low",
      "rising",
      "falling",
    ],
    general: [],
  };

  const keywords =
    intentKeywords[request.intent] ?? [];

  for (const keyword of keywords) {
    if (combined.includes(keyword)) {
      score += 6;
    }
  }

  for (const word of query.split(/\s+/)) {
    const normalized = word
      .replace(/[^a-z0-9]/gi, "")
      .trim();

    if (
      normalized.length >= 4 &&
      combined.includes(normalized)
    ) {
      score += 2;
    }
  }

  if (evidence.source) {
    score += 10;
  }

  if (evidence.timestamp) {
    score += 5;
  }

  if (evidence.data) {
    score += 5;
  }

  return Math.min(100, score);
}

function normalizeEvidence(
  evidence: AgentEvidence,
  agent: AgentEvidence["type"]
): AgentEvidence {
  return {
    ...evidence,
    id: evidence.id
      ? evidence.id
      : createEvidenceId(
          agent,
          Math.random()
            .toString(36)
            .slice(2, 8)
        ),
  };
}

function collectAgentEvidence(
  request: AgentRequest
): AgentEvidence[] {
  const collected: AgentEvidence[] = [];

  if (request.previousEvidence) {
    collected.push(
      ...request.previousEvidence
    );
  }

  const responses =
    request.parameters?.agentResponses;

  if (
    responses &&
    typeof responses === "object"
  ) {
    for (const response of Object.values(
      responses as Record<
        string,
        {
          evidence?: AgentEvidence[];
        }
      >
    )) {
      if (
        response &&
        Array.isArray(response.evidence)
      ) {
        collected.push(
          ...response.evidence
        );
      }
    }
  }

  return collected.map((item) =>
    normalizeEvidence(
      item,
      item.type
    )
  );
}

function deduplicateEvidence(
  evidence: AgentEvidence[]
): AgentEvidence[] {
  const map = new Map<
    string,
    AgentEvidence
  >();

  for (const item of evidence) {
    const key =
      item.id ||
      `${item.type}-${item.title}-${item.source ?? ""}`;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return Array.from(map.values());
}

function buildRankedEvidence(
  request: AgentRequest,
  evidence: AgentEvidence[]
): EvidenceCandidate[] {
  return evidence
    .map((item) => ({
      evidence: item,
      score: scoreEvidence(
        item,
        request
      ),
    }))
    .sort(
      (a, b) => b.score - a.score
    );
}

function buildFindings(
  ranked: EvidenceCandidate[],
  requestId: string
): AgentFinding[] {
  if (ranked.length === 0) {
    return [];
  }

  const strongest = ranked.slice(0, 5);

  return strongest.map(
    ({ evidence, score }, index) => ({
      id: `evidence-finding-${requestId}-${index}`,
      agent: "evidence",
      title: evidence.title,
      summary:
        evidence.summary ??
        "Supporting evidence identified for the current analysis.",
      confidence: score / 100,
      severity: "info",
      data: {
        evidenceId: evidence.id,
        type: evidence.type,
        source: evidence.source,
        timestamp: evidence.timestamp,
        relevanceScore: score,
      },
    })
  );
}

function buildWarnings(
  ranked: EvidenceCandidate[]
): string[] {
  const warnings: string[] = [];

  if (ranked.length === 0) {
    warnings.push(
      "No supporting evidence was available for this request."
    );

    return warnings;
  }

  const lowConfidence = ranked.filter(
    (item) => item.score < 55
  );

  if (
    lowConfidence.length ===
    ranked.length
  ) {
    warnings.push(
      "The available evidence has limited relevance to the current request."
    );
  }

  const missingSources = ranked.filter(
    (item) => !item.evidence.source
  );

  if (
    missingSources.length > 0
  ) {
    warnings.push(
      "Some evidence records do not include an explicit source."
    );
  }

  return warnings;
}

export async function runEvidenceAgent(
  request: AgentRequest
): Promise<
  AgentResponse<{
    evidence: AgentEvidence[];
    rankedEvidence: Array<{
      evidence: AgentEvidence;
      score: number;
    }>;
  }>
> {
  try {
    const collected =
      collectAgentEvidence(request);

    const unique =
      deduplicateEvidence(
        collected
      );

    const ranked =
      buildRankedEvidence(
        request,
        unique
      );

    const topEvidence = ranked
      .slice(0, 10)
      .map(
        ({ evidence }) => evidence
      );

    const findings = buildFindings(
      ranked,
      request.requestId
    );

    const warnings =
      buildWarnings(ranked);

    const confidence =
      ranked.length === 0
        ? 0
        : ranked
            .slice(0, 5)
            .reduce(
              (total, item) =>
                total + item.score,
              0
            ) /
          Math.min(
            ranked.length,
            5
          ) /
          100;

    return {
      agent: "evidence",
      status:
        ranked.length > 0
          ? "success"
          : "partial",

      findings,

      evidence: topEvidence,

      data: {
        evidence: topEvidence,
        rankedEvidence: ranked.map(
          ({ evidence, score }) => ({
            evidence,
            score,
          })
        ),
      },

      confidence,

      nextAgents: [
        "visualization",
        "reporting",
      ],

      warnings:
        warnings.length > 0
          ? warnings
          : undefined,
    };
  } catch (error) {
    return {
      agent: "evidence",
      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Evidence aggregation failed.",
    };
  }
}

export default runEvidenceAgent;