import type { ChatLanguage, LanguageContext } from "../../types/chat";
import type { AgentEvidence } from "../agents/agentTypes";
import type { RoutePlan } from "../../types/route";
import type { Alert } from "../../types/alert";
import type { RankedFishingZone } from "../ocean/zoneRanking";
import type { WhatIfComparison } from "../../api/responseShaper";

/** Current readings behind an answer, taken from the pipeline's own
 * evidence - never estimated here. */
export interface MarineReadings {
  waveHeightM?: number;
  windSpeedKnots?: number;
  sstC?: number;
}

export interface FallbackFacts {
  intent: string;
  areaName?: string;
  riskLevel?: string;
  riskScore?: number;
  route?: RoutePlan | null;
  zones?: RankedFishingZone[];
  alerts?: Alert[];
  whatIf?: WhatIfComparison;
  readings?: MarineReadings;
  /** Risk-agent key factors (English) - used only to spot flagged hazards. */
  keyFactors?: string[];
  /** Data is stale/estimated and the reply must say so. */
  freshnessWarning?: boolean;
  /** Source names behind the answer (evidence answers). */
  dataSources?: string[];
  /** Overall data confidence (evidence answers). */
  confidenceLevel?: "HIGH" | "MEDIUM" | "LOW";
}

type ConfidenceWord = "HIGH" | "MEDIUM" | "LOW";

type RiskWord = "low" | "moderate" | "high" | "critical";
type HazardKind = "strongWind" | "roughSea" | "lightning" | "cyclone";

/*
 * Template sets are keyed by language AND script: a Tanglish user gets
 * Tamil in Latin letters, not formal Tamil script. Every template only
 * joins facts Sagar already computed - no number or name is created
 * here. This is the no-LLM path; the LLM narrator is preferred when
 * it is available and passes the guard.
 */
type TemplateKey = "ta" | "ta-latn" | "hi" | "hi-latn";

interface TemplateSet {
  defaultArea: string;
  risk: Record<RiskWord, (area: string) => string>;
  riskWord: Record<RiskWord, string>;
  readings: (parts: { wave?: string; wind?: string }) => string;
  sst: (value: string) => string;
  hazard: (names: string) => string;
  hazardNames: Record<HazardKind, string>;
  alerts: (count: number, area: string) => string;
  freshness: string;
  route: (route: string, km: string, level: string) => string;
  routeDecision: Record<RoutePlan["routeDecision"], string>;
  zone: (zone: string, area: string) => string;
  whatIf: (before: number, after: number) => string;
  generic: (area: string) => string;
  evidenceIntro: (area: string) => string;
  evidenceSources: (names: string) => string;
  confidence: Record<ConfidenceWord, string>;
}

