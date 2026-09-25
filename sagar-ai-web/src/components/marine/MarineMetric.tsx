import type { LucideIcon } from "lucide-react";

import type { DataState } from "../../utils/freshness";
import FreshnessBadge from "./FreshnessBadge";

import "./MarineMetric.css";

/** Where a value came from and how current it is - rendered as a
 * compact footer so every number carries its own context. */
export type MetricProvenance = {
  source: string;
  /** Pre-formatted time, e.g. "Valid 14:00 IST · 20 min ago". */
  time?: string | null;
  state: DataState;
};

type MarineMetricProps = {
  label: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  status?: "normal" | "warning" | "danger" | "muted";
  trend?: "up" | "down" | "stable";
  detail?: string;
  provenance?: MetricProvenance;
};

export default function MarineMetric({
  label,
  value,
  unit,
  icon: Icon,
  status = "normal",
  trend,
  detail,
  provenance,
}: MarineMetricProps) {
  return (
    <div
      className={[
        "marine-metric",
        `marine-metric-${status}`,
      ].join(" ")}
    >
      <div className="marine-metric-top">
        <div className="marine-metric-label-wrap">
          {Icon && (
            <span className="marine-metric-icon">
              <Icon size={17} strokeWidth={2} />
            </span>
          )}

          <span className="marine-metric-label">
            {label}
          </span>
        </div>

        {trend && (
          <span
            className={[
              "marine-metric-trend",
              `marine-metric-trend-${trend}`,
            ].join(" ")}
            aria-label={`Trend ${trend}`}
          >
            {trend === "up"
              ? "↗"
              : trend === "down"
                ? "↘"
                : "→"}
          </span>
        )}
      </div>

      <div className="marine-metric-value-row">
        <span className="marine-metric-value">
          {value}
        </span>

        {unit && (
          <span className="marine-metric-unit">
            {unit}
          </span>
        )}
      </div>

      {detail && (
        <span className="marine-metric-detail">
          {detail}
        </span>
      )}

      {provenance && (
        <div className="marine-metric-provenance">
          <div className="marine-metric-provenance-text">
            <span className="marine-metric-source">{provenance.source}</span>
            {provenance.time && (
              <span className="marine-metric-time">{provenance.time}</span>
            )}
          </div>
          <FreshnessBadge state={provenance.state} />
        </div>
      )}
    </div>
  );
}