import type { RiskBasis } from "../services/agents/agentTypes";
import { computeDataState, formatIST, type DataState } from "./freshness";

export interface RiskBasisLabel {
  /** Short line shown next to the risk score. */
  text: string;
  state: DataState;
}

const THRESHOLDS = "prototype thresholds (team-set, not official limits)";

/**
 * Plain-language statement of what a risk score was calculated from.
 * `serviceFailed` covers the case where no backend risk result exists
 * and the page is showing the area's pre-set prototype score instead.
 */
export function describeRiskBasis(
  basis: RiskBasis | undefined,
  { loading = false, serviceFailed = false }: { loading?: boolean; serviceFailed?: boolean } = {},
): RiskBasisLabel {
  if (loading && !basis) {
    return { text: "Calculating risk…", state: "UNAVAILABLE" };
  }

  if (serviceFailed || !basis) {
    return {
      text: "Risk service unavailable — showing the area's pre-set prototype score.",
      state: "FALLBACK",
    };
  }

  const inputs = basis.inputs;
  const validAt = inputs?.modelPoint?.validAt ?? null;
  const validLabel = formatIST(validAt);

  switch (basis.conditions) {
    case "model":
      return {
        text:
          `Risk from Open-Meteo model wind & waves${validLabel ? ` (valid ${validLabel})` : ""}` +
          ` · visibility & hazards from configured data · ${THRESHOLDS}.`,
        state: computeDataState("model", validAt),
      };

    case "partial-model": {
      const kind = (value?: { kind: string }) => (value?.kind === "model" ? "model" : "configured");
      return {
        text:
          `Risk from mixed data: waves ${kind(inputs?.waveHeightM)}, wind ${kind(inputs?.windSpeedKnots)}` +
          `${validLabel ? ` (model valid ${validLabel})` : ""}` +
          `${inputs?.fallbackReason ? ` — ${inputs.fallbackReason}` : ""} · ${THRESHOLDS}.`,
        state: computeDataState("model", validAt),
      };
    }

    case "configured-fallback":
      return {
        text:
          "Risk from configured prototype dataset — model data unavailable" +
          `${inputs?.fallbackReason ? ` (${inputs.fallbackReason})` : ""} · ${THRESHOLDS}.`,
        state: "FALLBACK",
      };

    default:
      return { text: "Risk inputs unavailable.", state: "UNAVAILABLE" };
  }
}