const TEMPLATES: Record<TemplateKey, TemplateSet> = {
  ta: {
    defaultArea: "இந்தப் பகுதி",
    risk: {
      low: (area) => `${area} அருகே தற்போது கடல் நிலை பாதுகாப்பானது, risk குறைவு.`,
      moderate: (area) =>
        `${area} அருகே நிலைமை நிர்வகிக்கக்கூடியதாக உள்ளது, ஆனாலும் எச்சரிக்கையாக இருங்கள்.`,
      high: (area) =>
        `${area} அருகே இப்போது செல்வது பரிந்துரைக்கப்படவில்லை - நிலைமை ஆபத்தானது.`,
      critical: (area) =>
        `${area} அருகே இப்போது கடலுக்குச் செல்ல வேண்டாம் - நிலைமை மிகவும் ஆபத்தானது.`,
    },
    riskWord: { low: "குறைவு", moderate: "மிதமானது", high: "அதிகம்", critical: "மிக அதிகம்" },
    readings: ({ wave, wind }) =>
      [wave && `அலை உயரம் ${wave} m`, wind && `காற்றின் வேகம் ${wind} knots`]
        .filter(Boolean)
        .join(", ") + ".",
    sst: (value) => `கடல் மேற்பரப்பு வெப்பநிலை (SST) ${value}°C.`,
    hazard: (names) => `${names} எச்சரிக்கை பதிவாகியுள்ளது.`,
    hazardNames: {
      strongWind: "பலத்த காற்று",
      roughSea: "கொந்தளிப்பான கடல்",
      lightning: "மின்னல்",
      cyclone: "புயல்",
    },
    alerts: (count, area) => `${area} அருகே தற்போது ${count} எச்சரிக்கை(கள்) உள்ளன.`,
    freshness: "இந்தத் தரவு சமீபத்தியது அல்ல - புறப்படும் முன் மீண்டும் சரிபார்க்கவும்.",
    route: (route, km, level) => `${route} பாதை - தொலைவு சுமார் ${km} கி.மீ, risk ${level}.`,
    routeDecision: {
      preferred: "இது பரிந்துரைக்கப்பட்ட பாதை.",
      caution: "கவனத்துடன் செல்லவும்.",
      avoid: "இந்தப் பாதையைத் தவிர்க்கவும்.",
      blocked: "இந்தப் பாதை தற்போது மூடப்பட்டுள்ளது.",
    },
    // Says plainly this is the top-ranked record in Sagar's configured
    // PFZ dataset, not a live-verified "best right now" claim.
    zone: (zone, area) =>
      `${area} அருகே, Sagar-இன் கட்டமைக்கப்பட்ட PFZ தரவுத்தொகுப்பில் ${zone} அதிக மதிப்பெண் பெற்ற பகுதியாக உள்ளது.`,
    whatIf: (before, after) =>
      `இந்த மாற்றத்துடன், ஆபத்து நிலை ${before}/100 இலிருந்து ${after}/100 ஆக மாறும்.`,
    generic: (area) => `${area} க்கான தற்போதைய தகவலை கீழே காணலாம்.`,
    evidenceIntro: (area) => `இந்த மதிப்பீடு ${area} பகுதிக்கானது.`,
    evidenceSources: (names) => `பயன்படுத்திய தரவு: ${names}.`,
    confidence: {
      HIGH: "தரவு நம்பகத்தன்மை: அதிகம்.",
      MEDIUM: "தரவு நம்பகத்தன்மை: நடுத்தரம் - பெரும்பாலும் Sagar-இன் prototype தரவு, நேரடி அரசு அளவீடுகள் இல்லை.",
      LOW: "தரவு நம்பகத்தன்மை: குறைவு - தரவு பழையது அல்லது மதிப்பீடு மட்டுமே.",
    },
  },
  "ta-latn": {
    defaultArea: "indha area",
    risk: {
      low: (area) => `${area} pakkathula ippo kadal nilamai safe dhaan, risk low.`,
      moderate: (area) => `${area} pakkathula nilamai paravaillai, aana konjam kavanama irunga.`,
      high: (area) => `${area} pakkathula ippo poga vendam - risk high ah irukku.`,
      critical: (area) => `${area} pakkathula ippo kadalukku poga vendam - nilamai romba aabathu.`,
    },
    riskWord: { low: "low", moderate: "moderate", high: "high", critical: "critical" },
    readings: ({ wave, wind }) =>
      [wave && `alai ${wave} m`, wind && `kaathu ${wind} knots`].filter(Boolean).join(", ") +
      " irukku.",
    sst: (value) => `SST ${value}°C.`,
    hazard: (names) => `${names} alert flag aagirukku.`,
    hazardNames: {
      strongWind: "Strong wind",
      roughSea: "Rough sea",
      lightning: "Lightning",
      cyclone: "Cyclone",
    },
    alerts: (count, area) => `${area} pakkathula ippo ${count} active alert irukku.`,
    freshness: "Indha data konjam pazhasu - kilambura munnadi thirumba check pannunga.",
    route: (route, km, level) => `${route} route - sumaar ${km} km, risk ${level}.`,
    routeDecision: {
      preferred: "Idhu recommended route dhaan.",
      caution: "Kavanama ponga.",
      avoid: "Indha route-a avoid pannunga.",
      blocked: "Indha route ippo blocked.",
    },
    zone: (zone, area) =>
      `${area} pakkathula, Sagar-oda configured PFZ data-la ${zone} dhaan top-ranked zone.`,
    whatIf: (before, after) =>
      `Indha maatram vandha, risk ${before}/100-la irundhu ${after}/100 aagum.`,
    generic: (area) => `${area}-kku ippo irukka information keezha paarunga.`,
    evidenceIntro: (area) => `Indha assessment ${area}-kku dhaan.`,
    evidenceSources: (names) => `Use panna data: ${names}.`,
    confidence: {
      HIGH: "Data confidence high.",
      MEDIUM: "Data confidence medium - perusa Sagar prototype data, live government reading illa.",
      LOW: "Data confidence low - data pazhasu illa estimate mattum dhaan.",
    },
  },
  hi: {
    defaultArea: "इस क्षेत्र",
    risk: {
      low: (area) => `${area} के पास अभी समुद्री स्थिति सुरक्षित है, risk कम है।`,
      moderate: (area) => `${area} के पास स्थिति सामान्य है, फिर भी सतर्क रहें।`,
      high: (area) => `${area} के पास अभी जाने की सलाह नहीं है - स्थिति जोखिम भरी है।`,
      critical: (area) => `${area} के पास अभी समुद्र में न जाएं - स्थिति बेहद गंभीर है।`,
    },
    riskWord: { low: "कम", moderate: "मध्यम", high: "अधिक", critical: "गंभीर" },
    readings: ({ wave, wind }) =>
      [wave && `लहरों की ऊंचाई ${wave} m`, wind && `हवा की गति ${wind} knots`]
        .filter(Boolean)
        .join(" और ") + " है।",
    sst: (value) => `समुद्र सतह का तापमान (SST) ${value}°C है।`,
    hazard: (names) => `${names} की चेतावनी दर्ज है।`,
    hazardNames: {
      strongWind: "तेज़ हवा",
      roughSea: "उबड़-खाबड़ समुद्र",
      lightning: "बिजली",
      cyclone: "चक्रवात",
    },
    alerts: (count, area) => `${area} के पास अभी ${count} सक्रिय चेतावनी(याँ) हैं।`,
    freshness: "यह डेटा ताज़ा नहीं है - निकलने से पहले दोबारा जाँच लें।",
    route: (route, km, level) => `${route} मार्ग - दूरी लगभग ${km} किमी, risk ${level}।`,
    routeDecision: {
      preferred: "यह सुझाया गया मार्ग है।",
      caution: "सावधानी से जाएं।",
      avoid: "इस मार्ग से बचें।",
      blocked: "यह मार्ग अभी बंद है।",
    },
    zone: (zone, area) =>
      `${area} के पास, Sagar के कॉन्फ़िगर किए गए PFZ डेटा में ${zone} सबसे अधिक रैंक वाला क्षेत्र है।`,
    whatIf: (before, after) =>
      `इस बदलाव के साथ, जोखिम स्तर ${before}/100 से ${after}/100 हो जाएगा।`,
    generic: (area) => `${area} के लिए अभी उपलब्ध जानकारी नीचे दी गई है।`,
    evidenceIntro: (area) => `यह आकलन ${area} के लिए है।`,
    evidenceSources: (names) => `इस्तेमाल किया गया डेटा: ${names}।`,
    confidence: {
      HIGH: "डेटा विश्वसनीयता: उच्च।",
      MEDIUM: "डेटा विश्वसनीयता: मध्यम - ज़्यादातर Sagar का prototype डेटा, सीधी सरकारी रीडिंग नहीं।",
      LOW: "डेटा विश्वसनीयता: कम - डेटा पुराना है या सिर्फ़ अनुमान है।",
    },
  },
  "hi-latn": {
    defaultArea: "is area",
    risk: {
      low: (area) => `${area} ke paas abhi samundar ki halat safe hai, risk low hai.`,
      moderate: (area) => `${area} ke paas halat theek hai, lekin dhyan se rehna.`,
      high: (area) => `${area} ke paas abhi jaana theek nahi hai - risk high hai.`,
      critical: (area) => `${area} ke paas abhi samundar mein mat jaao - halat bahut khatarnak hai.`,
    },
    riskWord: { low: "low", moderate: "moderate", high: "high", critical: "critical" },
    readings: ({ wave, wind }) =>
      [wave && `lehrein ${wave} m`, wind && `hawa ${wind} knots`].filter(Boolean).join(" aur ") +
      " hai.",
    sst: (value) => `SST ${value}°C hai.`,
    hazard: (names) => `${names} ka alert flag hua hai.`,
    hazardNames: {
      strongWind: "Strong wind",
      roughSea: "Rough sea",
      lightning: "Lightning",
      cyclone: "Cyclone",
    },
    alerts: (count, area) => `${area} ke paas abhi ${count} active alert hai.`,
    freshness: "Yeh data thoda purana hai - nikalne se pehle dobara check karo.",
    route: (route, km, level) => `${route} route - lagbhag ${km} km, risk ${level}.`,
    routeDecision: {
      preferred: "Yeh recommended route hai.",
      caution: "Dhyan se jaana.",
      avoid: "Is route se bacho.",
      blocked: "Yeh route abhi band hai.",
    },
    zone: (zone, area) =>
      `${area} ke paas, Sagar ke configured PFZ data mein ${zone} sabse upar ranked zone hai.`,
    whatIf: (before, after) => `Is badlaav se risk ${before}/100 se ${after}/100 ho jayega.`,
    generic: (area) => `${area} ki abhi ki jaankari neeche dekho.`,
    evidenceIntro: (area) => `Yeh assessment ${area} ke liye hai.`,
    evidenceSources: (names) => `Istemaal kiya gaya data: ${names}.`,
    confidence: {
      HIGH: "Data confidence high hai.",
      MEDIUM: "Data confidence medium hai - zyaadatar Sagar ka prototype data, seedhi sarkari reading nahi.",
      LOW: "Data confidence low hai - data purana hai ya sirf estimate hai.",
    },
  },
};

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

