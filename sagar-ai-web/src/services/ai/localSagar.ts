import fishingZonesRaw from "../../data/fishingZones.json";
import boundaries from "../../data/boundaries.json";
import productivityData from "../../data/productivity.json";

import { getAlerts, getAlertsByArea } from "../alerts/alertService";
import { getMarineAreas } from "../marine/marineData";
import { rankFishingZones, type RankedFishingZone } from "../ocean/zoneRanking";
import { getSafestRoute } from "../routes/routeService";
import { getScenarios, runScenario } from "../scenarios/scenarioEngine";

import { runMarineDataAgent } from "../agents/marineDataAgent";
import { runWeatherAgent } from "../agents/weatherAgent";
import { runGeoAgent } from "../agents/geoAgent";
import { runOceanAgent } from "../agents/oceanAgent";
import { runRiskAgent } from "../agents/riskAgent";
import type { AgentRequest, RiskAgentData } from "../agents/agentTypes";

import {
  analyzeIntent,
  type SupportedLanguage,
  type SagarIntent,
} from "./intent";

const alertsData = getAlerts();
const fishingZones = fishingZonesRaw.zones;

/*
 * Offline "what if wind/waves become stronger" detection - a small,
 * English-only subset of the backend's multi-language whatIfEngine
 * (see Phase 4 report for the honest scope note on this). Detecting
 * it here, deterministically, is what lets Chat's offline fallback
 * run the SAME scenario engine used by the standalone What-If page
 * (services/scenarios/scenarioEngine.ts) instead of a separate
 * approximation.
 */
const WIND_INCREASE_PATTERN =
  /\bwhat (?:if|happens if)\b.*\b(wind|breeze)\b.*\b(stronger|increase|higher|worse|picks? up)\b/i;
const WAVE_INCREASE_PATTERN =
  /\bwhat (?:if|happens if)\b.*\b(wave|waves|sea|swell)\b.*\b(stronger|increase|higher|worse|rougher)\b/i;

function detectOfflineWhatIf(
  message: string
): "wind_increase" | "wave_increase" | null {
  if (WIND_INCREASE_PATTERN.test(message)) return "wind_increase";
  if (WAVE_INCREASE_PATTERN.test(message)) return "wave_increase";
  return null;
}

type AskSagarOptions = {
  language?: string;
  areaId?: string;
};

export type SagarEvidence = {
  id: string;
  source: string;
  title: string;
  value?: string;
  detail?: string;
  status: "available" | "stale" | "unavailable";
};

export type SagarZoneSummary = {
  /** Kept so the map panel can look up the zone's real polygon/centroid
   * in fishingZones.json - the same lookup chatMapFocus.ts already
   * does for the online path, no coordinates invented here. */
  id: string;
  name: string;
  recommendation: "PREFER" | "MONITOR" | "AVOID";
  suitability?: string;
  reasons: string[];
};

export type SagarWhatIfSummary = {
  question: string;
  before: { riskScore: number; riskLevel: string };
  after: { riskScore: number; riskLevel: string; operability?: string };
  impact: string;
  recommendation?: string;
};

export type SagarResponse = {
  text: string;
  intent: SagarIntent;
  language: SupportedLanguage;
  confidence: number;
  evidence: SagarEvidence[];
  /** Real computed values (hazardEngine/zoneRanking/routeService/
   * scenarioEngine) - not fabricated for the offline path, and not
   * always present (only when the corresponding intent computed
   * them), matching how the online structured panel already works. */
  riskLevel?: string;
  riskScore?: number;
  keyFactors?: string[];
  /** The area the offline engine actually resolved this answer for -
   * lets the map focus on the right place, same as the online path's
   * affectedArea.id. */
  areaId?: string;
  zones?: SagarZoneSummary[];
  /** The full RoutePlan (not a stripped summary) - chatMapFocus.ts
   * needs the real origin/destination coordinates to sync the map,
   * exactly like the online path's result.route. */
  route?: RoutePlan | null;
  whatIf?: SagarWhatIfSummary;
};

import type { MarineArea as AppMarineArea } from "../../types/marine";
import type { RoutePlan } from "../../types/route";

type RawMarineArea = AppMarineArea;

/*
 * Sagar's local (offline-fallback) responder was originally written
 * against a richer, display-oriented shape (value/unit wrapper
 * objects). Rather than rewriting every language template, the raw
 * dataset is adapted into that shape once here.
 */
type MarineArea = {
  id: string;
  name: string;
  region?: string;
  conditions: {
    windSpeed: { value: number; unit: string };
    windDirection: string;
    waveHeight: { value: number; unit: string };
    seaState: { label: string };
    visibility: { value: number; unit: string };
    rainProbability: { value: number };
  };
  tide: {
    currentPhase: string;
    currentHeight: { value: number; unit: string };
    nextHighTide: {
      time: string;
      height: { value: number; unit: string };
    };
    nextLowTide: {
      time: string;
      height: { value: number; unit: string };
    };
  };
  marineIndicators: {
    chlorophyll: { value: number; unit: string };
    sst: { value: number };
    productivitySignal: string;
  };
  safety: {
    overallRisk: string;
    riskScore: number;
    operatingRecommendation: string;
    /** Real computed reasons from hazardEngine.assessHazards() -
     * absent only if the hazard assessment itself failed. */
    keyFactors?: string[];
  };
};

