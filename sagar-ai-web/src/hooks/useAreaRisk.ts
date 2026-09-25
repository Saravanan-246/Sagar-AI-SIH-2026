import { useEffect, useState } from "react";

import { fetchRisk } from "../services/api/sagarApiClient";
import type { RiskBasis } from "../services/agents/agentTypes";

export interface AreaRisk {
  riskScore: number;
  riskLevel: string;
  basis?: RiskBasis;
}

/**
 * The backend risk result (/api/risk - the same calculation Chat uses)
 * for one area, with the basis that says which marine values it was
 * calculated from.
 *
 * refreshKey: pass the valid time of the model data currently shown
 * (e.g. useMarineConditions().validAt) so the score is recalculated
 * whenever the displayed model run changes - keeping the displayed
 * conditions and the risk on the same data.
 */
export function useAreaRisk(
  areaId: string | null | undefined,
  refreshKey?: string | null,
) {
  const [risk, setRisk] = useState<AreaRisk | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "failed">("idle");
  const [riskAreaId, setRiskAreaId] = useState<string | null>(null);

  useEffect(() => {
    if (!areaId) {
      setRisk(null);
      setStatus("idle");
      return;
    }

    let cancelled = false;
    setStatus("loading");

    fetchRisk({ areaId })
      .then((response) => {
        if (cancelled) return;
        if (!response.data) {
          setRisk(null);
          setStatus("failed");
          return;
        }
        setRisk({
          riskScore: response.data.riskScore,
          riskLevel: response.data.riskLevel,
          basis: response.data.basis,
        });
        setRiskAreaId(areaId);
        setStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setRisk(null);
        setStatus("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [areaId, refreshKey]);

  // Never show one area's score for another while the new one loads.
  const current = risk && riskAreaId === areaId ? risk : null;

  return { risk: current, status };
}

export default useAreaRisk;