const HAZARD_PATTERNS: Array<[HazardKind, RegExp]> = [
  ["cyclone", /\bcyclone/i],
  ["lightning", /\blightning/i],
  ["roughSea", /\brough sea/i],
  ["strongWind", /\bstrong[- ]wind/i],
];

function flaggedHazards(keyFactors: string[] = []): HazardKind[] {
  return HAZARD_PATTERNS.filter(([, pattern]) =>
    keyFactors.some((factor) => pattern.test(factor))
  ).map(([kind]) => kind);
}

function templateKeyFor(context: Pick<LanguageContext, "language" | "style">): TemplateKey | null {
  const romanised = context.style === "tanglish" || context.style === "hinglish" || context.style === "romanized";

  if (context.language === "ta") return romanised ? "ta-latn" : "ta";
  if (context.language === "hi") return romanised ? "hi-latn" : "hi";
  return null;
}

/** "1.56" -> "1.6"; "6.8" stays; "14" stays - the same rounding the
 * English deterministic answer uses, so both show the same value. */
function formatReading(value: number | undefined, digits: number): string | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? String(Number(value.toFixed(digits)))
    : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object" && "value" in value) {
    return numberOrUndefined((value as { value: unknown }).value);
  }
  return undefined;
}

/**
 * Wave/wind/SST values from the pipeline's own evidence: the weather
 * agent's model inputs first (what the English answer states), then the
 * configured profile values, then the ocean indicators for SST.
 */
