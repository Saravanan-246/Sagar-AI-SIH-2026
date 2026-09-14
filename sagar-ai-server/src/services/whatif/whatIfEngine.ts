import { runScenario } from "../scenarios/scenarioEngine";
import { getSafestRoute } from "../routes/routeService";

import type { Scenario, ScenarioResult } from "../../types/scenario";

export type WhatIfKind =
  | "wind_increase"
  | "wave_increase"
  | "lightning_active"
  | "cyclone_active"
  | "route_blocked"
  | "departure_later"
  | "productivity_lower";

export interface WhatIfDetection {
  kind: WhatIfKind;
  percent?: number;
  hours?: number;
}

const WHAT_IF_PATTERN =
  /what if|what would happen|what happens if|suppose |imagine if/i;

export function detectWhatIf(
  message: string
): WhatIfDetection | null {
  if (!WHAT_IF_PATTERN.test(message)) {
    return null;
  }

  const text = message.toLowerCase();

  const percentMatch = text.match(/(\d+)\s*%/);
  const percent = percentMatch
    ? Number(percentMatch[1])
    : undefined;

  const hoursMatch = text.match(/(\d+)\s*hour/);
  const hours = hoursMatch ? Number(hoursMatch[1]) : undefined;

  if (
    /route/.test(text) &&
    /(block|close|unavailable|impassable)/.test(text)
  ) {
    return { kind: "route_blocked" };
  }

  if (/lightning/.test(text)) {
    return { kind: "lightning_active" };
  }

  if (/cyclone/.test(text)) {
    return { kind: "cyclone_active" };
  }

  if (/productivity/.test(text)) {
    return { kind: "productivity_lower", percent: percent ?? 15 };
  }

  if (/wave/.test(text)) {
    return { kind: "wave_increase", percent: percent ?? 20 };
  }

  if (/wind/.test(text)) {
    return { kind: "wind_increase", percent: percent ?? 20 };
  }

  if (
    (/depart/.test(text) || /leave/.test(text)) &&
    (/later/.test(text) || /delay/.test(text))
  ) {
    return { kind: "departure_later", hours: hours ?? 4 };
  }

  return null;
}

function adhocScenario(
  type: Scenario["type"],
  name: string,
  areaId: string
): Scenario {
  return {
    id: `adhoc-${type}-${Date.now()}`,
    name,
    type,
    areaId,
  };
}

export function describeWhatIf(
  detection: WhatIfDetection
): string {
  switch (detection.kind) {
    case "wind_increase":
      return `wind speed increasing by ${detection.percent ?? 20}%`;
    case "wave_increase":
      return `wave height increasing by ${detection.percent ?? 20}%`;
    case "lightning_active":
      return "lightning activity becoming active";
    case "cyclone_active":
      return "cyclone activity becoming active";
    case "productivity_lower":
      return `productivity declining by ${detection.percent ?? 15}%`;
    case "departure_later":
      return `departing approximately ${detection.hours ?? 4} hour(s) later`;
    case "route_blocked":
      return "the selected route becoming blocked or unavailable";
  }
}

export function runWhatIf(
  detection: WhatIfDetection,
  areaId: string
): ScenarioResult {
  switch (detection.kind) {
    case "wind_increase":
      return runScenario(
        adhocScenario("weather_change", "Wind increase", areaId),
        {
          areaId,
          windSpeedIncreasePercent: detection.percent ?? 20,
        }
      );

    case "wave_increase":
      return runScenario(
        adhocScenario("weather_change", "Wave increase", areaId),
        {
          areaId,
          waveIncreasePercent: detection.percent ?? 20,
        }
      );

    case "lightning_active":
      return runScenario(
        adhocScenario(
          "hazard_activation",
          "Lightning activation",
          areaId
        ),
        {
          areaId,
          lightningRisk: "high",
        }
      );

    case "cyclone_active": {
      const result = runScenario(
        adhocScenario(
          "hazard_activation",
          "Cyclone activation",
          areaId
        ),
        {
          areaId,
          lightningRisk: "high",
        }
      );

      return {
        ...result,
        scenarioName: "Cyclone activation",
        recommendation: result.recommendation.replace(
          /lightning/gi,
          "cyclone"
        ),
        keyFactors: result.keyFactors.map((factor) =>
          factor.replace(/lightning/gi, "cyclone")
        ),
      };
    }

    case "productivity_lower":
      return runScenario(
        adhocScenario(
          "productivity_change",
          "Productivity decline",
          areaId
        ),
        {
          areaId,
          productivityDecreasePercent:
            detection.percent ?? 15,
        }
      );

    case "departure_later":
      return runScenario(
        adhocScenario(
          "departure_time",
          "Later departure",
          areaId
        ),
        {
          areaId,
          durationHours: 6,
          departureTime: `${10 + (detection.hours ?? 4)}:00`,
        }
      );

    case "route_blocked": {
      const safest = getSafestRoute();

      return {
        scenarioId: "adhoc-route_blocked",
        scenarioName: "Route blocked",
        type: "route_change",
        areaId,
        inputs: {},
        riskLevel: "critical",
        riskScore: 95,
        operability: "blocked",
        recommendation: safest
          ? `The selected route is blocked. Reroute via ${safest.name} (risk ${safest.risk.score}/100) instead.`
          : "The selected route is blocked. Select an alternative route before departure.",
        keyFactors: [
          "The selected route is unavailable",
          "An alternative route must be selected before departure",
        ],
      };
    }
  }
}
