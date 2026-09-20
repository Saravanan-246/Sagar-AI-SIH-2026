import type {
  AgentFinding,
  AgentRequest,
  AgentResponse,
  WeatherAgentData,
} from "./agentTypes";

import {
  getActiveAlerts,
  getAlertsByArea,
  getAlertsBySeverity,
} from "../alerts/alertService";

import {
  getMarineArea,
  getDefaultMarineArea,
} from "../marine/marineData";

import type { AlertSeverity } from "../../types/alert";
import type { MarineArea } from "../../types/marine";

interface WeatherInputs {
  areaId?: string;
  areaName?: string;

  windSpeedKnots?: number;
  waveHeightM?: number;
  visibilityKm?: number;

  lightning?: boolean;
  cyclone?: boolean;
  roughSea?: boolean;
  strongWind?: boolean;
}

function normalizeText(
  value: unknown
): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getArea(
  request: AgentRequest
): MarineArea {
  const areaId =
    typeof request.parameters?.areaId ===
    "string"
      ? request.parameters.areaId
      : undefined;

  const areaName =
    request.context.areaName ??
    (typeof request.parameters?.areaName ===
    "string"
      ? request.parameters.areaName
      : undefined);

  if (areaId) {
    const area =
      getMarineArea(areaId);

    if (area) {
      return area;
    }
  }

  if (areaName) {
    const normalized =
      normalizeText(areaName);

    const defaultCandidate =
      getDefaultMarineArea();

    if (
      normalizeText(
        defaultCandidate.name
      ) === normalized
    ) {
      return defaultCandidate;
    }
  }

  return (
    request.area ??
    getDefaultMarineArea()
  );
}

// Alerts geographically/explicitly relevant to this area only -
// getAlertsByArea() already returns an empty list (not every active
// alert) when the area is known but nothing matches it, so no extra
// fallback is layered on top here. Mirrors the backend weatherAgent's
// same fix, for online/offline parity.
function getWeatherAlerts(
  area: MarineArea
) {
  return getAlertsByArea(
    area.id
  );
}

function severityRank(
  severity: AlertSeverity
): number {
  const order: Record<
    AlertSeverity,
    number
  > = {
    low: 1,
    moderate: 2,
    high: 3,
    critical: 4,
  };

  return order[severity];
}

function getHighestAlertSeverity(
  alerts: ReturnType<
    typeof getActiveAlerts
  >
): AlertSeverity | undefined {
  if (alerts.length === 0) {
    return undefined;
  }

  return alerts.reduce(
    (highest, alert) =>
      severityRank(
        alert.severity
      ) >
      severityRank(highest)
        ? alert.severity
        : highest,
    alerts[0].severity
  );
}

function getHazardsFromArea(
  area: MarineArea
) {
  return {
    lightning:
      area.hazards.lightning,

    cyclone:
      area.hazards.cyclone,

    roughSea:
      area.hazards.roughSea,

    strongWind:
      area.hazards.strongWind,

    visibilityRisk:
      Boolean(
        area.hazards.visibilityRisk
      ),
  };
}

function getHazardsFromAlerts(
  alerts: ReturnType<
    typeof getActiveAlerts
  >
) {
  let lightning = false;
  let cyclone = false;
  let roughSea = false;
  let strongWind = false;

  for (const alert of alerts) {
    switch (alert.type) {
      case "lightning":
        lightning = true;
        break;

      case "cyclone":
        cyclone = true;
        break;

      case "rough_sea":
      case "high_waves":
        roughSea = true;
        break;

      case "strong_wind":
        strongWind = true;
        break;

      default:
        break;
    }
  }

  return {
    lightning,
    cyclone,
    roughSea,
    strongWind,
  };
}

function mergeHazards(
  area: MarineArea,
  alerts: ReturnType<
    typeof getActiveAlerts
  >
): WeatherAgentData["hazards"] {
  const areaHazards =
    getHazardsFromArea(
      area
    );

  const alertHazards =
    getHazardsFromAlerts(
      alerts
    );

  return {
    lightning:
      areaHazards.lightning ||
      alertHazards.lightning,

    cyclone:
      areaHazards.cyclone ||
      alertHazards.cyclone,

    roughSea:
      areaHazards.roughSea ||
      alertHazards.roughSea,

    strongWind:
      areaHazards.strongWind ||
      alertHazards.strongWind,
  };
}

