export type ZoneRecommendation = "PREFER" | "MONITOR" | "AVOID";

/**
 * The map's local fishing-zone dataset only carries a `suitability`
 * tier (High/Moderate/Low) - it doesn't carry the PREFER/MONITOR/AVOID
 * label the backend's PFZ ranking already computes for Chat. This is a
 * deterministic, presentation-only mapping onto the SAME tiers Sagar
 * already uses everywhere else for this exact concept, not a new
 * fact - the suitability value driving it is real, unmodified data.
 */
export function deriveZoneRecommendation(
  suitability?: string
): ZoneRecommendation {
  const normalized = (suitability ?? "").trim().toLowerCase();

  if (normalized === "high") {
    return "PREFER";
  }

  if (normalized === "low") {
    return "AVOID";
  }

  return "MONITOR";
}

/** Matches the risk-semantic palette used across the app. */
export function zoneRecommendationColor(
  recommendation: ZoneRecommendation
): string {
  switch (recommendation) {
    case "PREFER":
      return "#159a68";

    case "AVOID":
      return "#d64545";

    case "MONITOR":
    default:
      return "#c98700";
  }
}