export function extractMarineReadings(evidence: AgentEvidence[] = []): MarineReadings {
  const readings: MarineReadings = {};

  const weather = evidence.find((item) => item.type === "weather");
  const weatherData = (weather?.data ?? {}) as Record<string, unknown>;
  const inputs = (weatherData.marineInputs ?? {}) as Record<string, unknown>;
  const conditions = (weatherData.conditions ?? {}) as Record<string, unknown>;

  readings.waveHeightM = numberOrUndefined(inputs.waveHeightM) ?? numberOrUndefined(conditions.waveHeightM);
  readings.windSpeedKnots =
    numberOrUndefined(inputs.windSpeedKnots) ?? numberOrUndefined(conditions.windSpeedKnots);

  // Ocean evidence carries SST either nested under `indicators` (marine
  // data agent) or at the top level (ocean agent).
  for (const item of evidence) {
    if (item.type !== "ocean" || readings.sstC !== undefined) continue;
    const data = (item.data ?? {}) as Record<string, unknown>;
    const indicators = (data.indicators ?? {}) as Record<string, unknown>;
    readings.sstC =
      numberOrUndefined(indicators.seaSurfaceTemperatureC) ??
      numberOrUndefined(data.seaSurfaceTemperatureC);
  }

  return readings;
}

// Named providers worth saying aloud; the full source list stays on
// screen in the evidence panel.
const NAMED_SOURCES: Array<[string, RegExp]> = [
  ["Open-Meteo", /open-?meteo/i],
  ["INCOIS", /incois/i],
  ["IMD", /imd/i],
  ["ISRO", /isro/i],
];

function namedSources(dataSources: string[] = []): string[] {
  const names = NAMED_SOURCES.filter(([, pattern]) =>
    dataSources.some((source) => pattern.test(source))
  ).map(([name]) => name);

  if (dataSources.some((source) => /configured|prototype|sagar/i.test(source))) {
    names.push("Sagar prototype dataset");
  }
  return names;
}

