import {
  AlertTriangle,
  Bell,
  ShieldAlert,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";

/**
 * Shared alert/hazard presentation rules - severity -> tone/color and
 * type -> icon - so the Map's markers and the Map/Alerts pages' own
 * lists never fall out of sync by each keeping their own copy.
 */

export function alertSeverityTone(
  severity: string
): "success" | "warning" | "danger" | "neutral" {
  switch (severity) {
    case "critical":
    case "high":
      return "danger";

    case "moderate":
      return "warning";

    case "low":
      return "success";

    default:
      return "neutral";
  }
}

/** Matches the risk-semantic palette used across the app (Chat's risk
 * cards, PFZ recommendations) so "critical" always reads as the same
 * red everywhere, not a different shade per page. */
export function alertSeverityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "#9f1d2f";

    case "high":
      return "#d64545";

    case "moderate":
      return "#c98700";

    case "low":
      return "#159a68";

    default:
      return "#5b6b7a";
  }
}

export function alertTypeIcon(type: string): LucideIcon {
  switch (type) {
    case "lightning":
      return AlertTriangle;

    case "cyclone":
      return ShieldAlert;

    case "high_waves":
    case "rough_sea":
      return Waves;

    case "strong_wind":
      return Wind;

    default:
      return Bell;
  }
}

export function formatAlertType(type: string): string {
  return type
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