type AlertRecord =
  (typeof alertsData)[number];

type FishingZone =
  (typeof fishingZones)[number];

type Boundary =
  (typeof boundaries)[number];

type ProductivityArea =
  (typeof productivityData.areas)[number];

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `sagar-offline-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/*
 * Runs the SAME agent pipeline the backend's /risk endpoint runs
 * (marine-data + weather + geo + ocean feeding riskAgent) so the
 * offline score is produced by the identical scoring formula as the
 * online path, instead of the differently-weighted hazardEngine
 * formula that used to live here and could diverge from the backend
 * for the same input conditions.
 */
async function computeAreaRisk(area: RawMarineArea): Promise<{
  riskLevel: RiskAgentData["riskLevel"];
  riskScore: number;
  recommendation: string;
  keyFactors: string[];
}> {
  const baseRequest: AgentRequest = {
    requestId: createRequestId(),
    message: "",
    language: "en",
    intent: "safety",
    context: { areaId: area.id, areaName: area.name },
    area,
  };

  const [marineData, weather, geo, ocean] = await Promise.all([
    runMarineDataAgent(baseRequest),
    runWeatherAgent(baseRequest),
    runGeoAgent(baseRequest),
    runOceanAgent(baseRequest),
  ]);

  const risk = await runRiskAgent({
    ...baseRequest,
    previousFindings: [
      ...marineData.findings,
      ...weather.findings,
      ...geo.findings,
      ...ocean.findings,
    ],
    previousEvidence: [
      ...marineData.evidence,
      ...weather.evidence,
      ...geo.evidence,
      ...ocean.evidence,
    ],
    parameters: {
      ...baseRequest.parameters,
      agentResponses: { "marine-data": marineData, weather, geo, ocean },
    },
  });

  const data = risk.data as RiskAgentData | undefined;

  if (!data) {
    throw new Error(risk.error ?? "Offline risk assessment failed.");
  }

  return {
    riskLevel: data.riskLevel,
    riskScore: data.riskScore,
    recommendation: data.recommendation,
    // findings[0] is the overall "X operational risk" summary; the rest
    // are the individual contributing-factor findings.
    keyFactors: data.factors.slice(1).map((factor) => factor.summary),
  };
}

async function toDisplayArea(area: RawMarineArea): Promise<MarineArea> {
  // Real computed risk, produced by the same agent pipeline/formula the
  // backend uses for the online path (see computeAreaRisk) - not a
  // static read of the area's baked-in riskScore. Falls back to that
  // baked value only if the assessment itself throws (should not
  // happen offline, since it has no network dependency).
  let overallRisk = area.safety.overallRisk;
  let riskScore = area.safety.riskScore;
  let operatingRecommendation = area.safety.recommendation;
  let keyFactors: string[] | undefined;

  try {
    const assessment = await computeAreaRisk(area);
    overallRisk = assessment.riskLevel;
    riskScore = assessment.riskScore;
    operatingRecommendation = assessment.recommendation;
    keyFactors = assessment.keyFactors;
  } catch (error) {
    console.warn("Sagar offline: risk assessment failed, using baseline data:", error);
  }

  return {
    id: area.id,
    name: area.name,
    region: area.region,
    conditions: {
      windSpeed: {
        value: area.conditions.windSpeedKnots,
        unit: "kn",
      },
      windDirection: area.conditions.windDirection,
      waveHeight: {
        value: area.conditions.waveHeightM,
        unit: "m",
      },
      seaState: {
        label: titleCase(area.conditions.seaState),
      },
      visibility: {
        value: area.conditions.visibilityKm,
        unit: "km",
      },
      rainProbability: {
        value: area.conditions.rainProbability,
      },
    },
    tide: {
      currentPhase: titleCase(area.tide.currentState),
      currentHeight: {
        value: area.tide.currentHeightM ?? 0,
        unit: "m",
      },
      nextHighTide: {
        time: area.tide.nextHigh.time,
        height: {
          value: area.tide.nextHigh.heightM,
          unit: "m",
        },
      },
      nextLowTide: {
        time: area.tide.nextLow.time,
        height: {
          value: area.tide.nextLow.heightM,
          unit: "m",
        },
      },
    },
    marineIndicators: {
      chlorophyll: {
        value: area.marineIndicators.chlorophyllMgM3,
        unit: "mg/m3",
      },
      sst: {
        value: area.marineIndicators.seaSurfaceTemperatureC,
      },
      productivitySignal: area.marineIndicators.productivitySignal,
    },
    safety: {
      overallRisk,
      riskScore,
      operatingRecommendation,
      keyFactors,
    },
  };
}

async function getArea(
  areaId?: string,
): Promise<MarineArea> {
  const areas = getMarineAreas();

  if (areaId) {
    const found =
      areas.find(
        (area) => area.id === areaId,
      );

    if (found) {
      return toDisplayArea(found);
    }
  }

  return toDisplayArea(areas[0]);
}

async function getAreaByName(
  areaName: string,
): Promise<MarineArea | undefined> {
  const query =
    areaName.toLowerCase();

  const found = getMarineAreas().find(
    (area) =>
      area.name
        .toLowerCase()
        .includes(query),
  );

  return found ? toDisplayArea(found) : undefined;
}

function cleanNumber(
  value: number | undefined,
  digits = 1,
) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return "—";
  }

  return value.toFixed(digits);
}

function titleCase(
  value: string,
) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function riskLabel(
  value: string,
) {
  return titleCase(value);
}

function getEvidence(
  area: MarineArea,
  intent: SagarIntent,
): SagarEvidence[] {
  const evidence: SagarEvidence[] = [];

  evidence.push({
    id: `marine-${area.id}`,
    source: "Marine condition layer",
    title: `${area.name} marine conditions`,
    value: `Wind ${cleanNumber(
      area.conditions.windSpeed.value,
    )} ${area.conditions.windSpeed.unit} · Waves ${cleanNumber(
      area.conditions.waveHeight.value,
    )} ${area.conditions.waveHeight.unit}`,
    detail: `Sea state: ${area.conditions.seaState.label}`,
    status: "available",
  });

  if (
    intent === "alerts" ||
    intent === "safety" ||
    intent === "route" ||
    intent === "marine_conditions"
  ) {
    const relevantAlerts =
      getAlertsByArea(area.id).filter(
        (alert) =>
          alert.status === "active",
      );

    relevantAlerts
      .slice(0, 3)
      .forEach((alert) => {
        evidence.push({
          id: alert.id,
          source: "Marine alert layer",
          title: alert.title,
          value: alert.severity.toUpperCase(),
          detail: `${alert.location.name} · valid until ${formatDateTime(
            alert.validUntil,
          )}`,
          status: "available",
        });
      });
  }

  if (
    intent === "pfz" ||
    intent === "productivity"
  ) {
    evidence.push({
      id: `productivity-${area.id}`,
      source: "Productivity layer",
      title: `${area.name} productivity`,
      value: `${findProductivity(
        area.id,
      )?.current.index ?? "—"}/100`,
      detail: `Chlorophyll ${cleanNumber(
        area.marineIndicators.chlorophyll
          .value,
        2,
      )} mg/m3 · SST ${cleanNumber(
        area.marineIndicators.sst.value,
      )} °C`,
      status: "available",
    });
  }

  if (intent === "geofence") {
    boundaries
      .filter(
        (boundary) =>
          boundary.status === "active",
      )
      .slice(0, 3)
      .forEach((boundary) => {
        evidence.push({
          id: boundary.id,
          source: "Geospatial boundary layer",
          title: boundary.name,
          value: titleCase(
            boundary.restriction,
          ),
          detail:
            "Active configured boundary",
          status: "available",
        });
      });
  }

  if (intent === "tide") {
    evidence.push({
      id: `tide-${area.id}`,
      source: "Tide layer",
      title: `${area.name} tide`,
      value: titleCase(
        area.tide.currentPhase,
      ),
      detail: `Current ${cleanNumber(
        area.tide.currentHeight.value,
      )} ${area.tide.currentHeight.unit}`,
      status: "available",
    });
  }

  return evidence;
}

function findProductivity(
  areaId: string,
): ProductivityArea | undefined {
  return productivityData.areas.find(
    (area) => area.id === areaId,
  );
}

function formatDateTime(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    },
  ).format(date);
}

/** Adapts a real ranked zone back into the {name, suitability,
 * chlorophyll, sst} shape every language template already reads, so
 * only the zone SOURCE changes (naive local sort -> real ranking with
 * chlorophyll/SST/geofence scoring) without rewriting each template. */
function bestZoneFields(bestZone: RankedFishingZone | undefined) {
  if (!bestZone) return undefined;
  return {
    name: bestZone.name,
    suitability: bestZone.suitability,
    chlorophyll: bestZone.chlorophyllMgM3,
    sst: bestZone.seaSurfaceTemperatureC,
  };
}

function generateEnglish(
  intent: SagarIntent,
  area: MarineArea,
  query: string,
  bestZone?: RankedFishingZone,
): string {
  const conditions =
    area.conditions;
  const safety = area.safety;

  switch (intent) {
    case "safety": {
      return [
        `For ${area.name}, the current overall marine risk is ${riskLabel(
          safety.overallRisk,
        )} (${safety.riskScore}/100).`,
        `Wind is ${cleanNumber(
          conditions.windSpeed.value,
        )} ${conditions.windSpeed.unit}, wave height is ${cleanNumber(
          conditions.waveHeight.value,
        )} ${conditions.waveHeight.unit}, and the sea state is ${conditions.seaState.label.toLowerCase()}.`,
        `${safety.operatingRecommendation}`,
      ].join(" ");
    }

    case "alerts": {
      const active = alertsData.filter(
        (alert) =>
          alert.status === "active",
      );

      if (active.length === 0) {
        return "There are no active marine alerts in the current alert set.";
      }

      const highest =
        [...active].sort(
          (a, b) =>
            severityScore(
              b.severity,
            ) -
            severityScore(a.severity),
        )[0];

      return [
        `There are ${active.length} active marine alerts in the current alert set.`,
        `The highest-severity alert is ${highest.title} (${highest.severity}).`,
        `It affects ${highest.location.name}. ${highest.recommendation}`,
      ].join(" ");
    }

    case "pfz": {
      const best = bestZoneFields(bestZone);

      if (!best) {
        return "No active fishing-zone candidates are available in the current data.";
      }

      return [
        // "strongest current" claimed live-verified conditions; `best`
        // is only ever the top-ranked record in Sagar's static
        // configured PFZ dataset (see services/ocean/zoneRanking.ts).
        `${best.name} is the highest-ranked zone in Sagar's configured PFZ dataset.`,
        `Its suitability is ${best.suitability}.`,
        typeof best.chlorophyll === "number"
          ? `Chlorophyll is ${cleanNumber(
              best.chlorophyll,
              2,
            )} mg/m3`
          : "",
        typeof best.sst === "number"
          ? `SST is ${cleanNumber(
              best.sst,
            )} °C.`
          : "",
        "Confirm current marine safety conditions before proceeding to this zone.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "route": {
      return [
        `For route planning from ${area.name}, the current marine context is ${riskLabel(
          safety.overallRisk,
        )} risk.`,
        `Wind is ${cleanNumber(
          conditions.windSpeed.value,
        )} ${conditions.windSpeed.unit}, waves are ${cleanNumber(
          conditions.waveHeight.value,
        )} ${conditions.waveHeight.unit}, and sea state is ${conditions.seaState.label.toLowerCase()}.`,
        `A safer route should avoid active hazard sectors and configured restricted boundaries rather than optimizing distance alone.`,
      ].join(" ");
    }

    case "productivity": {
      const productivity =
        findProductivity(area.id);

      if (!productivity) {
        return `Productivity information is not available for ${area.name}.`;
      }

      return [
        `${area.name} currently has a productivity index of ${productivity.current.index}/100 (${productivity.current.status}).`,
        `The recent trend is ${productivity.trend.direction} with a ${productivity.trend.changePercent}% change over ${productivity.trend.period}.`,
        productivity.interpretation,
      ].join(" ");
    }

    case "geofence": {
      const activeBoundaries =
        boundaries.filter(
          (boundary) =>
            boundary.status === "active",
        );

      if (
        activeBoundaries.length === 0
      ) {
        return "There are no active configured marine boundaries in the current boundary layer.";
      }

      const restricted =
        activeBoundaries.filter(
          (boundary) =>
            boundary.restriction ===
              "no_entry" ||
            boundary.restriction ===
              "no_fishing",
        );

      return [
        `${activeBoundaries.length} active marine boundaries are configured.`,
        restricted.length > 0
          ? `Restricted sectors include ${restricted
              .slice(0, 2)
              .map(
                (boundary) =>
                  boundary.name,
              )
              .join(
                " and ",
              )}.`
          : "",
        "Routes and fishing plans should avoid no-entry or no-fishing boundaries unless the operation is authorized.",
      ]
        .filter(Boolean)
        .join(" ");
    }

    case "tide": {
      return [
        `At ${area.name}, the current tide phase is ${area.tide.currentPhase}.`,
        `The current height is ${cleanNumber(
          area.tide.currentHeight.value,
        )} ${area.tide.currentHeight.unit}.`,
        `Next high tide: ${formatDateTime(
          area.tide.nextHighTide.time,
        )} at ${cleanNumber(
          area.tide.nextHighTide.height
            .value,
        )} ${area.tide.nextHighTide.height.unit}.`,
        `Next low tide: ${formatDateTime(
          area.tide.nextLowTide.time,
        )} at ${cleanNumber(
          area.tide.nextLowTide.height.value,
        )} ${area.tide.nextLowTide.height.unit}.`,
      ].join(" ");
    }

    case "marine_conditions": {
      return [
        `Current conditions near ${area.name}:`,
        `wind ${cleanNumber(
          conditions.windSpeed.value,
        )} ${conditions.windSpeed.unit} from ${conditions.windDirection},`,
        `waves ${cleanNumber(
          conditions.waveHeight.value,
        )} ${conditions.waveHeight.unit},`,
        `sea state ${conditions.seaState.label},`,
        `visibility ${cleanNumber(
          conditions.visibility.value,
        )} ${conditions.visibility.unit},`,
        `and rain probability ${cleanNumber(
          conditions.rainProbability.value,
        )}%.`,
      ].join(" ");
    }

    default: {
      return [
        `Sagar is currently focused on ${area.name}.`,
        `The marine risk is ${riskLabel(
          safety.overallRisk,
        )} with a score of ${safety.riskScore}/100.`,
        "Ask me about sea conditions, safety, alerts, fishing zones, routes, tide, productivity or restricted areas.",
      ].join(" ");
    }
  }
}