function evidenceSentences(t: TemplateSet, facts: FallbackFacts, area: string): string[] {
  const sentences = [t.evidenceIntro(area)];

  const hazards = flaggedHazards(facts.keyFactors);
  if (hazards.length > 0) {
    sentences.push(t.hazard(hazards.map((kind) => t.hazardNames[kind]).join(", ")));
  }

  const wave = formatReading(facts.readings?.waveHeightM, 1);
  const wind = formatReading(facts.readings?.windSpeedKnots, 1);
  if (wave || wind) {
    sentences.push(t.readings({ wave, wind }));
  }

  const sources = namedSources(facts.dataSources);
  if (sources.length > 0) {
    sentences.push(t.evidenceSources(sources.join(", ")));
  }

  if (facts.confidenceLevel) {
    sentences.push(t.confidence[facts.confidenceLevel]);
  }

  return sentences;
}

function conditionSentences(t: TemplateSet, facts: FallbackFacts, area: string): string[] {
  const sentences: string[] = [];
  const level = riskWord(facts.riskLevel);

  sentences.push(t.risk[level](area));

  const wave = formatReading(facts.readings?.waveHeightM, 1);
  const wind = formatReading(facts.readings?.windSpeedKnots, 1);
  if (wave || wind) {
    sentences.push(t.readings({ wave, wind }));
  }

  if (facts.intent === "marine_conditions") {
    const sst = formatReading(facts.readings?.sstC, 1);
    if (sst) sentences.push(t.sst(sst));
  }

  const hazards = flaggedHazards(facts.keyFactors);
  if (hazards.length > 0) {
    sentences.push(t.hazard(hazards.map((kind) => t.hazardNames[kind]).join(", ")));
  }

  return sentences;
}

/**
 * A short, template-based (non-AI) answer in Tamil/Hindi - native script
 * or romanised, matching how the user wrote - built only from the same
 * structured facts Sagar's deterministic pipeline already computed. No
 * number or name is invented; only the connecting language changes.
 * Returns null for English (the existing deterministic English answer
 * is used as-is) and for languages without templates yet.
 */
export function buildDeterministicAnswer(
  language: LanguageContext | ChatLanguage | string,
  facts: FallbackFacts
): string | null {
  const context =
    typeof language === "string"
      ? { language: language as ChatLanguage, style: "native" as const }
      : language;
  const key = templateKeyFor(context);

  if (!key) {
    return null;
  }

  const t = TEMPLATES[key];
  const area = facts.areaName ?? t.defaultArea;
  const sentences: string[] = [];

  if (facts.whatIf) {
    sentences.push(t.whatIf(facts.whatIf.before.riskScore, facts.whatIf.after.riskScore));
  } else if (
    facts.route &&
    (facts.intent === "route" || facts.intent === "safety" || facts.intent === "alerts")
  ) {
    const route = facts.route;
    sentences.push(
      t.route(route.name, route.distanceKm.toFixed(1), t.riskWord[riskWord(route.risk.level)]),
      t.routeDecision[route.routeDecision]
    );
    // "Any alerts on my route?" - the route verdict plus the alerts.
    if (facts.intent === "alerts" && facts.alerts && facts.alerts.length > 0) {
      sentences.push(t.alerts(facts.alerts.length, area));
    }
  } else if (facts.intent === "pfz" && facts.zones && facts.zones.length > 0) {
    const best = facts.zones.find((zone) => zone.recommendation === "PREFER") ?? facts.zones[0];
    sentences.push(t.zone(best.name, area));
  } else if (
    facts.intent === "alerts" &&
    facts.alerts &&
    facts.alerts.length > 0
  ) {
    sentences.push(t.alerts(facts.alerts.length, area));
  } else if (facts.intent === "evidence") {
    sentences.push(...evidenceSentences(t, facts, area));
  } else if (typeof facts.riskScore === "number" && facts.riskLevel) {
    sentences.push(...conditionSentences(t, facts, area));
  } else {
    sentences.push(t.generic(area));
  }

  if (facts.freshnessWarning) {
    sentences.push(t.freshness);
  }

  // Romanised templates start some sentences with a lowercase word.
  return sentences
    .map((sentence) => sentence.charAt(0).toUpperCase() + sentence.slice(1))
    .join(" ");
}

export default buildDeterministicAnswer;
