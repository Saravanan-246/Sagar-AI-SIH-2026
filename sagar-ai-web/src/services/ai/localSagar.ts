import marineData from "../../data/marine.json";
import alertsData from "../../data/alerts.json";
import fishingZones from "../../data/fishingZones.json";
import boundaries from "../../data/boundaries.json";
import productivityData from "../../data/productivity.json";

import {
  analyzeIntent,
  type SupportedLanguage,
  type SagarIntent,
} from "./intent";

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

export type SagarResponse = {
  text: string;
  intent: SagarIntent;
  language: SupportedLanguage;
  confidence: number;
  evidence: SagarEvidence[];
};

type MarineArea = (typeof marineData.areas)[number];

type AlertRecord =
  (typeof alertsData)[number];

type FishingZone =
  (typeof fishingZones)[number];

type Boundary =
  (typeof boundaries)[number];

type ProductivityArea =
  (typeof productivityData.areas)[number];

function getArea(
  areaId?: string,
): MarineArea {
  if (areaId) {
    const found =
      marineData.areas.find(
        (area) => area.id === areaId,
      );

    if (found) {
      return found;
    }
  }

  return marineData.areas[0];
}

function getAreaByName(
  areaName: string,
): MarineArea | undefined {
  const query =
    areaName.toLowerCase();

  return marineData.areas.find(
    (area) =>
      area.name
        .toLowerCase()
        .includes(query),
  );
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
      alertsData.filter(
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
          detail: `${alert.area} · valid until ${formatDateTime(
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

function findFishingZones(
  query: string,
): FishingZone[] {
  const text = query.toLowerCase();

  return fishingZones.filter(
    (zone) => {
      return (
        zone.status === "active" &&
        (zone.name
          .toLowerCase()
          .includes(text) ||
          zone.summary
            .toLowerCase()
            .includes(text) ||
          zone.recommendation
            .toLowerCase()
            .includes(text))
      );
    },
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

function generateEnglish(
  intent: SagarIntent,
  area: MarineArea,
  query: string,
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
        `It affects ${highest.area}. ${highest.recommendation}`,
      ].join(" ");
    }

    case "pfz": {
      const candidates =
        fishingZones
          .filter(
            (zone) =>
              zone.status ===
                "active" &&
              (zone.type === "pfz" ||
                zone.type ===
                  "fishing_zone"),
          )
          .sort(
            (a, b) =>
              suitabilityScore(
                b.suitability,
              ) -
              suitabilityScore(
                a.suitability,
              ),
          )
          .slice(0, 3);

      if (candidates.length === 0) {
        return "No active fishing-zone candidates are available in the current data.";
      }

      const best = candidates[0];

      return [
        `The strongest current fishing candidate is ${best.name}.`,
        `Its suitability is ${best.suitability}.`,
        best.chlorophyll
          ? `Chlorophyll is ${cleanNumber(
              best.chlorophyll.value,
              2,
            )} ${best.chlorophyll.unit}`
          : "",
        best.sst
          ? `SST is ${cleanNumber(
              best.sst.value,
            )} ${best.sst.unit}.`
          : "",
        `${best.recommendation}`,
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

      return `தற்போது ${active.length} கடல் எச்சரிக்கைகள் உள்ளன. முக்கியமான எச்சரிக்கை: ${highest.title}. இது ${highest.area} பகுதியை பாதிக்கிறது. ${highest.recommendation}`;
    }

    case "pfz": {
      const best =
        fishingZones
          .filter(
            (zone) =>
              zone.status ===
                "active" &&
              zone.type === "pfz",
          )
          .sort(
            (a, b) =>
              suitabilityScore(
                b.suitability,
              ) -
              suitabilityScore(
                a.suitability,
              ),
          )[0];

      if (!best) {
        return "தற்போது பொருத்தமான மீன்பிடி பகுதி கிடைக்கவில்லை.";
      }

      return `${best.name} தற்போது நல்ல மீன்பிடி வாய்ப்புள்ள பகுதியாக உள்ளது. Chlorophyll ${cleanNumber(
        best.chlorophyll?.value,
        2,
      )} mg/m3 மற்றும் SST ${cleanNumber(
        best.sst?.value,
      )} °C. ${best.recommendation}`;
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
      const best =
        fishingZones
          .filter(
            (zone) =>
              zone.status ===
                "active" &&
              zone.type === "pfz",
          )
          .sort(
            (a, b) =>
              suitabilityScore(
                b.suitability,
              ) -
              suitabilityScore(
                a.suitability,
              ),
          )[0];

      return best
        ? `${best.name} మంచి చేపల వేట అవకాశాన్ని చూపుతోంది. Chlorophyll ${cleanNumber(
            best.chlorophyll?.value,
            2,
          )} mg/m3 మరియు SST ${cleanNumber(
            best.sst?.value,
          )} °C. ${best.recommendation}`
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
      const best =
        fishingZones
          .filter(
            (zone) =>
              zone.status ===
                "active" &&
              zone.type === "pfz",
          )
          .sort(
            (a, b) =>
              suitabilityScore(
                b.suitability,
              ) -
              suitabilityScore(
                a.suitability,
              ),
          )[0];

      return best
        ? `${best.name} നല്ല മത്സ്യബന്ധന സാധ്യത കാണിക്കുന്നു. Chlorophyll ${cleanNumber(
            best.chlorophyll?.value,
            2,
          )} mg/m3, SST ${cleanNumber(
            best.sst?.value,
          )} °C. ${best.recommendation}`
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
      const best =
        fishingZones
          .filter(
            (zone) =>
              zone.status ===
                "active" &&
              zone.type === "pfz",
          )
          .sort(
            (a, b) =>
              suitabilityScore(
                b.suitability,
              ) -
              suitabilityScore(
                a.suitability,
              ),
          )[0];

      return best
        ? `${best.name} ಉತ್ತಮ ಮೀನುಗಾರಿಕೆ ಸಾಧ್ಯತೆಯನ್ನು ತೋರಿಸುತ್ತದೆ. Chlorophyll ${cleanNumber(
            best.chlorophyll?.value,
            2,
          )} mg/m3 ಮತ್ತು SST ${cleanNumber(
            best.sst?.value,
          )} °C. ${best.recommendation}`
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
      const best =
        fishingZones
          .filter(
            (zone) =>
              zone.status ===
                "active" &&
              zone.type === "pfz",
          )
          .sort(
            (a, b) =>
              suitabilityScore(
                b.suitability,
              ) -
              suitabilityScore(
                a.suitability,
              ),
          )[0];

      return best
        ? `${best.name} बेहतर मछली पकड़ने की संभावना दिखाता है। Chlorophyll ${cleanNumber(
            best.chlorophyll?.value,
            2,
          )} mg/m3 और SST ${cleanNumber(
            best.sst?.value,
          )} °C है। ${best.recommendation}`
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
): string {
  switch (language) {
    case "ta":
      return generateTamil(
        intent,
        area,
      );

    case "te":
      return generateTelugu(
        intent,
        area,
      );

    case "ml":
      return generateMalayalam(
        intent,
        area,
      );

    case "kn":
      return generateKannada(
        intent,
        area,
      );

    case "hi":
      return generateHindi(
        intent,
        area,
      );

    default:
      return generateEnglish(
        intent,
        area,
        query,
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

  const area = getArea(
    options.areaId,
  );

  const text = generateResponse(
    analysis.intent,
    preferredLanguage,
    area,
    query,
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