import { getMarineAreas, getMarineArea } from "../services/marine/marineData";
import { getAlerts } from "../services/alerts/alertService";
import { haversineDistanceKm } from "./geo";

import type { AppLanguage } from "../store/appStore";
import type { MarineArea } from "../types/marine";

export interface SuggestionContext {
  areaId?: string | null;
  areaName?: string | null;
  coordinates?: { latitude: number; longitude: number } | null;
  language?: AppLanguage;
}

type TemplateKey = "alerts" | "safety" | "conditions" | "zone" | "route";

type Templates = Record<
  TemplateKey,
  (area: string, destination: string) => string
>;

/**
 * All suggestion text is built from local marine/alert data only - no
 * OpenRouter/LLM call - so the welcome screen stays instant and works
 * even when the backend/AI is unavailable.
 */
const TEMPLATES: Partial<Record<AppLanguage, Templates>> = {
  en: {
    alerts: (area) => `Are there any active alerts near ${area}?`,
    safety: (area) => `Is it safe to fish near ${area} tomorrow?`,
    conditions: (area) => `What are the current sea conditions near ${area}?`,
    zone: (area) => `Which fishing zone near ${area} is best right now?`,
    route: (area, destination) =>
      `Give me the safest route from ${area} to ${destination}.`,
  },
  ta: {
    alerts: (area) => `${area} அருகில் ஏதேனும் எச்சரிக்கைகள் உள்ளதா?`,
    safety: (area) =>
      `நாளைக்கு ${area} அருகில் மீன்பிடிக்க பாதுகாப்பாக இருக்குமா?`,
    conditions: (area) =>
      `${area} அருகில் தற்போதைய கடல் நிலை எப்படி இருக்கிறது?`,
    zone: (area) => `${area} அருகில் எந்த மீன்பிடி பகுதி நல்லது?`,
    route: (area, destination) =>
      `${area} இலிருந்து ${destination} வரை பாதுகாப்பான பாதையை காட்டு.`,
  },
  hi: {
    alerts: (area) => `${area} के पास कोई सक्रिय चेतावनी है?`,
    safety: (area) => `क्या कल ${area} के पास मछली पकड़ना सुरक्षित है?`,
    conditions: (area) => `${area} के पास वर्तमान समुद्री स्थिति कैसी है?`,
    zone: (area) =>
      `${area} के पास कौन सा मछली पकड़ने का क्षेत्र सबसे अच्छा है?`,
    route: (area, destination) =>
      `${area} से ${destination} तक सबसे सुरक्षित मार्ग बताएं।`,
  },
};

function resolveArea(context: SuggestionContext): MarineArea {
  if (context.areaId || context.areaName) {
    return getMarineArea(context.areaId ?? context.areaName ?? undefined);
  }

  if (context.coordinates) {
    const areas = getMarineAreas();
    let nearest = areas[0];
    let nearestDistance = Infinity;

    for (const candidate of areas) {
      const distance = haversineDistanceKm(
        context.coordinates,
        candidate.coordinates
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = candidate;
      }
    }

    return nearest ?? getMarineArea();
  }

  return getMarineArea();
}

function resolveDestinationArea(area: MarineArea): MarineArea {
  const areas = getMarineAreas();
  return areas.find((candidate) => candidate.id !== area.id) ?? area;
}

/** Real (non-cosmetic) alerts for this area - a plain substring match
 * against the actual alert dataset, not the alertService fallback that
 * returns every alert when nothing matches a given area. */
function hasNotableAlerts(areaName: string): boolean {
  const query = areaName.trim().toLowerCase();

  if (!query) {
    return false;
  }

  return getAlerts().some((alert) => {
    const location = alert.location.name.toLowerCase();
    const matchesArea =
      location.includes(query) || query.includes(location);

    return (
      matchesArea &&
      (alert.severity === "high" || alert.severity === "critical")
    );
  });
}

/**
 * Produces exactly 4 deterministic suggested questions for the Ask
 * Sagar welcome screen, based on the currently selected area and local
 * alert data. No network/AI call is made - the same inputs always
 * produce the same 4 suggestions.
 */
export function getSuggestedQuestions(
  context: SuggestionContext = {}
): string[] {
  const area = resolveArea(context);
  const destination = resolveDestinationArea(area);

  const language = context.language ?? "en";
  const templates = TEMPLATES[language] ?? TEMPLATES.en!;

  const order: TemplateKey[] = hasNotableAlerts(area.name)
    ? ["alerts", "safety", "conditions", "zone"]
    : ["safety", "conditions", "zone", "route"];

  return order.map((key) => templates[key](area.name, destination.name));
}

export default getSuggestedQuestions;