function generateTamil(
  intent: SagarIntent,
  area: MarineArea,
  bestZone?: RankedFishingZone,
): string {
  const c = area.conditions;
  const s = area.safety;

  switch (intent) {
    case "safety":
      return `${area.name} பகுதியில் தற்போதைய கடல் ஆபத்து நிலை ${translateRiskTa(
        s.overallRisk,
      )} (${s.riskScore}/100). காற்று ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, அலை உயரம் ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, கடல் நிலை ${c.seaState.label}. ${s.operatingRecommendation}`;

    case "alerts": {
      const active =
        alertsData.filter(
          (alert) =>
            alert.status === "active",
        );

      if (active.length === 0) {
        return "தற்போதைய எச்சரிக்கை தரவுகளில் செயலில் உள்ள கடல் எச்சரிக்கைகள் இல்லை.";
      }

      const highest =
        [...active].sort(
          (a, b) =>
            severityScore(
              b.severity,
            ) -
            severityScore(a.severity),
        )[0];

      return `தற்போது ${active.length} கடல் எச்சரிக்கைகள் உள்ளன. முக்கியமான எச்சரிக்கை: ${highest.title}. இது ${highest.location.name} பகுதியை பாதிக்கிறது. ${highest.recommendation}`;
    }

    case "pfz": {
      const best = bestZoneFields(bestZone);

      if (!best) {
        return "தற்போது பொருத்தமான மீன்பிடி பகுதி கிடைக்கவில்லை.";
      }

      // "தற்போது...நல்ல" ("currently...good") claimed live-verified
      // conditions; matches the English fix above.
      return `${best.name} Sagar-இன் கட்டமைக்கப்பட்ட PFZ தரவுத்தொகுப்பில் அதிக மதிப்பெண் பெற்ற பகுதி. Chlorophyll ${cleanNumber(
        best.chlorophyll,
        2,
      )} mg/m3 மற்றும் SST ${cleanNumber(
        best.sst,
      )} °C. `;
    }

    case "route":
      return `${area.name} பகுதியில் தற்போதைய கடல் ஆபத்து ${translateRiskTa(
        s.overallRisk,
      )}. காற்று ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, அலை ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}. தூரத்தை மட்டும் பார்க்காமல், ஆபத்து பகுதிகள் மற்றும் தடைசெய்யப்பட்ட எல்லைகளை தவிர்த்து பாதுகாப்பான பாதையை தேர்வு செய்ய வேண்டும்.`;

    case "productivity": {
      const p = findProductivity(
        area.id,
      );

      if (!p) {
        return `${area.name} பகுதிக்கான உற்பத்தித் தகவல் இல்லை.`;
      }

      return `${area.name} உற்பத்தி குறியீடு ${p.current.index}/100. தற்போதைய போக்கு ${translateTrendTa(
        p.trend.direction,
      )}. ${p.interpretation}`;
    }

    case "geofence": {
      const active =
        boundaries.filter(
          (boundary) =>
            boundary.status === "active",
        );

      return `தற்போது ${active.length} கடல் எல்லைகள் செயலில் உள்ளன. தடை செய்யப்பட்ட அல்லது பாதுகாக்கப்பட்ட பகுதிகளுக்குள் செல்லாமல் பாதையை மாற்ற வேண்டும்.`;
    }

    case "tide":
      return `${area.name} பகுதியில் தற்போதைய அலை நிலை ${area.tide.currentPhase}. தற்போதைய உயரம் ${cleanNumber(
        area.tide.currentHeight.value,
      )} ${area.tide.currentHeight.unit}. அடுத்த உயர் அலை ${formatDateTime(
        area.tide.nextHighTide.time,
      )} மற்றும் அடுத்த தாழ் அலை ${formatDateTime(
        area.tide.nextLowTide.time,
      )}.`;

    case "marine_conditions":
      return `${area.name} பகுதியில் காற்று ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, அலை உயரம் ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, கடல் நிலை ${c.seaState.label}, பார்வைத்திறன் ${cleanNumber(
        c.visibility.value,
      )} ${c.visibility.unit}.`;

    default:
      return `${area.name} பகுதியில் கடல் ஆபத்து நிலை ${translateRiskTa(
        s.overallRisk,
      )}. கடல் நிலை, எச்சரிக்கைகள், மீன்பிடி பகுதிகள், அலை நேரம் அல்லது பாதுகாப்பான பாதை பற்றி கேட்கலாம்.`;
  }
}

