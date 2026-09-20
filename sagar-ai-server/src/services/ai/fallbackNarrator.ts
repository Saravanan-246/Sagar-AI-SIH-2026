import type { ChatLanguage } from "../../types/chat";
import type { RoutePlan } from "../../types/route";
import type { Alert } from "../../types/alert";
import type { RankedFishingZone } from "../ocean/zoneRanking";
import type { WhatIfComparison } from "../../api/responseShaper";

export interface FallbackFacts {
  intent: string;
  areaName?: string;
  riskLevel?: string;
  riskScore?: number;
  route?: RoutePlan | null;
  zones?: RankedFishingZone[];
  alerts?: Alert[];
  whatIf?: WhatIfComparison;
}

type RiskWord = "low" | "moderate" | "high" | "critical";

function riskWord(level?: string): RiskWord {
  switch (level) {
    case "low":
    case "moderate":
    case "high":
    case "critical":
      return level;
    default:
      return "moderate";
  }
}

const RISK_PHRASE: Record<"ta" | "hi", Record<RiskWord, (area: string) => string>> = {
  ta: {
    low: (area) => `${area} அருகே தற்போது கடல் நிலை பாதுகாப்பானது.`,
    moderate: (area) =>
      `${area} அருகே நிலைமை நிர்வகிக்கக்கூடியதாக உள்ளது, ஆனாலும் எச்சரிக்கையாக இருங்கள்.`,
    high: (area) =>
      `${area} அருகே இப்போது செல்வது பரிந்துரைக்கப்படவில்லை - நிலைமை ஆபத்தானது.`,
    critical: (area) =>
      `${area} அருகே இப்போது கடலுக்குச் செல்ல வேண்டாம் - நிலைமை மிகவும் ஆபத்தானது.`,
  },
  hi: {
    low: (area) => `${area} के पास अभी समुद्री स्थिति सुरक्षित है।`,
    moderate: (area) =>
      `${area} के पास स्थिति सामान्य है, फिर भी सतर्क रहें।`,
    high: (area) =>
      `${area} के पास अभी जाने की सलाह नहीं है - स्थिति जोखिम भरी है।`,
    critical: (area) =>
      `${area} के पास अभी समुद्र में न जाएं - स्थिति बेहद गंभीर है।`,
  },
};

const GENERIC_PHRASE: Record<"ta" | "hi", (area: string) => string> = {
  ta: (area) => `${area} க்கான தற்போதைய தகவலை கீழே காணலாம்.`,
  hi: (area) => `${area} के लिए अभी उपलब्ध जानकारी नीचे दी गई है।`,
};

// "இப்போது...சிறந்த" / "अभी...बेहतर" (both "right now...(the) best") claimed
// live-verified current conditions for a zone that is only ever the
// top-ranked record in Sagar's static configured PFZ dataset - matches
// the English fix in chat.routes.ts's applyZoneAnswer.
const ZONE_PHRASE: Record<"ta" | "hi", (zone: string, area: string) => string> = {
  ta: (zone, area) =>
    `${area} அருகே, Sagar-இன் கட்டமைக்கப்பட்ட PFZ தரவுத்தொகுப்பில் ${zone} அதிக மதிப்பெண் பெற்ற பகுதியாக உள்ளது.`,
  hi: (zone, area) =>
    `${area} के पास, Sagar के कॉन्फ़िगर किए गए PFZ डेटा में ${zone} सबसे अधिक रैंक वाला क्षेत्र है।`,
};

const ROUTE_PHRASE: Record<"ta" | "hi", (route: string, km: string) => string> = {
  ta: (route, km) => `பாதுகாப்பான பாதை ${route}, தொலைவு சுமார் ${km} கி.மீ.`,
  hi: (route, km) => `सबसे सुरक्षित मार्ग ${route} है, दूरी लगभग ${km} किमी।`,
};

const ALERT_PHRASE: Record<"ta" | "hi", (count: number, area: string) => string> = {
  ta: (count, area) => `${area} அருகே தற்போது ${count} எச்சரிக்கை(கள்) உள்ளன.`,
  hi: (count, area) => `${area} के पास अभी ${count} सक्रिय चेतावनी(याँ) हैं।`,
};

const WHATIF_PHRASE: Record<"ta" | "hi", (before: number, after: number) => string> = {
  ta: (before, after) =>
    `இந்த மாற்றத்துடன், ஆபத்து நிலை ${before}/100 இலிருந்து ${after}/100 ஆக மாறும்.`,
  hi: (before, after) =>
    `इस बदलाव के साथ, जोखिम स्तर ${before}/100 से ${after}/100 हो जाएगा।`,
};

/**
 * A small, template-based (non-AI) 1-2 sentence answer in Tamil/Hindi,
 * built only from the same structured facts already computed by
 * Sagar's deterministic pipeline - no numbers or names are invented,
 * only the connecting language changes. Returns null for English (the
 * existing deterministic English answer is used as-is) and for any
 * other language this app doesn't have templates for yet.
 */
export function buildDeterministicAnswer(
  language: ChatLanguage | string,
  facts: FallbackFacts
): string | null {
  if (language !== "ta" && language !== "hi") {
    return null;
  }

  const area = facts.areaName ?? (language === "ta" ? "இந்தப் பகுதி" : "इस क्षेत्र");

  if (facts.whatIf) {
    return WHATIF_PHRASE[language](
      facts.whatIf.before.riskScore,
      facts.whatIf.after.riskScore
    );
  }

  if (facts.intent === "route" && facts.route) {
    return ROUTE_PHRASE[language](
      facts.route.name,
      facts.route.distanceKm.toFixed(1)
    );
  }

  if (facts.intent === "pfz" && facts.zones && facts.zones.length > 0) {
    const best =
      facts.zones.find((zone) => zone.recommendation === "PREFER") ??
      facts.zones[0];
    return ZONE_PHRASE[language](best.name, area);
  }

  if (
    (facts.intent === "alerts" || facts.intent === "safety") &&
    facts.alerts &&
    facts.alerts.length > 0 &&
    typeof facts.riskScore !== "number"
  ) {
    return ALERT_PHRASE[language](facts.alerts.length, area);
  }

  // No Tamil/Hindi template exists yet for the data/evidence answer -
  // keep the already-set English deterministic answer (built from real
  // evidence/sources) rather than falling through to the generic
  // risk-level phrase below, which would silently replace an answer
  // about "what data" with an unrelated risk-level sentence.
  if (facts.intent === "evidence") {
    return null;
  }

  if (typeof facts.riskScore === "number" && facts.riskLevel) {
    return RISK_PHRASE[language][riskWord(facts.riskLevel)](area);
  }

  return GENERIC_PHRASE[language](area);
}

export default buildDeterministicAnswer;
