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

// English plus the Tamil/Telugu/Malayalam/Kannada/Hindi phrasing used
// elsewhere in the app (see services/ai/intent.ts) for the same
// "what if" question, so a hypothetical asked in any supported
// language still reaches the deterministic scenario engine below.
const WHAT_IF_PATTERN =
  /what if|what would happen|what happens if|suppose |imagine if|என்ன ஆகும்|ஆனால்.*என்ன|అయితే.*ఏమి|ఏమి జరుగుతుంది|എന്ത് സംഭവിക്കും|ಏನಾಗುತ್ತದೆ|अगर.*तो|क्या होगा/i;

const ROUTE_WORDS =
  /route|பாதை|వழి|വഴി|ಮಾರ್ಗ|मार्ग|रूट/i;
const BLOCKED_WORDS =
  /block|close|unavailable|impassable|தடை|மூடப்பட்ட|முடக்க|అడ్డుకో|మూసివేత|തടസ്സ|അടച്ച|ನಿರ್ಬಂಧ|मुंद|बंद|अवरुद्ध/i;
const LIGHTNING_WORDS =
  /lightning|மின்னல்|మెరుపు|മിന്നൽ|ಮಿಂಚು|बिजली/i;
const CYCLONE_WORDS =
  /cyclone|புயல்|சூறாவளி|తుఫాను|ചുഴലിക്കാറ്റ്|ಚಂಡಮಾರುತ|तूफान|चक्रवात/i;
const PRODUCTIVITY_WORDS =
  /productivity|உற்பத்தி|ఉత్పాదకత|ഉൽപ്പാദനക്ഷമത|ಉತ್ಪಾದಕತೆ|उत्पादकता/i;
const WAVE_WORDS =
  /wave|அலை|అల|തിര|ಅಲೆ|लहर/i;
// காற்ற (not காற்று) - the bare stem, so declined forms like காற்றின்
// ("of the wind") and காற்றால் ("by the wind") still match, not just
// the nominative காற்று.
const WIND_WORDS =
  /wind|காற்ற|గాలి|കാറ്റ്|ಗಾಳಿ|हवा/i;
const DEPART_WORDS =
  /depart|leave|புறப்பாடு|கிளம்பு|బయలుదేరు|പുറപ്പെടൽ|ಹೊರಡು|प्रस्थान|रवाना/i;
const LATER_WORDS =
  /later|delay|தாமதமாக|பிந்தி|ఆలస్యంగా|താമസിച്ച്|ತಡವಾಗಿ|देर से|विलंब/i;

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
    ROUTE_WORDS.test(text) &&
    BLOCKED_WORDS.test(text)
  ) {
    return { kind: "route_blocked" };
  }

  if (LIGHTNING_WORDS.test(text)) {
    return { kind: "lightning_active" };
  }

  if (CYCLONE_WORDS.test(text)) {
    return { kind: "cyclone_active" };
  }

  if (PRODUCTIVITY_WORDS.test(text)) {
    return { kind: "productivity_lower", percent: percent ?? 15 };
  }

  if (WAVE_WORDS.test(text)) {
    return { kind: "wave_increase", percent: percent ?? 20 };
  }

  if (WIND_WORDS.test(text)) {
    return { kind: "wind_increase", percent: percent ?? 20 };
  }

  if (
    DEPART_WORDS.test(text) &&
    LATER_WORDS.test(text)
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