function generateTelugu(
  intent: SagarIntent,
  area: MarineArea,
  bestZone?: RankedFishingZone,
): string {
  const c = area.conditions;
  const s = area.safety;

  switch (intent) {
    case "safety":
      return `${area.name} ప్రాంతంలో ప్రస్తుత సముద్ర ప్రమాద స్థాయి ${s.overallRisk} (${s.riskScore}/100). గాలి ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, అలల ఎత్తు ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, సముద్ర స్థితి ${c.seaState.label}. ${s.operatingRecommendation}`;

    case "alerts":
      return "ప్రస్తుతం క్రియాశీల సముద్ర హెచ్చరికలను పరిశీలించాలి. తుఫాను, మెరుపు మరియు బలమైన గాలుల ప్రభావాన్ని ప్రయాణానికి ముందు తనిఖీ చేయండి.";

    case "pfz": {
      const best = bestZoneFields(bestZone);

      return best
        ? `${best.name} మంచి చేపల వేట అవకాశాన్ని చూపుతోంది. Chlorophyll ${cleanNumber(
            best.chlorophyll,
            2,
          )} mg/m3 మరియు SST ${cleanNumber(
            best.sst,
          )} °C. `
        : "ప్రస్తుతం క్రియాశీల PFZ సమాచారం అందుబాటులో లేదు.";
    }

    case "route":
      return `${area.name} వద్ద ప్రమాద స్థాయి ${s.overallRisk}. సురక్షిత మార్గం ఎంచుకునేటప్పుడు అలలు, గాలి, చురుకైన ప్రమాదాలు మరియు పరిమిత ప్రాంతాలను కలిపి పరిశీలించాలి.`;

    case "tide":
      return `${area.name} వద్ద ప్రస్తుత టైడ్ దశ ${area.tide.currentPhase}. ప్రస్తుత ఎత్తు ${cleanNumber(
        area.tide.currentHeight.value,
      )} ${area.tide.currentHeight.unit}.`;

    case "marine_conditions":
      return `${area.name} వద్ద గాలి ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, అలలు ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, సముద్ర స్థితి ${c.seaState.label}.`;

    default:
      return `${area.name} కోసం సముద్ర ప్రమాద స్థాయి ${s.overallRisk}. సముద్ర పరిస్థితులు, హెచ్చరికలు, PFZ, టైడ్ లేదా మార్గం గురించి అడగండి.`;
  }
}

