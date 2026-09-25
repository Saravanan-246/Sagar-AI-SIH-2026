import {
  getMarineAreas,
  getMarineArea,
  getMarineAreaByName,
  getDefaultMarineArea,
  getMarineConditions,
  getMarineTide,
  getMarineIndicators,
  getMarineHazards,
  getMarineSummary,
} from "../marine/marineData";

import type { MarineArea } from "../../types/marine";

import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  MarineDataAgentData,
} from "./agentTypes";

function normalizeText(
  value: string | undefined
): string {
  return (value ?? "")
    .trim()
    .toLowerCase();
}

function findAreaFromQuery(
  request: AgentRequest
): MarineArea {
  const requestedArea =
    request.context.areaName ??
    (typeof request.parameters?.areaName ===
    "string"
      ? request.parameters.areaName
      : undefined);

  if (requestedArea) {
    const byName =
      getMarineAreaByName(
        requestedArea
      );

    if (byName) {
      return byName;
    }

    const normalizedRequest =
      normalizeText(
        requestedArea
      );

    const fuzzy =
      getMarineAreas().find(
        (area) => {
          const name =
            normalizeText(
              area.name
            );

          return (
            name.includes(
              normalizedRequest
            ) ||
            normalizedRequest.includes(
              name
            )
          );
        }
      );

    if (fuzzy) {
      return fuzzy;
    }
  }

  const query = normalizeText(
    request.message
  );

  const matchingArea =
    getMarineAreas().find(
      (area) => {
        const areaName =
          normalizeText(
            area.name
          );

        const region =
          normalizeText(
            area.region
          );

        return (
          (areaName &&
            query.includes(
              areaName
            )) ||
          (region &&
            query.includes(
              region
            ))
        );
      }
    );

  return (
    matchingArea ??
    request.area ??
    getDefaultMarineArea()
  );
}

function buildConditionsFinding(
  area: MarineArea,
  requestId: string
): AgentFinding {
  const conditions =
    getMarineConditions(
      area.id
    );

  return {
    id: `marine-conditions-${requestId}`,
    agent: "marine-data",

    title: `${area.name} marine conditions`,

    summary:
      `${conditions.windSpeedKnots} kn wind, ` +
      `${conditions.waveHeightM} m waves, ` +
      `${conditions.seaState} sea state, ` +
      `${conditions.visibilityKm} km visibility ` +
      `(configured prototype profile - risk uses model wind/waves when available).`,

    severity:
      area.safety.overallRisk,

    confidence: 0.95,

    data: {
      airTemperatureC:
        conditions.airTemperatureC,

      windSpeedKnots:
        conditions.windSpeedKnots,

      windDirection:
        conditions.windDirection,

      waveHeightM:
        conditions.waveHeightM,

      waveDirection:
        conditions.waveDirection,

      seaState:
        conditions.seaState,

      visibilityKm:
        conditions.visibilityKm,

      rainProbability:
        conditions.rainProbability,

      cloudCover:
        conditions.cloudCover,
    },
  };
}

function buildTideFinding(
  area: MarineArea,
  requestId: string
): AgentFinding {
  const tide = getMarineTide(
    area.id
  );

  return {
    id: `marine-tide-${requestId}`,
    agent: "marine-data",

    title: `${area.name} tide information`,

    summary:
      `Current tide: ${tide.currentState}. ` +
      `Next high: ${tide.nextHigh.heightM} m. ` +
      `Next low: ${tide.nextLow.heightM} m.`,

    severity: "info",

    confidence: 0.95,

    data: {
      currentState:
        tide.currentState,

      currentHeightM:
        tide.currentHeightM,

      nextHigh:
        tide.nextHigh,

      nextLow:
        tide.nextLow,
    },
  };
}

function buildIndicatorFinding(
  area: MarineArea,
  requestId: string
): AgentFinding {
  const indicators =
    getMarineIndicators(
      area.id
    );

  return {
    id: `marine-indicators-${requestId}`,
    agent: "marine-data",

    title: `${area.name} ocean indicators`,

    summary:
      `SST ${indicators.seaSurfaceTemperatureC}°C, ` +
      `chlorophyll ${indicators.chlorophyllMgM3} mg/m³, ` +
      `productivity signal ${indicators.productivitySignal}.`,

    severity: "info",

    confidence: 0.95,

    data: {
      seaSurfaceTemperatureC:
        indicators.seaSurfaceTemperatureC,

      chlorophyllMgM3:
        indicators.chlorophyllMgM3,

      productivitySignal:
        indicators.productivitySignal,

      productivityIndex:
        indicators.productivityIndex,
    },
  };
}

