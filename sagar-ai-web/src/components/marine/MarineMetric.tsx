import type { LucideIcon } from "lucide-react";

import "./MarineMetric.css";

type MarineMetricProps = {
  label: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  status?: "normal" | "warning" | "danger" | "muted";
  trend?: "up" | "down" | "stable";
  detail?: string;
};

export default function MarineMetric({
  label,
  value,
  unit,
  icon: Icon,
  status = "normal",
  trend,
  detail,
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
    </div>
  );
}