function generateMalayalam(
  intent: SagarIntent,
  area: MarineArea,
  bestZone?: RankedFishingZone,
): string {
  const c = area.conditions;
  const s = area.safety;

  switch (intent) {
    case "safety":
      return `${area.name} മേഖലയിൽ നിലവിലെ സമുദ്ര അപകടനില ${s.overallRisk} (${s.riskScore}/100) ആണ്. കാറ്റ് ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, തിരമാല ഉയരം ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, കടൽ നില ${c.seaState.label}. ${s.operatingRecommendation}`;

    case "alerts":
      return "നിലവിലെ സജീവ സമുദ്ര മുന്നറിയിപ്പുകൾ പരിശോധിക്കണം. ചുഴലിക്കാറ്റ്, മിന്നൽ, ശക്തമായ കാറ്റ്, ഉയർന്ന തിരമാലകൾ എന്നിവ ശ്രദ്ധിക്കുക.";

    case "pfz": {
      const best = bestZoneFields(bestZone);

      return best
        ? `${best.name} നല്ല മത്സ്യബന്ധന സാധ്യത കാണിക്കുന്നു. Chlorophyll ${cleanNumber(
            best.chlorophyll,
            2,
          )} mg/m3, SST ${cleanNumber(
            best.sst,
          )} °C. `
        : "സജീവ PFZ വിവരങ്ങൾ ഇപ്പോൾ ലഭ്യമല്ല.";
    }

    case "route":
      return `${area.name} മേഖലയിൽ അപകടനില ${s.overallRisk} ആണ്. സുരക്ഷിത റൂട്ട് തിരഞ്ഞെടുക്കുമ്പോൾ തിരമാല, കാറ്റ്, സജീവ അപകടങ്ങൾ, നിയന്ത്രിത മേഖലകൾ എന്നിവ ഒരുമിച്ച് പരിഗണിക്കണം.`;

    case "tide":
      return `${area.name} ൽ നിലവിലെ വേലിയേറ്റ ഘട്ടം ${area.tide.currentPhase} ആണ്. നിലവിലെ ഉയരം ${cleanNumber(
        area.tide.currentHeight.value,
      )} ${area.tide.currentHeight.unit}.`;

    case "marine_conditions":
      return `${area.name} ൽ കാറ്റ് ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, തിരമാല ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, കടൽ നില ${c.seaState.label}.`;

    default:
      return `${area.name} ൽ നിലവിലെ സമുദ്ര അപകടനില ${s.overallRisk} ആണ്. കടൽസ്ഥിതി, മുന്നറിയിപ്പുകൾ, മത്സ്യബന്ധന മേഖലകൾ, ടൈഡ് അല്ലെങ്കിൽ റൂട്ട് കുറിച്ച് ചോദിക്കാം.`;
  }
}