function buildHazardFinding(
  area: MarineArea,
  requestId: string
): AgentFinding {
  const hazards =
    getMarineHazards(
      area.id
    );

  const activeHazards: string[] = [];

  if (hazards.lightning) {
    activeHazards.push(
      "lightning"
    );
  }

  if (hazards.cyclone) {
    activeHazards.push(
      "cyclone"
    );
  }

  if (hazards.roughSea) {
    activeHazards.push(
      "rough sea"
    );
  }

  if (hazards.strongWind) {
    activeHazards.push(
      "strong wind"
    );
  }

  if (hazards.visibilityRisk) {
    activeHazards.push(
      "visibility risk"
    );
  }

  return {
    id: `marine-hazards-${requestId}`,
    agent: "marine-data",

    title: "Marine hazard assessment",

    summary:
      activeHazards.length > 0
        ? `Active hazards: ${activeHazards.join(
            ", "
          )}.`
        : "No configured marine hazard is currently active for this area.",

    severity:
      activeHazards.length > 0
        ? area.safety.overallRisk
        : "info",

    confidence: 0.95,

    data: {
      lightning:
        hazards.lightning,

      cyclone:
        hazards.cyclone,

      roughSea:
        hazards.roughSea,

      strongWind:
        hazards.strongWind,

      visibilityRisk:
        hazards.visibilityRisk,
    },
  };
}

function buildSafetyFinding(
  area: MarineArea,
  requestId: string
): AgentFinding {
  const summary =
    getMarineSummary(
      area.id
    );

  return {
    id: `marine-safety-${requestId}`,
    agent: "marine-data",

    title: "Current marine safety summary",

    summary:
      summary.recommendation,

    severity:
      summary.riskLevel,

    confidence: 0.95,

    data: {
      riskLevel:
        summary.riskLevel,

      riskScore:
        summary.riskScore,

      seaState:
        summary.seaState,

      windSpeedKnots:
        summary.windSpeedKnots,

      waveHeightM:
        summary.waveHeightM,

      productivitySignal:
        summary.productivitySignal,
    },
  };
}

function buildEvidence(
  area: MarineArea
): AgentResponse["evidence"] {
  return [
    {
      id: `marine-source-${area.id}`,
      type: "marine",
      title: `${area.name} marine observation dataset`,
      source:
        "Configured marine observation dataset",
      timestamp:
        area.updatedAt,

      summary:
        "Marine conditions, tide, ocean indicators, hazards and safety attributes for the selected area.",

      data: {
        areaId:
          area.id,

        areaName:
          area.name,

        coordinates:
          area.coordinates,
      },
    },

    {
      id: `marine-condition-source-${area.id}`,
      type: "marine",
      title: "Configured area profile (prototype)",
      source:
        "Sagar configured marine dataset (prototype) - not an observation",
      timestamp:
        area.updatedAt,

      summary:
        `${area.conditions.windSpeedKnots} kn wind, ${area.conditions.waveHeightM} m waves and ${area.conditions.seaState} sea state (configured prototype values).`,

      data: {
        conditions:
          area.conditions,
      },
    },

    {
      id: `marine-indicator-source-${area.id}`,
      type: "ocean",
      title: "Ocean indicator observations",
      source:
        "Configured ocean indicator dataset",
      timestamp:
        area.updatedAt,

      summary:
        `SST ${area.marineIndicators.seaSurfaceTemperatureC}°C and chlorophyll ${area.marineIndicators.chlorophyllMgM3} mg/m³.`,

      data: {
        indicators:
          area.marineIndicators,
      },
    },
  ];
}

export async function runMarineDataAgent(
  request: AgentRequest
): Promise<
  AgentResponse<MarineDataAgentData>
> {
  try {
    const area =
      findAreaFromQuery(request);

    if (!area) {
      return {
        agent: "marine-data",
        status: "failed",

        findings: [],
        evidence: [],

        confidence: 0,

        error:
          "No marine area was available for analysis.",
      };
    }

    /*
     * Keep the service call explicit here so the
     * agent remains the data-discovery boundary
     * for the rest of the architecture.
     */
    const verifiedArea =
      getMarineArea(area.id) ??
      area;

    const areas =
      getMarineAreas();

    const findings: AgentFinding[] = [
      buildConditionsFinding(
        verifiedArea,
        request.requestId
      ),

      buildTideFinding(
        verifiedArea,
        request.requestId
      ),

      buildIndicatorFinding(
        verifiedArea,
        request.requestId
      ),

      buildHazardFinding(
        verifiedArea,
        request.requestId
      ),

      buildSafetyFinding(
        verifiedArea,
        request.requestId
      ),
    ];

    const evidence =
      buildEvidence(
        verifiedArea
      );

    const data: MarineDataAgentData = {
      area: verifiedArea,
      areas,
    };

    return {
      agent: "marine-data",

      status: "success",

      findings,

      evidence,

      data,

      confidence: 0.95,

      nextAgents: [
        "weather",
        "ocean",
        "geo",
        "risk",
        "evidence",
      ],
    };
  } catch (error) {
    return {
      agent: "marine-data",

      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Marine data retrieval failed.",
    };
  }
}

export default runMarineDataAgent;