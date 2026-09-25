import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  RiskAgentData,
  RiskBasis,
} from "./agentTypes";
import type {
  MarineDecisionInputs,
  MarineDecisionValue,
} from "../marine/marineDecisionInputs";

// Every wind/wave/visibility band and factor weight in this file is a
// Sagar team-set prototype value, not an official safety limit.
const THRESHOLDS_NOTE =
  "Sagar prototype thresholds (team-set, not official safety limits)";

type RiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical";

interface WeatherData {
  alerts?: unknown[];

  hazards?: {
    lightning?: boolean;
    cyclone?: boolean;
    roughSea?: boolean;
    strongWind?: boolean;
  };

  windSpeedKnots?: number;
  waveHeightM?: number;
  visibilityKm?: number;

  marineInputs?: MarineDecisionInputs;
}

interface OceanData {
  productivityIndex?: number;
  productivitySignal?: string;

  seaSurfaceTemperatureC?: number;
  chlorophyllMgM3?: number;

  trend?: string;
}

interface GeoData {
  insideRestrictedArea?: boolean;
  nearbyRestrictedAreas?: string[];

  boundaryDistanceKm?: number;
}

interface MarineData {
  area?: {
    safety?: {
      riskScore?: number;
      overallRisk?: RiskLevel;
    };

    conditions?: {
      windSpeedKnots?: number;
      waveHeightM?: number;
      visibilityKm?: number;
    };

    hazards?: {
      lightning?: boolean;
      cyclone?: boolean;
      roughSea?: boolean;
      strongWind?: boolean;
    };
  };
}

interface RiskFactor {
  name: string;
  score: number;
  impact: "positive" | "neutral" | "negative";
  explanation: string;
}

const RISK_ORDER: Record<
  RiskLevel,
  number