function generateKannada(
  intent: SagarIntent,
  area: MarineArea,
  bestZone?: RankedFishingZone,
): string {
  const c = area.conditions;
  const s = area.safety;

  switch (intent) {
    case "safety":
      return `${area.name} ಪ್ರದೇಶದಲ್ಲಿ ಪ್ರಸ್ತುತ ಸಮುದ್ರ ಅಪಾಯದ ಮಟ್ಟ ${s.overallRisk} (${s.riskScore}/100). ಗಾಳಿ ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, ಅಲೆ ಎತ್ತರ ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, ಸಮುದ್ರ ಸ್ಥಿತಿ ${c.seaState.label}. ${s.operatingRecommendation}`;

    case "alerts":
      return "ಪ್ರಸ್ತುತ ಸಕ್ರಿಯ ಸಮುದ್ರ ಎಚ್ಚರಿಕೆಗಳನ್ನು ಪರಿಶೀಲಿಸಿ. ಚಂಡಮಾರುತ, ಮಿಂಚು, ಬಲವಾದ ಗಾಳಿ ಮತ್ತು ಹೆಚ್ಚಿನ ಅಲೆಗಳ ಅಪಾಯವನ್ನು ಗಮನಿಸಿ.";

    case "pfz": {
      const best = bestZoneFields(bestZone);

      return best
        ? `${best.name} ಉತ್ತಮ ಮೀನುಗಾರಿಕೆ ಸಾಧ್ಯತೆಯನ್ನು ತೋರಿಸುತ್ತದೆ. Chlorophyll ${cleanNumber(
            best.chlorophyll,
            2,
          )} mg/m3 ಮತ್ತು SST ${cleanNumber(
            best.sst,
          )} °C. `
        : "ಪ್ರಸ್ತುತ ಸಕ್ರಿಯ PFZ ಮಾಹಿತಿ ಲಭ್ಯವಿಲ್ಲ.";
    }

    case "route":
      return `${area.name} ನಲ್ಲಿ ಅಪಾಯದ ಮಟ್ಟ ${s.overallRisk}. ಸುರಕ್ಷಿತ ಮಾರ್ಗವನ್ನು ಆಯ್ಕೆ ಮಾಡುವಾಗ ಅಲೆಗಳು, ಗಾಳಿ, ಸಕ್ರಿಯ ಅಪಾಯಗಳು ಮತ್ತು ನಿರ್ಬಂಧಿತ ಪ್ರದೇಶಗಳನ್ನು ಒಟ್ಟಿಗೆ ಪರಿಗಣಿಸಬೇಕು.`;

    case "tide":
      return `${area.name} ನಲ್ಲಿ ಪ್ರಸ್ತುತ ಜ್ವಾರದ ಹಂತ ${area.tide.currentPhase}. ಪ್ರಸ್ತುತ ಎತ್ತರ ${cleanNumber(
        area.tide.currentHeight.value,
      )} ${area.tide.currentHeight.unit}.`;

    case "marine_conditions":
      return `${area.name} ನಲ್ಲಿ ಗಾಳಿ ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, ಅಲೆ ಎತ್ತರ ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, ಸಮುದ್ರ ಸ್ಥಿತಿ ${c.seaState.label}.`;

    default:
      return `${area.name} ನಲ್ಲಿ ಸಮುದ್ರ ಅಪಾಯದ ಮಟ್ಟ ${s.overallRisk}. ಸಮುದ್ರ ಪರಿಸ್ಥಿತಿಗಳು, ಎಚ್ಚರಿಕೆಗಳು, PFZ, ಜ್ವಾರ ಅಥವಾ ಮಾರ್ಗದ ಬಗ್ಗೆ ಕೇಳಿ.`;
  }
}