function evaluateWind(
  windSpeedKnots: number
): {
  finding: AgentFinding;
  score: number;
} {
  if (windSpeedKnots >= 25) {
    return {
      score: 30,

      finding: {
        id: `weather-wind-critical`,
        agent: "weather",

        title: "Very strong wind",

        summary:
          `Wind speed is ${windSpeedKnots.toFixed(
            1
          )} knots, indicating a severe wind condition.`,

        severity: "critical",

        confidence: 0.95,

        data: {
          windSpeedKnots,
        },
      },
    };
  }

  if (windSpeedKnots >= 18) {
    return {
      score: 22,

      finding: {
        id: `weather-wind-high`,
        agent: "weather",

        title: "Strong wind",

        summary:
          `Wind speed is ${windSpeedKnots.toFixed(
            1
          )} knots and requires increased operational caution.`,

        severity: "high",

        confidence: 0.95,

        data: {
          windSpeedKnots,
        },
      },
    };
  }

  if (windSpeedKnots >= 12) {
    return {
      score: 10,

      finding: {
        id: `weather-wind-moderate`,
        agent: "weather",

        title: "Moderate wind",

        summary:
          `Wind speed is ${windSpeedKnots.toFixed(
            1
          )} knots and contributes moderate operational risk.`,

        severity: "moderate",

        confidence: 0.95,

        data: {
          windSpeedKnots,
        },
      },
    };
  }

  return {
    score: 0,

    finding: {
      id: `weather-wind-favourable`,
      agent: "weather",

      title: "Favourable wind",

      summary:
        `Wind speed is ${windSpeedKnots.toFixed(
          1
        )} knots.`,

      severity: "info",

      confidence: 0.95,

      data: {
        windSpeedKnots,
      },
    },
  };
}

function evaluateWaves(
  waveHeightM: number
): {
  finding: AgentFinding;
  score: number;
} {
  if (waveHeightM >= 3) {
    return {
      score: 30,

      finding: {
        id: `weather-wave-critical`,
        agent: "weather",

        title: "Very high waves",

        summary:
          `Wave height is ${waveHeightM.toFixed(
            1
          )} m, representing a major sea-state concern.`,

        severity: "critical",

        confidence: 0.95,

        data: {
          waveHeightM,
        },
      },
    };
  }

  if (waveHeightM >= 2) {
    return {
      score: 22,

      finding: {
        id: `weather-wave-high`,
        agent: "weather",

        title: "High waves",

        summary:
          `Wave height is ${waveHeightM.toFixed(
            1
          )} m and substantially increases operational risk.`,

        severity: "high",

        confidence: 0.95,

        data: {
          waveHeightM,
        },
      },
    };
  }

  if (waveHeightM >= 1.2) {
    return {
      score: 10,

      finding: {
        id: `weather-wave-moderate`,
        agent: "weather",

        title: "Moderate waves",

        summary:
          `Wave height is ${waveHeightM.toFixed(
            1
          )} m and requires normal caution.`,

        severity: "moderate",

        confidence: 0.95,

        data: {
          waveHeightM,
        },
      },
    };
  }

  return {
    score: 0,

    finding: {
      id: `weather-wave-favourable`,
      agent: "weather",

      title: "Favourable wave conditions",

      summary:
        `Wave height is ${waveHeightM.toFixed(
          1
        )} m.`,

      severity: "info",

      confidence: 0.95,

      data: {
        waveHeightM,
      },
    },
  };
}

function evaluateVisibility(
  visibilityKm: number
): {
  finding: AgentFinding;
  score: number;
} {
  if (visibilityKm < 1) {
    return {
      score: 20,

      finding: {
        id: `weather-visibility-critical`,
        agent: "weather",

        title: "Very poor visibility",

        summary:
          `Visibility is ${visibilityKm.toFixed(
            1
          )} km and may significantly affect navigation.`,

        severity: "critical",

        confidence: 0.95,

        data: {
          visibilityKm,
        },
      },
    };
  }

  if (visibilityKm < 3) {
    return {
      score: 12,

      finding: {
        id: `weather-visibility-high`,
        agent: "weather",

        title: "Reduced visibility",

        summary:
          `Visibility is ${visibilityKm.toFixed(
            1
          )} km and requires additional navigation caution.`,

        severity: "high",

        confidence: 0.95,

        data: {
          visibilityKm,
        },
      },
    };
  }

  return {
    score: 0,

    finding: {
      id: `weather-visibility-good`,
      agent: "weather",

      title: "Adequate visibility",

      summary:
        `Visibility is ${visibilityKm.toFixed(
          1
        )} km.`,

      severity: "info",

      confidence: 0.95,

      data: {
        visibilityKm,
      },
    },
  };
}

