import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";

export type RiskLevel =
  | "low"
  | "moderate"
  | "high"
  | "critical"
  | "unknown";

type RiskIndicatorProps = {
  level: RiskLevel;
  score?: number;
  title?: string;
  description?: string;
  compact?: boolean;
};

const riskConfig = {
  low: {
    label: "Low risk",
    icon: ShieldCheck,
    className: "risk-low",
  },
  moderate: {
    label: "Moderate risk",
    icon: AlertTriangle,
    className: "risk-moderate",
  },
  high: {
    label: "High risk",
    icon: ShieldAlert,
    className: "risk-high",
  },
  critical: {
    label: "Critical risk",
    icon: ShieldAlert,
    className: "risk-critical",
  },
  unknown: {
    label: "Risk unavailable",
    icon: CheckCircle2,
    className: "risk-unknown",
  },
} as const;

export default function RiskIndicator({
  level,
  score,
  title = "Marine risk",
  description,
  compact = false,
}: RiskIndicatorProps) {
  const config = riskConfig[level];
  const Icon = config.icon;

  const safeScore =
    typeof score === "number"
      ? Math.max(0, Math.min(100, score))
      : undefined;

  return (
    <section
      className={[
        "risk-indicator",
        compact ? "risk-indicator-compact" : "",
        config.className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${title}: ${config.label}`}
    >
      <div className="risk-indicator-header">
        <div className="risk-indicator-heading">
          <div className="risk-indicator-icon">
            <Icon size={18} strokeWidth={2.2} />
          </div>

          <div className="risk-indicator-title-group">
            <span className="risk-indicator-label">
              {title}
            </span>

            <span className="risk-indicator-level">
              {config.label}
            </span>
          </div>
        </div>

        {safeScore !== undefined && (
          <div className="risk-indicator-score">
            <span className="risk-indicator-score-value">
              {safeScore}
            </span>

            <span className="risk-indicator-score-unit">
              /100
            </span>
          </div>
        )}
      </div>

      {safeScore !== undefined && (
        <div
          className="risk-indicator-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={safeScore}
          aria-label="Risk score"
        >
          <span
            className="risk-indicator-bar-fill"
            style={{ width: `${safeScore}%` }}
          />
        </div>
      )}

      {description && (
        <p className="risk-indicator-description">
          {description}
        </p>
      )}
    </section>
  );
}