function generateHindi(
  intent: SagarIntent,
  area: MarineArea,
  bestZone?: RankedFishingZone,
): string {
  const c = area.conditions;
  const s = area.safety;

  switch (intent) {
    case "safety":
      return `${area.name} क्षेत्र में वर्तमान समुद्री जोखिम ${s.overallRisk} (${s.riskScore}/100) है। हवा ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, लहरों की ऊंचाई ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit} और समुद्र की स्थिति ${c.seaState.label} है। ${s.operatingRecommendation}`;

    case "alerts":
      return "वर्तमान सक्रिय समुद्री चेतावनियों की जांच करें। चक्रवात, बिजली, तेज हवा और ऊंची लहरों पर विशेष ध्यान दें।";

    case "pfz": {
      const best = bestZoneFields(bestZone);

      return best
        ? `${best.name} बेहतर मछली पकड़ने की संभावना दिखाता है। Chlorophyll ${cleanNumber(
            best.chlorophyll,
            2,
          )} mg/m3 और SST ${cleanNumber(
            best.sst,
          )} °C है। `
        : "वर्तमान सक्रिय PFZ जानकारी उपलब्ध नहीं है।";
    }

    case "route":
      return `${area.name} में जोखिम ${s.overallRisk} है। सुरक्षित मार्ग चुनते समय लहरों, हवा, सक्रिय खतरों और प्रतिबंधित क्षेत्रों को एक साथ देखना चाहिए।`;

    case "tide":
      return `${area.name} में वर्तमान ज्वार की स्थिति ${area.tide.currentPhase} है। वर्तमान ऊंचाई ${cleanNumber(
        area.tide.currentHeight.value,
      )} ${area.tide.currentHeight.unit} है।`;

    case "marine_conditions":
      return `${area.name} में हवा ${cleanNumber(
        c.windSpeed.value,
      )} ${c.windSpeed.unit}, लहरें ${cleanNumber(
        c.waveHeight.value,
      )} ${c.waveHeight.unit}, और समुद्र की स्थिति ${c.seaState.label} है।`;

    default:
      return `${area.name} में समुद्री जोखिम ${s.overallRisk} है। समुद्री स्थिति, चेतावनी, PFZ, ज्वार या मार्ग के बारे में पूछें।`;
  }
}

function generateResponse(
  intent: SagarIntent,
  language: SupportedLanguage,
  area: MarineArea,
  query: string,
  bestZone?: RankedFishingZone,
): string {
  switch (language) {
    case "ta":
      return generateTamil(
        intent,
        area,
        bestZone,
      );

    case "te":
      return generateTelugu(
        intent,
        area,
        bestZone,
      );

    case "ml":
      return generateMalayalam(
        intent,
        area,
        bestZone,
      );

    case "kn":
      return generateKannada(
        intent,
        area,
        bestZone,
      );

    case "hi":
      return generateHindi(
        intent,
        area,
        bestZone,
      );

    default:
      return generateEnglish(
        intent,
        area,
        query,
        bestZone,
      );
  }
}