function buildHazardFindings(
  hazards: WeatherAgentData["hazards"]
): AgentFinding[] {
  const findings: AgentFinding[] = [];

  if (hazards.cyclone) {
    findings.push({
      id: "weather-hazard-cyclone",
      agent: "weather",

      title: "Cyclone hazard",

      summary:
        "Cyclone activity is identified in the configured marine hazard information.",

      severity: "critical",

      confidence: 0.96,
    });
  }

  if (hazards.lightning) {
    findings.push({
      id: "weather-hazard-lightning",
      agent: "weather",

      title: "Lightning hazard",

      summary:
        "Lightning activity is identified and may create an immediate operational safety risk.",

      severity: "high",

      confidence: 0.96,
    });
  }

  if (hazards.roughSea) {
    findings.push({
      id: "weather-hazard-rough-sea",
      agent: "weather",

      title: "Rough sea hazard",

      summary:
        "Rough sea conditions are identified in the configured marine information.",

      severity: "high",

      confidence: 0.95,
    });
  }

  if (hazards.strongWind) {
    findings.push({
      id: "weather-hazard-strong-wind",
      agent: "weather",

      title: "Strong wind hazard",

      summary:
        "Strong wind is identified as an active marine hazard.",

      severity: "high",

      confidence: 0.95,
    });
  }

  return findings;
}

function buildAlertFinding(
  alert: ReturnType<
    typeof getActiveAlerts
  >[number]
): AgentFinding {
  return {
    id: `weather-alert-${alert.id}`,

    agent: "weather",

    title: alert.title,

    summary:
      alert.summary ||
      alert.description,

    severity:
      alert.severity,

    confidence: 0.94,

    data: {
      alertId:
        alert.id,

      alertType:
        alert.type,

      status:
        alert.status,

      validUntil:
        alert.validUntil,

      location:
        alert.location,
    },
  };
}

function buildRecommendation(
  hazards: WeatherAgentData["hazards"],
  alerts: ReturnType<
    typeof getActiveAlerts
  >,
  windSpeedKnots: number,
  waveHeightM: number,
  visibilityKm: number
): string {
  if (hazards.cyclone) {
    return "Do not proceed under cyclone conditions. Follow the applicable marine safety advisory and reassess before departure.";
  }

  if (
    hazards.lightning &&
    (
      hazards.roughSea ||
      hazards.strongWind
    )
  ) {
    return "Avoid or postpone operations while multiple severe marine hazards are active.";
  }

  if (hazards.lightning) {
    return "Use caution and consider postponing operations while lightning activity remains active.";
  }

  if (
    hazards.roughSea ||
    waveHeightM >= 2
  ) {
    return "Avoid unnecessary exposure to rough seas and review an alternative operating plan.";
  }

  if (
    hazards.strongWind ||
    windSpeedKnots >= 18
  ) {
    return "Proceed only with increased caution and reassess the route or departure timing.";
  }

  if (
    visibilityKm < 3
  ) {
    return "Reduce navigation risk by exercising additional caution under reduced visibility.";
  }

  if (
    alerts.length > 0
  ) {
    return "Review the active marine alerts before departure and follow their recommendations.";
  }

  return "Current configured weather conditions appear generally manageable, subject to normal operational checks.";
}

export async function runWeatherAgent(
  request: AgentRequest
): Promise<
  AgentResponse<WeatherAgentData>
