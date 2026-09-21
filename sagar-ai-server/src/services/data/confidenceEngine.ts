import type { ConfidenceAssessment, FreshnessStatus } from "./dataContract";

export interface ConfidenceInput {
  /** Whether the core decision (risk/route/zone) this turn was
   * computed from Sagar's local prototype dataset - true for every
   * response today, since no live source feeds the decision itself. */
  coreIsPrototype: boolean;
  /** Freshness of any real external reading attached as supplementary
   * evidence this turn (undefined if none was available/attempted). */
  verifiedFreshness?: FreshnessStatus;
  /** Set when a verified reading came from a point meaningfully far
   * from the requested area (e.g. no coastal coverage), so confidence
   * isn't overstated for a reading that isn't really "here". */
  verifiedFarFromArea?: boolean;
  /** Set when this reading is NOT supplementary evidence attached to a
   * prototype-based core decision, but is itself the directly-sourced
   * external forecast/model reading (e.g. one Open-Meteo marine-model
   * grid point). Avoids the "local prototype dataset" framing below,
   * which doesn't apply - there is no prototype core involved. */
  isDirectModelReading?: boolean;
}

/**
 * A small, explainable HIGH/MEDIUM/LOW model - deliberately not a
 * numeric score. There is nothing statistically fitted to justify a
 * number like "92.73%", and a fake-precise figure would misrepresent
 * how this is actually computed (a handful of plain rules over
 * freshness/completeness, not a trained or calibrated model).
 */
export function computeConfidence(input: ConfidenceInput): ConfidenceAssessment {
  if (input.isDirectModelReading) {
    switch (input.verifiedFreshness) {
      case "LIVE":
      case "RECENT":
        return {
          level: "MEDIUM",
          explanation:
            "Open-Meteo's own forecast model output for this point - not a local prototype dataset and not a sensor observation.",
        };
      case "AGING":
        return {
          level: "LOW",
          explanation:
            "Open-Meteo's own forecast model output for this point, though the cached copy is older than ideal - not a sensor observation.",
        };
      default:
        return {
          level: "LOW",
          explanation:
            "Open-Meteo's own forecast model output for this point - not a sensor observation, and its freshness could not be confirmed.",
        };
    }
  }

  if (input.coreIsPrototype) {
    if (input.verifiedFreshness && !input.verifiedFarFromArea) {
      return {
        level: "MEDIUM",
        explanation:
          "Based on Sagar's local prototype dataset, supported by a real external reading for this area.",
      };
    }

    if (input.verifiedFreshness && input.verifiedFarFromArea) {
      return {
        level: "MEDIUM",
        explanation:
          "Based on Sagar's local prototype dataset. A real external reading exists nearby but from outside the exact area, so it's shown for regional context only.",
      };
    }

    return {
      level: "MEDIUM",
      explanation:
        "Based on Sagar's local prototype dataset - live government sources are not connected for this reading.",
    };
  }

  // No path currently produces a fully-verified-live core decision -
  // kept for when a real source is eventually wired into the decision
  // itself, not just attached as supplementary evidence.
  switch (input.verifiedFreshness) {
    case "LIVE":
    case "RECENT":
      return {
        level: "HIGH",
        explanation: "Recent data from a verified source.",
      };
    case "AGING":
      return {
        level: "MEDIUM",
        explanation: "The verified source's data is older than ideal.",
      };
    default:
      return {
        level: "LOW",
        explanation: "No sufficiently fresh verified source was available.",
      };
  }
}

export default computeConfidence;