function severityScore(
  severity: string,
) {
  switch (severity) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "moderate":
      return 2;
    default:
      return 1;
  }
}

function suitabilityScore(
  suitability: string,
) {
  switch (suitability) {
    case "favourable":
      return 3;
    case "moderate":
      return 2;
    default:
      return 1;
  }
}

function translateRiskTa(
  risk: string,
) {
  switch (risk) {
    case "low":
      return "குறைவு";
    case "moderate":
      return "மிதமான";
    case "high":
      return "அதிகம்";
    case "critical":
      return "மிகவும் அதிகம்";
    default:
      return risk;
  }
}

function translateTrendTa(
  trend: string,
) {
  switch (trend) {
    case "rising":
      return "அதிகரித்து வருகிறது";
    case "declining":
      return "குறைந்து வருகிறது";
    default:
      return "நிலையாக உள்ளது";
  }
}

export async function askSagar(
  message: string,
  options: AskSagarOptions = {},
): Promise<SagarResponse> {
  const query = message.trim();

  if (!query) {
    return {
      text: "Please ask me a marine question.",
      intent: "general",
      language: "en",
      confidence: 0.1,
      evidence: [],
    };
  }

  const analysis =
    analyzeIntent(query);

  const preferredLanguage =
    isSupportedLanguage(
      options.language,
    )
      ? options.language
      : analysis.language;

  const area = await getArea(
    options.areaId,
  );

  // A real "what if wind/waves get stronger" question runs the same
  // deterministic scenario engine the standalone What-If page uses
  // (services/scenarios/scenarioEngine.ts) - never an LLM, and never a
  // separate risk formula from the rest of the app.
  const whatIfKind = detectOfflineWhatIf(query);

  if (whatIfKind) {
    const weatherScenario = getScenarios().find(
      (scenario) => scenario.type === "weather_change",
    );

    if (weatherScenario) {
      const scenarioInputs =
        whatIfKind === "wind_increase"
          ? { windSpeedIncreasePercent: 20, waveIncreasePercent: 0, areaId: area.id }
          : { windSpeedIncreasePercent: 0, waveIncreasePercent: 20, areaId: area.id };

      try {
        const result = runScenario(weatherScenario, scenarioInputs);

        const questionText =
          whatIfKind === "wind_increase"
            ? "wind speed increases by 20%"
            : "wave height increases by 20%";

        const impact = `Risk ${
          result.riskScore > area.safety.riskScore ? "increases" : "changes"
        } from ${area.safety.riskScore}/100 (${area.safety.overallRisk}) to ${result.riskScore}/100 (${result.riskLevel}) if ${questionText}.`;

        return {
          text: `${impact} ${result.recommendation}`.trim(),
          intent: "productivity",
          language: preferredLanguage,
          confidence: 0.85,
          evidence: getEvidence(area, "safety"),
          areaId: area.id,
          riskLevel: result.riskLevel,
          riskScore: result.riskScore,
          whatIf: {
            question: questionText,
            before: { riskScore: area.safety.riskScore, riskLevel: area.safety.overallRisk },
            after: {
              riskScore: result.riskScore,
              riskLevel: result.riskLevel,
              operability: result.operability,
            },
            impact,
            recommendation: result.recommendation,
          },
        };
      } catch (error) {
        console.warn("Sagar offline: what-if scenario failed:", error);
      }
    }
  }

  const bestZone: RankedFishingZone | undefined =
    analysis.intent === "pfz"
      ? (rankFishingZones().find((zone) => zone.recommendation === "PREFER") ??
        rankFishingZones()[0])
      : undefined;

  const safestRoute = analysis.intent === "route" ? getSafestRoute() : undefined;

  const text = generateResponse(
    analysis.intent,
    preferredLanguage,
    area,
    query,
    bestZone,
  );

  return {
    text,
    intent: analysis.intent,
    language: preferredLanguage,
    confidence: analysis.confidence,
    evidence: getEvidence(
      area,
      analysis.intent,
    ),
    areaId: area.id,
    riskLevel:
      analysis.intent === "safety" || analysis.intent === "alerts"
        ? area.safety.overallRisk
        : undefined,
    riskScore:
      analysis.intent === "safety" || analysis.intent === "alerts"
        ? area.safety.riskScore
        : undefined,
    keyFactors:
      analysis.intent === "safety" || analysis.intent === "alerts"
        ? area.safety.keyFactors
        : undefined,
    zones: bestZone
      ? [
          {
            id: bestZone.id,
            name: bestZone.name,
            recommendation: bestZone.recommendation,
            suitability: bestZone.suitability,
            reasons: bestZone.reasons,
          },
        ]
      : undefined,
    route: safestRoute ?? undefined,
  };
}

function isSupportedLanguage(
  value?: string,
): value is SupportedLanguage {
  return (
    value === "en" ||
    value === "ta" ||
    value === "te" ||
    value === "ml" ||
    value === "kn" ||
    value === "hi"
  );
}

export default askSagar;