> {
  try {
    const area =
      getArea(request);

    const alerts =
      getWeatherAlerts(area);

    const highSeverityAlerts =
      alerts.filter(
        (alert) =>
          alert.severity === "high" ||
          alert.severity === "critical"
      );

    const hazards =
      mergeHazards(
        area,
        alerts
      );

    const windSpeedKnots =
      area.conditions
        .windSpeedKnots;

    const waveHeightM =
      area.conditions
        .waveHeightM;

    const visibilityKm =
      area.conditions
        .visibilityKm;

    const windAssessment =
      evaluateWind(
        windSpeedKnots
      );

    const waveAssessment =
      evaluateWaves(
        waveHeightM
      );

    const visibilityAssessment =
      evaluateVisibility(
        visibilityKm
      );

    const findings: AgentFinding[] = [
      {
        id: `weather-overview-${request.requestId}`,

        agent: "weather",

        title: `${area.name} weather intelligence`,

        summary:
          `Wind ${windSpeedKnots.toFixed(
            1
          )} kn, waves ${waveHeightM.toFixed(
            1
          )} m, visibility ${visibilityKm.toFixed(
            1
          )} km.`,

        severity:
          getHighestAlertSeverity(
            alerts
          ) ??
          area.safety.overallRisk,

        confidence: 0.95,

        data: {
          areaId:
            area.id,

          windDirection:
            area.conditions
              .windDirection,

          waveDirection:
            area.conditions
              .waveDirection,

          seaState:
            area.conditions
              .seaState,

          rainProbability:
            area.conditions
              .rainProbability,

          cloudCover:
            area.conditions
              .cloudCover,
        },
      },

      windAssessment.finding,
      waveAssessment.finding,
      visibilityAssessment.finding,

      ...buildHazardFindings(
        hazards
      ),

      ...alerts
        .slice(0, 6)
        .map(
          buildAlertFinding
        ),
    ];

    const weatherScore = Math.min(
      100,

      windAssessment.score +
        waveAssessment.score +
        visibilityAssessment.score +
        (hazards.cyclone
          ? 40
          : 0) +
        (hazards.lightning
          ? 25
          : 0) +
        (hazards.roughSea
          ? 20
          : 0) +
        (hazards.strongWind
          ? 18
          : 0) +
        highSeverityAlerts.length *
          8
    );

    const recommendation =
      buildRecommendation(
        hazards,
        alerts,
        windSpeedKnots,
        waveHeightM,
        visibilityKm
      );

    const evidence: AgentResponse["evidence"] =
      [
        {
          id: `weather-conditions-${area.id}`,

          type: "weather",

          title: `${area.name} weather observations`,

          source:
            "Configured marine weather dataset",

          timestamp:
            area.updatedAt,

          summary:
            `Wind ${windSpeedKnots.toFixed(
              1
            )} knots, ${waveHeightM.toFixed(
              1
            )} m waves and ${visibilityKm.toFixed(
              1
            )} km visibility.`,

          data: {
            conditions:
              area.conditions,
          },
        },
        ...alerts
          .slice(0, 8)
          .map((alert) => ({
            id: `weather-alert-evidence-${alert.id}`,

            type:
              "alert" as const,

            title:
              alert.title,

            source:
              alert.source,

            timestamp:
              alert.issuedAt,

            summary:
              alert.summary ||
              alert.description,

            data: {
              alertId:
                alert.id,

              severity:
                alert.severity,

              validUntil:
                alert.validUntil,

              location:
                alert.location,
            },
          })),
      ];

    const data: WeatherAgentData = {
      alerts,

      hazards: {
        lightning:
          hazards.lightning,

        cyclone:
          hazards.cyclone,

        roughSea:
          hazards.roughSea,

        strongWind:
          hazards.strongWind,
      },

      windSpeedKnots,

      waveHeightM,

      visibilityKm,
    };

    return {
      agent: "weather",

      status:
        alerts.length > 0 ||
        findings.length > 0
          ? "success"
          : "partial",

      findings,

      evidence,

      data,

      confidence: 0.95,

      nextAgents: [
        "risk",
        "evidence",
        "visualization",
      ],

      warnings:
        alerts.length === 0
          ? [
              "No active configured alert was found for the selected area."
            ]
          : undefined,
    };
  } catch (error) {
    return {
      agent: "weather",

      status: "failed",

      findings: [],
      evidence: [],

      confidence: 0,

      error:
        error instanceof Error
          ? error.message
          : "Weather intelligence analysis failed.",
    };
  }
}

export default runWeatherAgent;