> = {
  low: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

function clamp(
  value: number,
  minimum = 0,
  maximum = 100
): number {
  return Math.min(
    maximum,
    Math.max(minimum, value)
  );
}

function toRiskLevel(
  score: number
): RiskLevel {
  const normalized = clamp(score);

  if (normalized <= 30) {
    return "low";
  }

  if (normalized <= 60) {
    return "moderate";
  }

  if (normalized <= 80) {
    return "high";
  }

  return "critical";
}

function normalizeText(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getAgentData<T>(
  request: AgentRequest,
  agentName: string
): T | undefined {
  const agentResponses =
    request.parameters
      ?.agentResponses;

  if (
    !agentResponses ||
    typeof agentResponses !==
      "object"
  ) {
    return undefined;
  }

  const response =
    (
      agentResponses as Record<
        string,
        {
          data?: T;
        }
      >
    )[agentName];

  return response?.data;
}

function getMarineData(
  request: AgentRequest
): MarineData | undefined {
  return getAgentData<MarineData>(
    request,
    "marine-data"
  );
}

function getWeatherData(
  request: AgentRequest
): WeatherData | undefined {
  return getAgentData<WeatherData>(
    request,
    "weather"
  );
}

function getOceanData(
  request: AgentRequest
): OceanData | undefined {
  return getAgentData<OceanData>(
    request,
    "ocean"
  );
}

function getGeoData(
  request: AgentRequest
): GeoData | undefined {
  return getAgentData<GeoData>(
    request,
    "geo"
  );
}

function addFactor(
  factors: RiskFactor[],
  name: string,
  score: number,
  impact: RiskFactor["impact"],
  explanation: string
) {
  factors.push({
    name,
    score: clamp(score),
    impact,
    explanation,
  });
}

/** " (Open-Meteo model, valid 2026-09-24T12:00Z)" / " (configured
 * prototype dataset)" - appended to a factor explanation so each one
 * names the data it came from. */
function sourceNote(input: MarineDecisionValue | undefined): string {
  if (!input) return "";
  if (input.kind === "model") {
    return ` (Open-Meteo model output${input.timestamp ? `, valid ${input.timestamp}` : ""})`;
  }
  return " (configured prototype dataset)";
}

function withSource(
  factors: RiskFactor[],
  from: number,
  input: MarineDecisionValue | undefined
) {
  const note = sourceNote(input);
  if (!note) return;
  for (let i = from; i < factors.length; i += 1) {
    factors[i].explanation = factors[i].explanation.replace(/\.$/, `${note}.`);
  }
}

function assessWind(
  windSpeedKnots: number | undefined,
  factors: RiskFactor[]
) {
  if (
    typeof windSpeedKnots !== "number" ||
    !Number.isFinite(windSpeedKnots)
  ) {
    return;
  }

  if (windSpeedKnots >= 25) {
    addFactor(
      factors,
      "Very strong wind",
      25,
      "negative",
      `Wind speed is ${windSpeedKnots.toFixed(
        1
      )} knots and materially increases operational risk.`
    );
    return;
  }

  if (windSpeedKnots >= 18) {
    addFactor(
      factors,
      "Strong wind",
      18,
      "negative",
      `Wind speed is ${windSpeedKnots.toFixed(
        1
      )} knots and requires increased caution.`
    );
    return;
  }

  if (windSpeedKnots >= 12) {
    addFactor(
      factors,
      "Moderate wind",
      9,
      "negative",
      `Wind speed is ${windSpeedKnots.toFixed(
        1
      )} knots and contributes moderate operational risk.`
    );
    return;
  }

  addFactor(
    factors,
    "Favourable wind",
    0,
    "positive",
    `Wind speed is ${windSpeedKnots.toFixed(
      1
    )} knots with limited direct risk contribution.`
  );
}

function assessWaves(
  waveHeightM: number | undefined,
  factors: RiskFactor[]
) {
  if (
    typeof waveHeightM !== "number" ||
    !Number.isFinite(waveHeightM)
  ) {
    return;
  }

  if (waveHeightM >= 3) {
    addFactor(
      factors,
      "Very high waves",
      30,
      "negative",
      `Wave height is ${waveHeightM.toFixed(
        1
      )} m and represents a major safety concern.`
    );
    return;
  }

  if (waveHeightM >= 2) {
    addFactor(
      factors,
      "High waves",
      22,
      "negative",
      `Wave height is ${waveHeightM.toFixed(
        1
      )} m and substantially increases vessel-operational risk.`
    );
    return;
  }

  if (waveHeightM >= 1.2) {
    addFactor(
      factors,
      "Moderate waves",
      10,
      "negative",
      `Wave height is ${waveHeightM.toFixed(
        1
      )} m and contributes moderate risk.`
    );
    return;
  }

  addFactor(
    factors,
    "Favourable wave conditions",
    0,
    "positive",
    `Wave height is ${waveHeightM.toFixed(
      1
    )} m with limited direct risk contribution.`
  );
}

function assessVisibility(
  visibilityKm: number | undefined,
  factors: RiskFactor[]
) {
  if (
    typeof visibilityKm !== "number" ||
    !Number.isFinite(visibilityKm)
  ) {
    return;
  }

  if (visibilityKm < 1) {
    addFactor(
      factors,
      "Very poor visibility",
      20,
      "negative",
      `Visibility is ${visibilityKm.toFixed(
        1
      )} km and can significantly affect safe navigation.`
    );
    return;
  }

  if (visibilityKm < 3) {
    addFactor(
      factors,
      "Reduced visibility",
      12,
      "negative",
      `Visibility is ${visibilityKm.toFixed(
        1
      )} km and requires additional navigation caution.`
    );
    return;
  }

  addFactor(
    factors,
    "Adequate visibility",
    0,
    "positive",
    `Visibility is ${visibilityKm.toFixed(
      1
    )} km.`
  );
}

// Names assessWind/assessWaves add for a wind/wave reading that is
// itself already at "moderate" severity or worse. roughSea/strongWind
// below are boolean restatements of that same underlying wind-speed/
// wave-height reading in every area currently configured (never an
// independently-sourced hazard the numeric reading missed) - counting
// both is double-counting the same phenomenon, not two risks. Verified
// 2026-09-20: Central Gulf of Mannar (wind 19kn, wave 2.1m, both flags
// true) scored 80/100 this way vs. 70/100 once counted once, while
// every other configured area has both flags false, so this only
// silently inflated that one area's score today.
const WIND_FACTOR_NAMES = new Set(["Very strong wind", "Strong wind", "Moderate wind"]);
const WAVE_FACTOR_NAMES = new Set(["Very high waves", "High waves", "Moderate waves"]);

function assessHazards(
  hazards:
    | WeatherData["hazards"]
    | NonNullable<MarineData["area"]>["hazards"]
    | undefined,
  factors: RiskFactor[]
) {
  if (!hazards) {
    return;
  }

  if (hazards.cyclone) {
    addFactor(
      factors,
      "Cyclone hazard",
      45,
      "negative",
      "A cyclone hazard is active in the configured marine information."
    );
  }

  if (hazards.lightning) {
    addFactor(
      factors,
      "Lightning hazard",
      25,
      "negative",
      "Lightning activity is identified and increases immediate operational risk."
    );
  }

  // Only add these when assessWind/assessWaves (which already ran)
  // found no comparable wind/wave factor from the numeric reading -
  // i.e. the flag is the only signal available for that phenomenon,
  // not a second one layered on top of an already-scored reading.
  const hasWaveFactor = factors.some((factor) => WAVE_FACTOR_NAMES.has(factor.name));
  if (hazards.roughSea && !hasWaveFactor) {
    addFactor(
      factors,
      "Rough sea",
      22,
      "negative",
      "Rough sea conditions increase vessel motion and navigation risk."
    );
  }

  const hasWindFactor = factors.some((factor) => WIND_FACTOR_NAMES.has(factor.name));
  if (hazards.strongWind && !hasWindFactor) {
    addFactor(
      factors,
      "Strong wind hazard",
      18,
      "negative",
      "A strong-wind hazard is identified for the operating area."
    );
  }
}

function assessGeo(
  geo: GeoData | undefined,
  factors: RiskFactor[]
): string[] {
  const restrictions =
    geo?.nearbyRestrictedAreas ??
    [];

  if (
    geo?.insideRestrictedArea
  ) {
    addFactor(
      factors,
      "Inside restricted boundary",
      50,
      "negative",
      "The analysed position is inside a configured restricted or protected boundary."
    );

    return restrictions;
  }

  if (
    typeof geo?.boundaryDistanceKm ===
      "number" &&
    Number.isFinite(
      geo.boundaryDistanceKm
    )
  ) {
    if (
      geo.boundaryDistanceKm <= 1
    ) {
      addFactor(
        factors,
        "Very close to restricted boundary",
        25,
        "negative",
        `The nearest configured restricted boundary is approximately ${geo.boundaryDistanceKm.toFixed(
          1
        )} km away.`
      );
    } else if (
      geo.boundaryDistanceKm <= 5
    ) {
      addFactor(
        factors,
        "Near restricted boundary",
        12,
        "negative",
        `The nearest configured restricted boundary is approximately ${geo.boundaryDistanceKm.toFixed(
          1
        )} km away.`
      );
    } else {
      addFactor(
        factors,
        "Safe boundary separation",
        0,
        "positive",
        "No immediate boundary-proximity risk was identified."
      );
    }
  } else if (
    restrictions.length === 0
  ) {
    addFactor(
      factors,
      "No immediate geospatial restriction",
      0,
      "positive",
      "No nearby configured operational restriction was identified."
    );
  }

  return restrictions;
}

function assessOcean(
  ocean: OceanData | undefined,
  factors: RiskFactor[]
) {
  if (!ocean) {
    return;
  }

  const signal =
    normalizeText(
      ocean.productivitySignal
    );

  if (
    signal === "low"
  ) {
    addFactor(
      factors,
      "Low productivity",
      5,
      "negative",
      "Low productivity may reduce operational value of the selected fishing area."
    );
  }

  if (
    signal === "favourable" ||
    signal === "high"
  ) {
    addFactor(
      factors,
      "Favourable productivity",
      0,
      "positive",
      "The configured ocean indicators show a favourable productivity signal."
    );
  }

  if (
    normalizeText(
      ocean.trend
    ) === "declining"
  ) {
    addFactor(
      factors,
      "Declining productivity trend",
      4,
      "negative",
      "The productivity trend is declining in the analysed area."
    );
  }
}

function calculateRiskScore(
  factors: RiskFactor[],
  marineBaseScore?: number
): number {
  const negativeScore =
    factors
      .filter(
        (factor) =>
          factor.impact ===
          "negative"
      )
      .reduce(
        (total, factor) =>
          total + factor.score,
        0
      );

  const positiveScore =
    factors
      .filter(
        (factor) =>
          factor.impact ===
          "positive"
      )
      .reduce(
        (total, factor) =>
          total + factor.score,
        0
      );

  const calculated =
    negativeScore -
    positiveScore;

  if (
    typeof marineBaseScore ===
      "number" &&
    Number.isFinite(
      marineBaseScore
    )
  ) {
    return clamp(
      Math.max(
        calculated,
        marineBaseScore * 0.75
      )
    );
  }

  return clamp(calculated);
}

function enforceCriticalConditions(
  calculatedScore: number,
  factors: RiskFactor[]
): number {
  const hasCyclone =
    factors.some(
      (factor) =>
        factor.name ===
        "Cyclone hazard"
    );

  const insideBoundary =
    factors.some(
      (factor) =>
        factor.name ===
        "Inside restricted boundary"
    );

  if (
    hasCyclone ||
    insideBoundary
  ) {
    return Math.max(
      calculatedScore,
      90
    );
  }

  const hasMultipleSevereHazards =
    factors.filter(
      (factor) =>
        factor.impact ===
          "negative" &&
        factor.score >= 18
    ).length >= 2;

  if (
    hasMultipleSevereHazards
  ) {
    return Math.max(
      calculatedScore,
      70
    );
  }

  return calculatedScore;
}

function buildRecommendation(
  level: RiskLevel,
  factors: RiskFactor[],
  geoRestrictions: string[]
): string {
  if (
    level === "critical"
  ) {
    const criticalFactor =
      factors.find(
        (factor) =>
          factor.impact ===
            "negative" &&
          factor.score >= 25
      );

    if (criticalFactor) {
      return `Do not proceed under the current conditions. ${criticalFactor.explanation}`;
    }

    return "Do not proceed until the critical marine or geospatial risk is resolved.";
  }

  if (
    level === "high"
  ) {
    if (
      geoRestrictions.length > 0
    ) {
      return "Use an alternative operating area or route and maintain safe separation from the identified restricted boundaries.";
    }

    return "Proceed only with increased caution and review the prevailing marine hazards before departure.";
  }

  if (
    level === "moderate"
  ) {
    return "Operations may be possible with caution. Monitor marine conditions and reassess before departure.";
  }

  return "Current assessed conditions appear generally favourable, subject to normal operational checks.";
}

function buildFinding(
  request: AgentRequest,
  score: number,
  level: RiskLevel,
  recommendation: string,
  factors: RiskFactor[],
  basis: RiskBasis
): AgentFinding {
  const keyFactors =
    factors
      .filter(
        (factor) =>
          factor.impact ===
            "negative"
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 5);

  return {
    id: `risk-${request.requestId}`,
    agent: "risk",

    title: `${level
      .charAt(0)
      .toUpperCase()}${level.slice(
      1
    )} operational risk`,

    summary:
      `Combined risk score: ${score}/100. ${recommendation}`,

    severity: level,

    confidence:
      factors.length > 0
        ? 0.94
        : 0.55,

    data: {
      riskScore: score,
      riskLevel: level,

      keyFactors:
        keyFactors.map(
          (factor) =>
            factor.explanation
        ),

      factorCount:
        factors.length,

      basis,
    },
  };
}

export async function runRiskAgent(
  request: AgentRequest
): Promise<
  AgentResponse<RiskAgentData>
> {
  try {
    const marine =
      getMarineData(request);

    const weather =
      getWeatherData(request);

    const ocean =
      getOceanData(request);

    const geo =
      getGeoData(request);

    const factors: RiskFactor[] = [];

    const inputs =
      weather?.marineInputs;

    // Without the weather agent's inputs, conditions come straight from
    // the configured area record (the original behaviour).
    const conditionsBasis: RiskBasis["conditions"] =
      inputs?.basis ?? "configured-fallback";

    /*
     * Marine baseline: the configured area's pre-set prototype score.
     * It was derived from the configured conditions, so it is only
     * applied when the conditions themselves are the configured
     * fallback - flooring a model-based result with it would mix the
     * two sources.
     */
    const prototypeBaselineApplied =
      conditionsBasis === "configured-fallback" &&
      typeof marine?.area?.safety?.riskScore === "number";

    const marineBaseScore =
      prototypeBaselineApplied
        ? marine?.area?.safety?.riskScore
        : undefined;

    /*
     * Environmental conditions.
     */
    let mark = factors.length;
    assessWind(
      weather?.windSpeedKnots ??
        marine?.area?.conditions
          ?.windSpeedKnots,
      factors
    );
    withSource(factors, mark, inputs?.windSpeedKnots);

    mark = factors.length;
    assessWaves(
      weather?.waveHeightM ??
        marine?.area?.conditions
          ?.waveHeightM,
      factors
    );
    withSource(factors, mark, inputs?.waveHeightM);

    mark = factors.length;
    assessVisibility(
      weather?.visibilityKm ??
        marine?.area?.conditions
          ?.visibilityKm,
      factors
    );
    withSource(factors, mark, inputs?.visibilityKm);

    /*
     * Weather hazards.
     */
    assessHazards(
      weather?.hazards ??
        marine?.area?.hazards,
      factors
    );

    /*
     * Geospatial restrictions.
     */
    const geoRestrictions =
      assessGeo(
        geo,
        factors
      );

    /*
     * Ocean/productivity context.
     */
    assessOcean(
      ocean,
      factors
    );

    let score =
      calculateRiskScore(
        factors,
        marineBaseScore
      );

    score =
      enforceCriticalConditions(
        score,
        factors
      );

    score = Math.round(
      clamp(score)
    );

    const riskLevel =
      toRiskLevel(score);

    const recommendation =
      buildRecommendation(
        riskLevel,
        factors,
        geoRestrictions
      );

    const basis: RiskBasis = {
      conditions: conditionsBasis,
      inputs,
      prototypeBaselineApplied,
      thresholds: THRESHOLDS_NOTE,
    };

    const findings = [
      buildFinding(
        request,
        score,
        riskLevel,
        recommendation,
        factors,
        basis
      ),
    ];

    /*
     * Add one finding per major negative factor
     * so the evidence/reporting agents can explain
     * why the score was produced.
     */
    factors
      .filter(
        (factor) =>
          factor.impact ===
          "negative"
      )
      .sort(
        (a, b) =>
          b.score - a.score
      )
      .slice(0, 6)
      .forEach(
        (factor, index) => {
          findings.push({
            id: `risk-factor-${request.requestId}-${index}`,
            agent: "risk",

            title: factor.name,

            summary:
              factor.explanation,

            severity:
              factor.score >= 25
                ? "critical"
                : factor.score >= 18
                  ? "high"
                  : factor.score >= 10
                    ? "moderate"
                    : "low",

            confidence: 0.93,

            data: {
              contribution:
                factor.score,
            },
          });
        }
      );

    const evidence: AgentResponse["evidence"] =
      factors.map(
        (factor, index) => ({
          id: `risk-evidence-${request.requestId}-${index}`,

          type:
            factor.name.includes(
              "boundary"
            ) ||
            factor.name.includes(
              "geospatial"
            )
              ? "geospatial"
              : factor.name
                    .toLowerCase()
                    .includes(
                      "wind"
                    ) ||
                  factor.name
                    .toLowerCase()
                    .includes(
                      "wave"
                    ) ||
                  factor.name
                    .toLowerCase()
                    .includes(
                      "lightning"
                    ) ||
                  factor.name
                    .toLowerCase()
                    .includes(
                      "cyclone"
                    )
                ? "weather"
                : "marine",

          title:
            factor.name,

          source:
            "Combined specialist-agent analysis",

          summary:
            factor.explanation,

          data: {
            contribution:
              factor.score,

            impact:
              factor.impact,
          },
        })
      );

    const data: RiskAgentData = {
      riskScore: score,
      riskLevel,
      recommendation,

      factors:
        findings,

      basis,
    };

    return {
      agent: "risk",

      status:
        factors.length > 0
          ? "success"
          : "partial",

      findings,

      evidence,

      data,

      confidence:
        factors.length > 0
          ? 0.94
          : 0.55,

      nextAgents: [
        "evidence",
        "visualization",
        "reporting",
      ],

      warnings:
        factors.length === 0
          ? [
              "Risk assessment had limited input data.",
            ]
          : undefined,
    };
  } catch (error) {
    return {
      agent: "risk",

      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Risk assessment failed.",
    };
  }
}

export default runRiskAgent;